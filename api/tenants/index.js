const { getContainer } = require('../lib/cosmos');
const { logAuditEvent } = require('../lib/auditLogger');
const { requireAuth } = require('../lib/auth');
const { randomUUID } = require('crypto');

module.exports = async function (context, req) {
  const user = await requireAuth(context, req);
  if (!user) return;

  const container = getContainer('tenants');
  const id = context.bindingData.id;
  const ip = req.headers['x-forwarded-for'] || req.headers['client-ip'] || '';

  const json = (body, status = 200) => ({
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    switch (req.method) {
      // ── LIST or GET ──────────────────────────────────────────────────────────
      case 'GET': {
        if (id) {
          const { resource } = await container.item(id, id).read();
          if (!resource) { context.res = json({ error: 'Tenant not found' }, 404); return; }
          context.res = json(resource);
        } else {
          const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.name')
            .fetchAll();
          context.res = json(resources);
        }
        break;
      }

      // ── CREATE ───────────────────────────────────────────────────────────────
      case 'POST': {
        const body = req.body;
        if (!body?.name || !body?.type) {
          context.res = json({ error: 'name and type are required' }, 400);
          return;
        }
        const now = new Date().toISOString();
        const tenant = {
          ...body,
          id:          randomUUID(),
          status:      body.status || 'Active',
          createdBy:   user.id,
          createdByEmail: user.email,
          createdAt:   now,
          updatedAt:   now,
        };
        const { resource } = await container.items.create(tenant);
        await logAuditEvent({
          userId: user.id, userEmail: user.email,
          action: 'CREATE', resource: 'Tenant', resourceId: resource.id,
          details: `Created tenant: ${resource.name}`, ipAddress: ip,
        });
        context.res = json(resource, 201);
        break;
      }

      // ── UPDATE ───────────────────────────────────────────────────────────────
      case 'PUT': {
        if (!id) { context.res = json({ error: 'Tenant ID required' }, 400); return; }
        const { resource: existing } = await container.item(id, id).read();
        if (!existing) { context.res = json({ error: 'Tenant not found' }, 404); return; }
        const updated = {
          ...existing,
          ...req.body,
          id,                          // never overwrite ID
          createdBy:    existing.createdBy,
          createdAt:    existing.createdAt,
          updatedBy:    user.id,
          updatedByEmail: user.email,
          updatedAt:    new Date().toISOString(),
        };
        const { resource } = await container.item(id, id).replace(updated);
        await logAuditEvent({
          userId: user.id, userEmail: user.email,
          action: 'UPDATE', resource: 'Tenant', resourceId: id,
          details: `Updated tenant: ${resource.name}`, ipAddress: ip,
        });
        context.res = json(resource);
        break;
      }

      // ── DELETE ───────────────────────────────────────────────────────────────
      case 'DELETE': {
        if (!id) { context.res = json({ error: 'Tenant ID required' }, 400); return; }
        const { resource: toDelete } = await container.item(id, id).read();
        if (!toDelete) { context.res = json({ error: 'Tenant not found' }, 404); return; }
        await container.item(id, id).delete();
        await logAuditEvent({
          userId: user.id, userEmail: user.email,
          action: 'DELETE', resource: 'Tenant', resourceId: id,
          details: `Deleted tenant: ${toDelete.name}`, severity: 'Warning', ipAddress: ip,
        });
        context.res = { status: 204 };
        break;
      }

      default:
        context.res = json({ error: 'Method not allowed' }, 405);
    }
  } catch (err) {
    context.log.error('[tenants] Error:', err.message);
    context.res = json({ error: 'Internal server error' }, 500);
  }
};
