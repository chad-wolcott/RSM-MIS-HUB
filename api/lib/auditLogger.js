const { getContainer } = require('./cosmos');
const { randomUUID } = require('crypto');

/**
 * Severity levels for audit events.
 * @typedef {'Info' | 'Warning' | 'Critical'} Severity
 */

/**
 * Write an audit log entry to Cosmos DB.
 *
 * @param {object} opts
 * @param {string}   opts.userId      - Entra OID or local user ID
 * @param {string}   opts.userEmail   - User's email address
 * @param {string}   opts.action      - Verb: CREATE | UPDATE | DELETE | ACCESS | LOGIN | LOGOUT | EXPORT
 * @param {string}   opts.resource    - Resource type: Tenant | User | Config | AuditLog | Session
 * @param {string}  [opts.resourceId] - ID of the affected resource
 * @param {string}  [opts.details]    - Human-readable description
 * @param {Severity}[opts.severity]   - Default: 'Info'
 * @param {string}  [opts.ipAddress]  - Client IP
 */
async function logAuditEvent({
  userId,
  userEmail,
  action,
  resource,
  resourceId,
  details,
  severity = 'Info',
  ipAddress,
}) {
  const now = new Date();
  const entry = {
    id:         randomUUID(),
    timestamp:  now.toISOString(),
    date:       now.toISOString().split('T')[0], // partition key — YYYY-MM-DD
    userId,
    userEmail,
    action,
    resource,
    resourceId: resourceId || null,
    details:    details    || null,
    severity,
    ipAddress:  ipAddress  || null,
  };

  try {
    const container = getContainer('audit-logs');
    await container.items.create(entry);
  } catch (err) {
    // Never throw from audit logging — log to console and continue
    console.error('[auditLogger] Failed to write audit event:', err.message, entry);
  }

  return entry;
}

module.exports = { logAuditEvent };
