const { getContainer } = require('../lib/cosmos');
const { logAuditEvent } = require('../lib/auditLogger');
const { requireAuth } = require('../lib/auth');
const { randomUUID } = require('crypto');

const ADMIN_ROLES = ['Administrator'];

module.exports = async function (context, req) {
  const user = await requireAuth(context, req);
  if (!user) return;

  const container = getContainer('users');
  const id = context.bindingData.id;
  const ip = req.headers['x-forwarded-for'] || req.headers['client-ip'] || '';

  const json = (body, status = 200) => ({
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Non-admins can only GET their own record
  const isAdmin = user.roles.some(r => ADMIN_ROLES.includes(r));

  try {
    switch (req.method) {
      // ── LIST or GET ──────────────────────────────────────────────────────────
      case 'GET': {
        if (id) {
          // Non-admins can only read themselves
          if (!isAdmin && id !== user.id) {
            context.res = json({ error: 'Forbidden' }, 403);
            return;
          }
          const { resource } = await container.item(id, id).read();
          if (!resource) { context.res = json({ error: 'User not found' }, 404); return; }
          context.res = json(stripSensitive(resource));
        } else {
          if (!isAdmin) { context.res = json({ error: 'Forbidden' }, 403); return; }
          const { resources } = await container.items
            .query('SELECT * FROM c ORDER BY c.displayName')
            .fetchAll();
          context.res = json(resources.map(stripSensitive));
        }
        break;
      }

      // ── CREATE ───────────────────────────────────────────────────────────────
      case 'POST': {
        if (!isAdmin) { context.res = json({ error: 'Forbidden' }, 403); return; }
        const body = req.body;
        if (!body?.email || !body?.role) {
          context.res = json({ error: 'email and role are required' }, 400);
          return;
        }
        const now = new Date().toISOString();
        const newUser = {
          ...body,
          id:          randomUUID(),
          createdBy:   user.id,
          createdAt:   now,
          updatedAt:   now,
          lastLogin:   null,
          status:      'Active',
        };
        const { resource } = await container.items.create(newUser);
        await logAuditEvent({
          userId: user.id, userEmail: user.email,
          action: 'CREATE', resource: 'User', resourceId: resource.id,
          details: `Created user: ${resource.email} (${resource.role})`, ipAddress: ip,
        });
        context.res = json(stripSensitive(resource), 201);
        break;
      }

      // ── UPDATE ───────────────────────────────────────────────────────────────
      case 'PUT': {
        if (!id) { context.res = json({ error: 'User ID required' }, 400); return; }
        if (!isAdmin && id !== user.id) { context.res = json({ error: 'Forbidden' }, 403); return; }
        const { resource: existing } = await container.item(id, id).read();
        if (!existing) { context.res = json({ error: 'User not found' }, 404); return; }

        // Non-admins cannot change their own role
        const safeBody = isAdmin ? req.body : omit(req.body, ['role', 'status']);
        const updated = {
          ...existing,
          ...safeBody,
          id,
          createdAt:  existing.createdAt,
          updatedBy:  user.id,
          updatedAt:  new Date().toISOString(),
        };
        const { resource } = await container.item(id, id).replace(updated);
        await logAuditEvent({
          userId: user.id, userEmail: user.email,
          action: 'UPDATE', resource: 'User', resourceId: id,
          details: `Updated user: ${resource.email}`, ipAddress: ip,
        });
        context.res = json(stripSensitive(resource));
        break;
      }

      // ── DELETE ───────────────────────────────────────────────────────────────
      case 'DELETE': {
        if (!isAdmin) { context.res = json({ error: 'Forbidden' }, 403); return; }
        if (!id) { context.res = json({ error: 'User ID required' }, 400); return; }
        if (id === user.id) { context.res = json({ error: 'Cannot delete yourself' }, 400); return; }
        const { resource: toDelete } = await container.item(id, id).read();
        if (!toDelete) { context.res = json({ error: 'User not found' }, 404); return; }
        await container.item(id, id).delete();
        await logAuditEvent({
          userId: user.id, userEmail: user.email,
          action: 'DELETE', resource: 'User', resourceId: id,
          details: `Deleted user: ${toDelete.email}`, severity: 'Warning', ipAddress: ip,
        });
        context.res = { status: 204 };
        break;
      }

      default:
        context.res = json({ error: 'Method not allowed' }, 405);
    }
  } catch (err) {
    context.log.error('[users] Error:', err.message);
    context.res = json({ error: 'Internal server error' }, 500);
  }
};

function stripSensitive(u) {
  const { passwordHash, passwordSalt, ...safe } = u;
  return safe;
}

function omit(obj, keys) {
  const result = { ...obj };
  for (const k of keys) delete result[k];
  return result;
}
