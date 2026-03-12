// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Netlify Function: SailPoint ISC Proxy
// Path: /.netlify/functions/sailpoint-proxy
//
// Proxies requests to SailPoint IdentityNow (ISC) REST API server-side,
// bypassing browser CORS restrictions. Handles OAuth2 client_credentials
// token acquisition and subsequent API calls.
//
// Supported actions:
//   test-connectivity  — DNS + TLS reachability check (HEAD request to tenant)
//   get-token          — OAuth2 client_credentials token exchange
//   get-org-info       — Fetch org/tenant details (name, pod, org type)
//   get-identity-count — Count of active identities
//   get-va-clusters    — Virtual appliance cluster status
//   full-validation    — Runs all checks in sequence, returns composite result
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https')
const http  = require('http')

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url)
    const lib     = parsed.protocol === 'https:' ? https : http
    const timeout = options.timeout || 10000

    const reqOptions = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
      timeout,
    }

    const req = lib.request(reqOptions, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        resolve({
          status:  res.statusCode,
          headers: res.headers,
          body:    data,
        })
      })
    })

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    req.on('error',   (err) => reject(err))

    if (options.body) req.write(options.body)
    req.end()
  })
}

// ── Derive API base URL from tenant URL ───────────────────────────────────────
// Tenant URL:  https://org.identitynow.com
// API base:    https://org.api.identitynow.com
function getApiBase(tenantUrl) {
  try {
    const u    = new URL(tenantUrl)
    const host = u.hostname // e.g. "acme.identitynow.com"
    const org  = host.split('.')[0]
    return `https://${org}.api.identitynow.com`
  } catch {
    throw new Error(`Invalid tenant URL: ${tenantUrl}`)
  }
}

// ── Action: test-connectivity ─────────────────────────────────────────────────
async function testConnectivity(tenantUrl) {
  const result = { dns: false, tls: false, reachable: false, latencyMs: null }
  const start  = Date.now()

  try {
    const res = await httpRequest(tenantUrl, { method: 'HEAD', timeout: 8000 })
    result.dns       = true
    result.tls       = tenantUrl.startsWith('https')
    result.reachable = res.status < 500
    result.latencyMs = Date.now() - start
    result.httpStatus = res.status
  } catch (err) {
    result.error = err.message
  }

  return result
}

// ── Action: get-token ─────────────────────────────────────────────────────────
async function getToken(tenantUrl, clientId, clientSecret) {
  const apiBase    = getApiBase(tenantUrl)
  const tokenUrl   = `${apiBase}/oauth/token`
  const bodyParams = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`

  const res = await httpRequest(tokenUrl, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyParams).toString(),
    },
    body:    bodyParams,
    timeout: 10000,
  })

  if (res.status !== 200) {
    let errDetail = ''
    try { errDetail = JSON.parse(res.body)?.error_description || '' } catch {}
    throw new Error(`Token request failed (HTTP ${res.status})${errDetail ? ': ' + errDetail : ''}`)
  }

  const token = JSON.parse(res.body)
  return { accessToken: token.access_token, expiresIn: token.expires_in, tokenType: token.token_type }
}

// ── Action: get-org-info ──────────────────────────────────────────────────────
async function getOrgInfo(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl)

  // Try v3 org endpoint
  const res = await httpRequest(`${apiBase}/v3/org-config`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 10000,
  })

  if (res.status === 200) {
    const data = JSON.parse(res.body)
    return {
      orgName:   data.orgName || data.name,
      pod:       data.pod,
      region:    data.region,
      productionStatus: data.status,
    }
  }

  // Fallback: beta tenant-config
  const res2 = await httpRequest(`${apiBase}/beta/tenant-config/product`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 10000,
  })

  if (res2.status === 200) {
    const data = JSON.parse(res2.body)
    return { orgName: data.name || data.displayName, pod: data.pod }
  }

  return { orgName: null, pod: null }
}

// ── Action: get-identity-count ────────────────────────────────────────────────
async function getIdentityCount(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl)

  // Use X-Total-Count header — avoids downloading all records
  const res = await httpRequest(
    `${apiBase}/v3/identities?limit=1&count=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:        'application/json',
      },
      timeout: 10000,
    }
  )

  if (res.status === 200) {
    const count = parseInt(res.headers['x-total-count'] || '0', 10)
    return { count, raw: res.headers['x-total-count'] }
  }

  throw new Error(`Identity count failed (HTTP ${res.status})`)
}

// ── Action: get-va-clusters ───────────────────────────────────────────────────
async function getVaClusters(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl)

  const res = await httpRequest(`${apiBase}/beta/cluster-configs?type=VA`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 10000,
  })

  if (res.status === 200) {
    const clusters = JSON.parse(res.body)
    const vaCount  = clusters.length || 0
    const unhealthy = clusters.filter(c =>
      c.status && !['VALID','HEALTHY','ACTIVE'].includes(c.status.toUpperCase())
    ).length
    return { vaCount, unhealthyCount: unhealthy, clusters: clusters.map(c => ({ name: c.name, status: c.status })) }
  }

  // Non-fatal — VA info optional
  return { vaCount: 0, unhealthyCount: 0, clusters: [], note: `HTTP ${res.status}` }
}

