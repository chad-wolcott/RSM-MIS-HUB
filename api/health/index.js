/**
 * Health check endpoint — unauthenticated, used by Azure load balancers,
 * monitoring tools, and the Admin console System Health tab.
 *
 * GET /api/health
 * Returns: { status, version, timestamp, checks: { cosmos, keyVault } }
 */

const { getContainer } = require('../lib/cosmos');

module.exports = async function (context, req) {
  const checks = {};
  let overall = 'healthy';

  // ── Cosmos DB connectivity ────────────────────────────────────────────────
  try {
    const container = getContainer('config');
    // Lightweight point-read that will 404 (ok) or succeed — either proves connectivity
    await container.items.query('SELECT TOP 1 c.id FROM c').fetchAll();
    checks.cosmos = { status: 'healthy' };
  } catch (err) {
    checks.cosmos = { status: 'unhealthy', error: err.message };
    overall = 'degraded';
  }

  // ── Key Vault reachability (optional — skip if not configured) ────────────
  if (process.env.KEYVAULT_URI) {
    try {
      const { SecretClient } = require('@azure/keyvault-secrets');
      const { DefaultAzureCredential } = require('@azure/identity');
      const client = new SecretClient(process.env.KEYVAULT_URI, new DefaultAzureCredential());
      // List 1 secret to confirm connectivity (won't fail on empty vault)
      const iter = client.listPropertiesOfSecrets();
      await iter.next();
      checks.keyVault = { status: 'healthy' };
    } catch (err) {
      checks.keyVault = { status: 'unhealthy', error: err.message };
      overall = 'degraded';
    }
  } else {
    checks.keyVault = { status: 'not-configured' };
  }

  // ── Application Insights ──────────────────────────────────────────────────
  checks.appInsights = process.env.APPINSIGHTS_INSTRUMENTATIONKEY
    ? { status: 'configured' }
    : { status: 'not-configured' };

  context.res = {
    status: overall === 'healthy' ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status:    overall,
      version:   process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.AZURE_FUNCTIONS_ENVIRONMENT || 'Development',
      checks,
    }),
  };
};
