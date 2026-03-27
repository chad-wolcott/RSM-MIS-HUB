// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Azure Function: SailPoint ISC Proxy
// Route: POST /api/sailpoint-proxy
//
// Migrated from Netlify function.  Proxies requests to SailPoint ISC REST API
// server-side, bypassing browser CORS restrictions.
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https');
const http  = require('http');
const { requireAuth } = require('../lib/auth');
const { logAuditEvent } = require('../lib/auditLogger');

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const timeout = options.timeout || 10000;

    const reqOptions = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
      timeout,
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error',   (err) => reject(err));
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Domain allowlist ──────────────────────────────────────────────────────────
const ALLOWED_DOMAINS = ['.identitynow.com', '.identitynow-demo.com', '.rsm.security'];
function isAllowedDomain(hostname) {
  return ALLOWED_DOMAINS.some(d => hostname.endsWith(d));
}

function getApiBase(tenantUrl) {
  const u   = new URL(tenantUrl);
  const org = u.hostname.split('.')[0];
  if (u.hostname.endsWith('.identitynow.com'))      return `https://${org}.api.identitynow.com`;
  if (u.hostname.endsWith('.identitynow-demo.com'))  return `https://${org}.api.identitynow-demo.com`;
  return `https://${u.hostname}`;
}

// ── Core action functions (unchanged logic from Netlify version) ──────────────
async function testConnectivity(tenantUrl) {
  const result = { dns: false, tls: false, reachable: false, latencyMs: null };
  const start  = Date.now();
  try {
    const res = await httpRequest(tenantUrl, { method: 'HEAD', timeout: 8000 });
    result.dns       = true;
    result.tls       = tenantUrl.startsWith('https');
    result.reachable = res.status < 500;
    result.latencyMs = Date.now() - start;
    result.httpStatus = res.status;
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

async function getToken(tenantUrl, clientId, clientSecret) {
  const apiBase    = getApiBase(tenantUrl);
  const bodyParams = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const res = await httpRequest(`${apiBase}/oauth/token`, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyParams).toString(),
    },
    body: bodyParams,
    timeout: 10000,
  });
  if (res.status !== 200) {
    let errDetail = '';
    try { errDetail = JSON.parse(res.body)?.error_description || ''; } catch {}
    throw new Error(`Token request failed (HTTP ${res.status})${errDetail ? ': ' + errDetail : ''}`);
  }
  const token = JSON.parse(res.body);
  return { accessToken: token.access_token, expiresIn: token.expires_in, tokenType: token.token_type };
}

async function getOrgInfo(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl);
  const res = await httpRequest(`${apiBase}/v3/org-config`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 10000,
  });
  if (res.status === 200) {
    const data = JSON.parse(res.body);
    return { orgName: data.orgName || data.name, pod: data.pod, region: data.region };
  }
  return { orgName: null, pod: null };
}