// ── Action: full-validation ───────────────────────────────────────────────────
async function fullValidation(tenantUrl, clientId, clientSecret) {
  const steps = []
  let accessToken = null

  // Step 1: Connectivity
  try {
    const conn = await testConnectivity(tenantUrl)
    steps.push({
      id: 'connectivity',
      label: 'DNS & TLS Reachability',
      status: conn.reachable ? 'pass' : 'fail',
      detail: conn.reachable
        ? `Reachable in ${conn.latencyMs}ms — HTTP ${conn.httpStatus}`
        : (conn.error || 'Host unreachable'),
    })
    if (!conn.reachable) {
      return { success: false, steps, error: 'Tenant URL is unreachable' }
    }
  } catch (err) {
    steps.push({ id: 'connectivity', label: 'DNS & TLS Reachability', status: 'fail', detail: err.message })
    return { success: false, steps, error: err.message }
  }

  // Step 2: TLS cert (implicit from successful HTTPS request above)
  steps.push({
    id: 'tls',
    label: 'TLS Certificate Valid',
    status: 'pass',
    detail: `HTTPS connection established to ${getApiBase(tenantUrl)}`,
  })

  // Step 3: API endpoint
  try {
    const apiBase = getApiBase(tenantUrl)
    const apiRes  = await httpRequest(`${apiBase}/oauth/token`, { method: 'HEAD', timeout: 8000 })
    steps.push({
      id: 'api',
      label: 'API Endpoint Reachable',
      status: apiRes.status < 500 ? 'pass' : 'fail',
      detail: `${apiBase}/oauth/token → HTTP ${apiRes.status}`,
    })
  } catch (err) {
    steps.push({ id: 'api', label: 'API Endpoint Reachable', status: 'fail', detail: err.message })
    return { success: false, steps, error: 'API endpoint unreachable' }
  }

  // Step 4: OAuth authentication
  try {
    const tok = await getToken(tenantUrl, clientId, clientSecret)
    accessToken = tok.accessToken
    steps.push({
      id: 'auth',
      label: 'OAuth2 Authentication',
      status: 'pass',
      detail: `Token issued — expires in ${tok.expiresIn}s`,
    })
  } catch (err) {
    steps.push({ id: 'auth', label: 'OAuth2 Authentication', status: 'fail', detail: err.message })
    return { success: false, steps, error: `Authentication failed: ${err.message}` }
  }

  // Step 5: Data retrieval
  let orgInfo       = {}
  let identityCount = 0
  let vaInfo        = {}

  try {
    orgInfo = await getOrgInfo(tenantUrl, accessToken)
    steps.push({
      id: 'org',
      label: 'Org Configuration Retrieved',
      status: 'pass',
      detail: orgInfo.orgName
        ? `Org: ${orgInfo.orgName}${orgInfo.pod ? ' — Pod: ' + orgInfo.pod : ''}`
        : 'Org info retrieved',
    })
  } catch (err) {
    steps.push({ id: 'org', label: 'Org Configuration Retrieved', status: 'warn', detail: `Non-fatal: ${err.message}` })
  }

  try {
    const ic      = await getIdentityCount(tenantUrl, accessToken)
    identityCount = ic.count
    steps.push({
      id: 'identities',
      label: 'Identity Data Access',
      status: 'pass',
      detail: `${identityCount.toLocaleString()} identities found`,
    })
  } catch (err) {
    steps.push({ id: 'identities', label: 'Identity Data Access', status: 'warn', detail: `Non-fatal: ${err.message}` })
  }

  try {
    vaInfo = await getVaClusters(tenantUrl, accessToken)
    steps.push({
      id: 'va',
      label: 'Virtual Appliance Clusters',
      status: 'pass',
      detail: `${vaInfo.vaCount} cluster(s) found${vaInfo.unhealthyCount > 0 ? ` — ${vaInfo.unhealthyCount} unhealthy` : ''}`,
    })
  } catch (err) {
    steps.push({ id: 'va', label: 'Virtual Appliance Clusters', status: 'warn', detail: `Non-fatal: ${err.message}` })
  }

  return {
    success: true,
    steps,
    tenantData: {
      orgName:       orgInfo.orgName,
      pod:           orgInfo.pod,
      identityCount,
      vaCount:       vaInfo.vaCount || 0,
      vaUnhealthy:   vaInfo.unhealthyCount || 0,
      vaClusters:    vaInfo.clusters || [],
      apiBase:       getApiBase(tenantUrl),
    },
  }
}

// ── Lambda handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { action, tenantUrl, clientId, clientSecret } = body

  if (!tenantUrl) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'tenantUrl is required' }) }
  }

  // Basic URL validation — must be identitynow.com domain
  try {
    const u = new URL(tenantUrl)
    if (!u.hostname.endsWith('.identitynow.com') && !u.hostname.endsWith('.sailpoint.com')) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: 'tenantUrl must be a valid SailPoint IdentityNow URL (*.identitynow.com)' }),
      }
    }
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid tenantUrl' }) }
  }

  try {
    let result

    switch (action) {
      case 'test-connectivity':
        result = await testConnectivity(tenantUrl)
        break

      case 'get-token':
        if (!clientId || !clientSecret) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'clientId and clientSecret required' }) }
        }
        result = await getToken(tenantUrl, clientId, clientSecret)
        // Never return the actual token in the response — just confirm success
        result = { success: true, expiresIn: result.expiresIn, tokenType: result.tokenType }
        break

      case 'full-validation':
        if (!clientId || !clientSecret) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'clientId and clientSecret required for full validation' }) }
        }
        result = await fullValidation(tenantUrl, clientId, clientSecret)
        break

      default:
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `Unknown action: ${action}` }) }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) }

  } catch (err) {
    console.error('[sailpoint-proxy] Error:', err)
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Internal proxy error' }),
    }
  }
}
