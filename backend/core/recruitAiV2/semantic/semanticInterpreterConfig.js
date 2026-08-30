/**
 * BR-174 — semantic interpreter flags. Fail closed. Apply path is never on.
 */

const { FEATURE_FLAGS } = require("../constants");

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4o-mini";

function parseBooleanStrictTrue(value) {
  if (value == null || value === "") {
    return { ok: true, value: false, present: false };
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return { ok: true, value: true, present: true };
  }
  if (normalized === "false") {
    return { ok: true, value: false, present: true };
  }
  return { ok: false, value: false, present: true, malformed: true };
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return value.map((id) => String(id).trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function resolveTimeoutMs(env = process.env) {
  const raw = env[FEATURE_FLAGS.SEMANTIC_TIMEOUT_MS_ENV];
  if (raw == null || raw === "") {
    return DEFAULT_TIMEOUT_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 200 || n > 8000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.floor(n);
}

function failClosed(reason) {
  return {
    shadowEnabled: false,
    canaryEnabled: false,
    applyEnabled: false,
    organizationIds: [],
    userIds: [],
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    failClosed: true,
    failClosedReason: reason
  };
}

function resolveSemanticInterpreterConfig(env = process.env) {
  const shadow = parseBooleanStrictTrue(env[FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]);
  if (shadow.malformed) {
    return failClosed("MALFORMED_SEMANTIC_SHADOW_ENABLED");
  }
  const canary = parseBooleanStrictTrue(env[FEATURE_FLAGS.SEMANTIC_CANARY_ENABLED_ENV]);
  if (canary.malformed) {
    return failClosed("MALFORMED_SEMANTIC_CANARY_ENABLED");
  }

  return {
    shadowEnabled: Boolean(shadow.value),
    canaryEnabled: Boolean(canary.value),
    // Implements BR-174 — this foundation never applies semantic output to decisions.
    applyEnabled: false,
    organizationIds: parseIdList(env[FEATURE_FLAGS.SEMANTIC_ORGANIZATION_IDS_ENV]),
    userIds: parseIdList(env[FEATURE_FLAGS.SEMANTIC_USER_IDS_ENV]),
    provider: String(env[FEATURE_FLAGS.SEMANTIC_PROVIDER_ENV] || DEFAULT_PROVIDER)
      .trim()
      .toLowerCase() || DEFAULT_PROVIDER,
    model: String(env[FEATURE_FLAGS.SEMANTIC_MODEL_ENV] || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    timeoutMs: resolveTimeoutMs(env),
    failClosed: false,
    failClosedReason: null
  };
}

function isSemanticShadowEligible({ organizationId = null, actingUserId = null, env } = {}) {
  const config = resolveSemanticInterpreterConfig(env);
  if (!config.shadowEnabled || config.failClosed) {
    return { eligible: false, reason: config.failClosedReason || "SHADOW_DISABLED", config };
  }
  if (config.organizationIds.length && !config.organizationIds.includes(String(organizationId || ""))) {
    return { eligible: false, reason: "ORG_NOT_ALLOWLISTED", config };
  }
  if (config.userIds.length && !config.userIds.includes(String(actingUserId || ""))) {
    return { eligible: false, reason: "USER_NOT_ALLOWLISTED", config };
  }
  return { eligible: true, reason: null, config };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  resolveSemanticInterpreterConfig,
  isSemanticShadowEligible
};