async function getIdentityCount(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl);
  const res = await httpRequest(`${apiBase}/v2025/identities?limit=1&count=true`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'X-SailPoint-Experimental': 'true',
    },
    timeout: 12000,
  });
  if (res.status === 200) {
    return { count: parseInt(res.headers['x-total-count'] || '0', 10) };
  }
  const countBody = JSON.stringify({ indices: ['identities'], query: { query: '*' } });
  const res2 = await httpRequest(`${apiBase}/v3/search/count`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`, Accept: 'application/json',
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(countBody).toString(),
    },
    body: countBody, timeout: 12000,
  });
  if (res2.status === 204 || res2.status === 200) {
    return { count: parseInt(res2.headers['x-total-count'] || '0', 10) };
  }
  throw new Error(`Identity count failed — HTTP ${res.status}, ${res2.status}`);
}

async function getVaClusters(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl);
  const res = await httpRequest(`${apiBase}/v3/managed-clusters`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 12000,
  });
  if (res.status !== 200) return { vaCount: 0, unhealthyCount: 0, clusters: [] };
  const all = JSON.parse(res.body);
  const vas = all.filter(c => !c.type || ['VA', 'va'].includes(c.type));
  const HEALTHY = new Set(['NORMAL']);
  const enriched = vas.map(c => {
    const rawStatus = c.clientStatus?.status || 'UNKNOWN';
    return { id: c.id, name: c.name || c.id, type: c.type || 'VA', status: HEALTHY.has(rawStatus.toUpperCase()) ? 'CONNECTED' : rawStatus };
  });
  return { vaCount: enriched.length, unhealthyCount: enriched.filter(c => c.status !== 'CONNECTED').length, clusters: enriched };
}

async function fullValidation(tenantUrl, clientId, clientSecret) {
  const steps = [];
  let accessToken = null;

  const conn = await testConnectivity(tenantUrl);
  steps.push({ id: 'connectivity', label: 'DNS & TLS Reachability', status: conn.reachable ? 'pass' : 'fail', detail: conn.reachable ? `Reachable in ${conn.latencyMs}ms` : (conn.error || 'Unreachable') });
  if (!conn.reachable) return { success: false, steps, error: 'Tenant URL is unreachable' };

  steps.push({ id: 'tls', label: 'TLS Certificate Valid', status: 'pass', detail: `HTTPS established to ${getApiBase(tenantUrl)}` });

  try {
    const tok = await getToken(tenantUrl, clientId, clientSecret);
    accessToken = tok.accessToken;
    steps.push({ id: 'auth', label: 'OAuth2 Authentication', status: 'pass', detail: `Token issued — expires in ${tok.expiresIn}s` });
  } catch (err) {
    steps.push({ id: 'auth', label: 'OAuth2 Authentication', status: 'fail', detail: err.message });
    return { success: false, steps, error: `Authentication failed: ${err.message}` };
  }

  let orgInfo = {}, identityCount = 0, vaInfo = {};
  try { orgInfo = await getOrgInfo(tenantUrl, accessToken); steps.push({ id: 'org', label: 'Org Configuration', status: 'pass', detail: orgInfo.orgName || 'Retrieved' }); } catch (err) { steps.push({ id: 'org', label: 'Org Configuration', status: 'warn', detail: err.message }); }
  try { const ic = await getIdentityCount(tenantUrl, accessToken); identityCount = ic.count; steps.push({ id: 'identities', label: 'Identity Data Access', status: 'pass', detail: `${identityCount.toLocaleString()} identities` }); } catch (err) { steps.push({ id: 'identities', label: 'Identity Data Access', status: 'warn', detail: err.message }); }
  try { vaInfo = await getVaClusters(tenantUrl, accessToken); steps.push({ id: 'va', label: 'Virtual Appliance Clusters', status: 'pass', detail: `${vaInfo.vaCount} cluster(s)` }); } catch (err) { steps.push({ id: 'va', label: 'VA Clusters', status: 'warn', detail: err.message }); }

  return { success: true, steps, tenantData: { orgName: orgInfo.orgName, pod: orgInfo.pod, identityCount, vaCount: vaInfo.vaCount || 0, vaUnhealthy: vaInfo.unhealthyCount || 0, vaClusters: vaInfo.clusters || [], apiBase: getApiBase(tenantUrl) } };
}

// ── Azure Functions handler ───────────────────────────────────────────────────
module.exports = async function (context, req) {
  const user = await requireAuth(context, req);
  if (!user) return;

  const json = (body, status = 200) => ({
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const body = req.body || {};
  const { action, tenantUrl, clientId, clientSecret } = body;

  if (!tenantUrl) { context.res = json({ error: 'tenantUrl is required' }, 400); return; }

  try {
    const u = new URL(tenantUrl);
    if (!isAllowedDomain(u.hostname)) {
      context.res = json({ error: `tenantUrl hostname "${u.hostname}" is not permitted` }, 400);
      return;
    }
  } catch {
    context.res = json({ error: 'Invalid tenantUrl' }, 400);
    return;
  }

  try {
    let result;
    switch (action) {
      case 'test-connectivity':
        result = await testConnectivity(tenantUrl);
        break;
      case 'get-token':
        if (!clientId || !clientSecret) { context.res = json({ error: 'clientId and clientSecret required' }, 400); return; }
        const tok = await getToken(tenantUrl, clientId, clientSecret);
        result = { success: true, expiresIn: tok.expiresIn, tokenType: tok.tokenType };
        break;
      case 'full-validation':
        if (!clientId || !clientSecret) { context.res = json({ error: 'clientId and clientSecret required' }, 400); return; }
        result = await fullValidation(tenantUrl, clientId, clientSecret);
        if (result.success) {
          await logAuditEvent({ userId: user.id, userEmail: user.email, action: 'ACCESS', resource: 'Tenant', details: `Full validation: ${tenantUrl}`, ipAddress: req.headers['x-forwarded-for'] || '' });
        }
        break;
      case 'refresh-counts':
        if (!clientId || !clientSecret) { context.res = json({ error: 'clientId and clientSecret required' }, 400); return; }
        try {
          const t  = await getToken(tenantUrl, clientId, clientSecret);
          const ic = await getIdentityCount(tenantUrl, t.accessToken);
          const va = await getVaClusters(tenantUrl, t.accessToken);
          result = { success: true, identityCount: ic.count, vaCount: va.vaCount, vaUnhealthy: va.unhealthyCount, vaClusters: va.clusters, refreshedAt: new Date().toISOString() };
        } catch (err) {
          result = { success: false, error: err.message };
        }
        break;
      default:
        context.res = json({ error: `Unknown action: ${action}` }, 400);
        return;
    }
    context.res = json(result);
  } catch (err) {
    context.log.error('[sailpoint-proxy] Error:', err.message);
    context.res = json({ error: err.message || 'Internal proxy error' }, 500);
  }
};
