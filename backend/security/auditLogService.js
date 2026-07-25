/**
 * LC1 — Durable audit logging.
 */

const { insertBackendRow } = require("../services/backendDbService");

async function writeAuditLog(entry = {}) {
  const payload = {
    organization_id: entry.organizationId || null,
    user_id: entry.userId || null,
    user_email: entry.userEmail || null,
    action: entry.action,
    target_type: entry.targetType || null,
    target_id: entry.targetId || null,
    result: entry.result || "success",
    metadata: entry.metadata || {},
    ip_address: entry.ipAddress || null,
    user_agent: entry.userAgent || null
  };

  try {
    return await insertBackendRow("atlas_audit_log", payload);
  } catch (error) {
    console.error("[audit-log]", error.message, payload.action);
    return null;
  }
}

function auditFromRequest(req, entry = {}) {
  return writeAuditLog({
    organizationId: req.authContext?.organizationId,
    userId: req.authContext?.userId,
    userEmail: req.authContext?.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    ...entry
  });
}

module.exports = {
  writeAuditLog,
  auditFromRequest
};
