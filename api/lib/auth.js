const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

let _client;

function getJwksClient() {
  if (!_client) {
    const tenantId = process.env.ENTRA_TENANT_ID;
    if (!tenantId) throw new Error('ENTRA_TENANT_ID is not configured');
    _client = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
    });
  }
  return _client;
}

function getSigningKey(header, callback) {
  getJwksClient().getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * Validate the Bearer JWT from an incoming Azure Functions request.
 * Returns the decoded token payload on success.
 * Throws an error if the token is missing, invalid, or expired.
 */
function validateToken(req) {
  return new Promise((resolve, reject) => {
    const authHeader =
      req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reject(Object.assign(new Error('Missing or malformed Authorization header'), { status: 401 }));
    }

    const token = authHeader.slice(7);
    const tenantId = process.env.ENTRA_TENANT_ID;
    const clientId = process.env.ENTRA_CLIENT_ID;

    jwt.verify(
      token,
      getSigningKey,
      {
        audience: clientId,
        issuer: [
          `https://login.microsoftonline.com/${tenantId}/v2.0`,
          `https://sts.windows.net/${tenantId}/`,
        ],
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          return reject(Object.assign(err, { status: 401 }));
        }
        resolve(decoded);
      }
    );
  });
}

/**
 * Extract a normalized user object from a decoded Entra ID JWT payload.
 */
function extractUser(decoded) {
  return {
    id:     decoded.oid || decoded.sub,
    email:  decoded.preferred_username || decoded.upn || decoded.email || '',
    name:   decoded.name || decoded.preferred_username || '',
    roles:  decoded.roles  || [],
    groups: decoded.groups || [],
  };
}

/**
 * Middleware helper: validate token and return user, or send 401.
 * Usage:
 *   const user = await requireAuth(context, req);
 *   if (!user) return; // response already set
 */
async function requireAuth(context, req) {
  try {
    const decoded = await validateToken(req);
    return extractUser(decoded);
  } catch {
    context.res = {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
    return null;
  }
}

module.exports = { validateToken, extractUser, requireAuth };
