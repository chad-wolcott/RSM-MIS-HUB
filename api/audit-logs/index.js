const { getContainer } = require('../lib/cosmos');
const { logAuditEvent } = require('../lib/auditLogger');
const { requireAuth } = require('../lib/auth');

const AUDITOR_ROLES = ['Administrator', 'Read-Only Auditor'];

module.exports = async function (context, req) {
  const user = await requireAuth(context, req);
  if (!user) return;

  const canRead = user.roles.some(r => AUDITOR_ROLES.includes(r));
  if (!canRead) {
    context.res = {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden: Auditor or Administrator role required' }),
    };
    return;
  }

  const container = getContainer('audit-logs');

  // Query parameters
  const {
    startDate,
    endDate,
    action,
    resource,
    userId: filterUserId,
    severity,
    limit = '200',
    offset = '0',
  } = req.query || {};

  // Build dynamic SQL query
  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push('c.timestamp >= @startDate');
    params.push({ name: '@startDate', value: startDate });
  }
  if (endDate) {
    conditions.push('c.timestamp <= @endDate');
    params.push({ name: '@endDate', value: endDate });
  }
  if (action) {
    conditions.push('c.action = @action');
    params.push({ name: '@action', value: action });
  }
  if (resource) {
    conditions.push('c.resource = @resource');
    params.push({ name: '@resource', value: resource });
  }
  if (filterUserId) {
    conditions.push('c.userId = @userId');
    params.push({ name: '@userId', value: filterUserId });
  }
  if (severity) {
    conditions.push('c.severity = @severity');
    params.push({ name: '@severity', value: severity });
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM c ${where} ORDER BY c.timestamp DESC OFFSET ${parseInt(offset, 10)} LIMIT ${parseInt(limit, 10)}`;

  try {
    const { resources } = await container.items
      .query({ query, parameters: params })
      .fetchAll();

    // Log that an audit export/view occurred
    await logAuditEvent({
      userId: user.id, userEmail: user.email,
      action: 'ACCESS', resource: 'AuditLog',
      details: `Viewed audit logs (returned ${resources.length} records)`,
      ipAddress: req.headers['x-forwarded-for'] || '',
    });

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: resources.length, logs: resources }),
    };
  } catch (err) {
    context.log.error('[audit-logs] Query error:', err.message);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
