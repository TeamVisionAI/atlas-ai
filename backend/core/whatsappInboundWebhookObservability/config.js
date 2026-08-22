/**
 * Retention for inbound WhatsApp webhook observability rows (days).
 * Default 30; set ATLAS_WHATSAPP_WEBHOOK_OBSERVABILITY_RETENTION_DAYS=0 to disable purge.
 */

function resolveRetentionDays(env = process.env) {
  const raw = String(
    env.ATLAS_WHATSAPP_WEBHOOK_OBSERVABILITY_RETENTION_DAYS ?? "30"
  ).trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 30;
  }
  return Math.floor(parsed);
}

function isObservabilityEnabled(env = process.env) {
  const flag = String(env.ATLAS_WHATSAPP_WEBHOOK_OBSERVABILITY_ENABLED ?? "true")
    .trim()
    .toLowerCase();
  return flag !== "false" && flag !== "0";
}

module.exports = {
  resolveRetentionDays,
  isObservabilityEnabled
};
