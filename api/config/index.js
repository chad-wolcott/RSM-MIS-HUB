/**
 * Config API — stores application configuration in Cosmos DB.
 *
 * Schema per document:
 *   id:          "<category>:<key>"   (unique)
 *   category:    string               (partition key)  e.g. "general" | "idp" | "vault" | "siem"
 *   key:         string               e.g. "orgName"
 *   value:       any                  the setting value
 *   description: string               human-readable description
 *   sensitive:   boolean              if true, value is stored in Key Vault (not Cosmos)
 *   updatedBy:   string               user ID
 *   updatedByEmail: string
 *   updatedAt:   ISO timestamp
 *
 * GET  /api/config           → all categories (admin only)
 * GET  /api/config/:category → all settings in a category
 * PUT  /api/config/:category → upsert a batch of settings in a category
 */

const { getContainer } = require('../lib/cosmos');
const { logAuditEvent } = require('../lib/auditLogger');
const { requireAuth } = require('../lib/auth');

const ADMIN_ROLES = ['Administrator'];

module.exports = async function (context, req) {
  const user = await requireAuth(context, req);
  if (!user) return;

  const isAdmin = user.roles.some(r => ADMIN_ROLES.includes(r));
  const category = context.bindingData.category;
  const container = getContainer('config');
  const ip = req.headers['x-forwarded-for'] || '';

  const json = (body, status = 200) => ({
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    switch (req.method) {
      // ── READ ─────────────────────────────────────────────────────────────────
      case 'GET': {
        if (category) {
          const { resources } = await container.items
            .query({
              query: 'SELECT * FROM c WHERE c.category = @cat ORDER BY c.key',
              parameters: [{ name: '@cat', value: category }],
            })
            .fetchAll();
          context.res = json(resources);
        } else {
          if (!isAdmin) { context.res = json({ error: 'Forbidden' }, 403); return; }
          const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.category, c.key')
            .fetchAll();
          context.res = json(resources);
        }
        break;
      }

      // ── UPSERT ───────────────────────────────────────────────────────────────
      case 'PUT': {
        if (!isAdmin) { context.res = json({ error: 'Forbidden: Administrator role required' }, 403); return; }
        if (!category) { context.res = json({ error: 'Category is required' }, 400); return; }

        // body should be an object: { key: value, ... } or an array of setting objects
        const body = req.body;
        if (!body || typeof body !== 'object') {
          context.res = json({ error: 'Request body must be a JSON object' }, 400);
          return;
        }

        const now = new Date().toISOString();
        const settings = Array.isArray(body) ? body : Object.entries(body).map(([key, value]) => ({ key, value }));

        const upserted = [];
        for (const { key, value, description, sensitive } of settings) {
          const id = `${category}:${key}`;
          const doc = {
            id,
            category,
            key,
            value:       sensitive ? '[stored-in-keyvault]' : value,
            description: description || '',
            sensitive:   Boolean(sensitive),
            updatedBy:   user.id,
            updatedByEmail: user.email,
            updatedAt:   now,
          };
          const { resource } = await container.items.upsert(doc);
          upserted.push(resource);
        }

        await logAuditEvent({
          userId: user.id, userEmail: user.email,
          action: 'UPDATE', resource: 'Config',
          resourceId: category,
          details: `Updated ${upserted.length} setting(s) in category: ${category}`,
          ipAddress: ip,
        });

        context.res = json(upserted);
        break;
      }

      default:
        context.res = json({ error: 'Method not allowed' }, 405);
    }
  } catch (err) {
    context.log.error('[config] Error:', err.message);
    context.res = json({ error: 'Internal server error' }, 500);
  }
};
