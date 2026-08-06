/**
 * Recruit AI v2 — continuous context-capture feature flags (Phase 3B).
 * Separate from shadow evaluation sampling.
 *
 * Env:
 * - RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED=false
 * - RECRUIT_AI_V2_CONTEXT_CAPTURE_ORGANIZATION_IDS=comma-separated UUIDs
 * - RECRUIT_AI_V2_CONTEXT_CAPTURE_SAMPLE_RATE=0..1 (or 0..100); target 1.0
 * - RECRUIT_AI_V2_CONTEXT_CAPTURE_TIMEOUT_MS=5000
 * - RECRUIT_AI_V2_CONTEXT_CAPTURE_CONFIG={"enabled":false,"organizationIds":[],"sampleRate":0}
 *
 * Fail-closed: missing/malformed → disabled; empty allowlist → no orgs.
 * Defaults OFF. 100% capture ≠ 100% shadow evaluation.
 */

const { FEATURE_FLAGS } = require("./constants");
const { createHash } = require("node:crypto");

const DEFAULT_CAPTURE_CONFIG = Object.freeze({
  enabled: false,
  organizationIds: Object.freeze([]),
  sampleRate: 0,
  timeoutMs: 5000
});

const DEFAULT_CAPTURE_TIMEOUT_MS = 5000;
const MAX_CAPTURE_TIMEOUT_MS = 15000;

function parseBoolean(value) {
  if (value == null || value === "") {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function parseSampleRate(value) {
  if (value == null || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  if (num > 1 && num <= 100) {
    return Math.min(1, num / 100);
  }
  return Math.min(1, num);
}

function parseTimeoutMs(value) {
  if (value == null || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.min(MAX_CAPTURE_TIMEOUT_MS, Math.max(250, Math.floor(num)));
}

function parseOrganizationIds(value) {
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

function parseJsonConfig(raw) {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { ok: true, value: null, malformed: false };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, value: null, malformed: true };
    }
    return { ok: true, value: parsed, malformed: false };
  } catch {
    return { ok: false, value: null, malformed: true };
  }
}

function failClosedConfig(reason = "MALFORMED_CONFIG") {
  return {
    enabled: false,
    organizationIds: [],
    sampleRate: 0,
    timeoutMs: DEFAULT_CAPTURE_TIMEOUT_MS,
    failClosed: true,
    failClosedReason: reason
  };
}

function resolveContextCaptureConfig(env = process.env) {
  const jsonResult = parseJsonConfig(env.RECRUIT_AI_V2_CONTEXT_CAPTURE_CONFIG);
  if (jsonResult.malformed) {
    return failClosedConfig("MALFORMED_CONTEXT_CAPTURE_CONFIG");
  }

  const json = jsonResult.value;
  const enabledFromPrimary = parseBoolean(
    env[FEATURE_FLAGS.CONTEXT_CAPTURE_ENABLED_ENV]
  );

  if (
    env[FEATURE_FLAGS.CONTEXT_CAPTURE_ENABLED_ENV] != null &&
    String(env[FEATURE_FLAGS.CONTEXT_CAPTURE_ENABLED_ENV]).trim() !== "" &&
    enabledFromPrimary == null
  ) {
    return failClosedConfig("MALFORMED_CONTEXT_CAPTURE_ENABLED");
  }

  const enabledFromJson =
    json && Object.prototype.hasOwnProperty.call(json, "enabled")
      ? Boolean(json.enabled)
      : null;

  const enabled =
    enabledFromPrimary ?? enabledFromJson ?? DEFAULT_CAPTURE_CONFIG.enabled;

  const organizationIds = parseOrganizationIds(
    env.RECRUIT_AI_V2_CONTEXT_CAPTURE_ORGANIZATION_IDS ||
      json?.organizationIds ||
      DEFAULT_CAPTURE_CONFIG.organizationIds
  );

  const sampleRate =
    parseSampleRate(env.RECRUIT_AI_V2_CONTEXT_CAPTURE_SAMPLE_RATE) ??
    parseSampleRate(json?.sampleRate) ??
    DEFAULT_CAPTURE_CONFIG.sampleRate;

  const timeoutMs =
    parseTimeoutMs(env.RECRUIT_AI_V2_CONTEXT_CAPTURE_TIMEOUT_MS) ??
    parseTimeoutMs(json?.timeoutMs) ??
    DEFAULT_CAPTURE_TIMEOUT_MS;

  return {
    enabled: Boolean(enabled),
    organizationIds,
    sampleRate: Number(sampleRate) || 0,
    timeoutMs,
    failClosed: false,
    failClosedReason: null
  };
}

function isOrganizationAllowlisted(organizationId, config) {
  if (!organizationId) {
    return false;
  }
  if (!Array.isArray(config.organizationIds) || config.organizationIds.length === 0) {
    return false;
  }
  return config.organizationIds.includes(String(organizationId));
}

function isWithinSampleRate({
  organizationId,
  prospectId,
  inboundMessageId,
  sampleRate
} = {}) {
  const rate = Number(sampleRate) || 0;
  if (rate <= 0) {
    return false;
  }
  if (rate >= 1) {
    return true;
  }

  const material = [
    "context-capture",
    String(organizationId || ""),
    String(prospectId || ""),
    String(inboundMessageId || "")
  ].join("|");
  const digest = createHash("sha256").update(material).digest();
  const bucket = digest.readUInt32BE(0) / 0xffffffff;
  return bucket < rate;
}

/**
 * Eligibility for continuous context capture (independent of shadow sample).
 */
function isEligibleForContextCapture({
  organizationId,
  prospectId,
  inboundMessageId,
  channel = "whatsapp",
  prospectClosed = false,
  env = process.env
} = {}) {
  const config = resolveContextCaptureConfig(env);

  if (config.failClosed) {
    return {
      eligible: false,
      reason: config.failClosedReason || "FAIL_CLOSED",
      config
    };
  }

  if (!config.enabled) {
    return { eligible: false, reason: "CONTEXT_CAPTURE_DISABLED", config };
  }

  if (!organizationId || !prospectId) {
    return { eligible: false, reason: "MISSING_SCOPE", config };
  }

  if (prospectClosed) {
    return { eligible: false, reason: "PROSPECT_CLOSED", config };
  }

  if (channel && String(channel).toLowerCase() !== "whatsapp") {
    return { eligible: false, reason: "UNSUPPORTED_CHANNEL", config };
  }

  if (!Array.isArray(config.organizationIds) || config.organizationIds.length === 0) {
    return { eligible: false, reason: "ORG_ALLOWLIST_EMPTY", config };
  }

  if (!isOrganizationAllowlisted(organizationId, config)) {
    return { eligible: false, reason: "ORG_NOT_ALLOWLISTED", config };
  }

  if (
    !isWithinSampleRate({
      organizationId,
      prospectId,
      inboundMessageId,
      sampleRate: config.sampleRate
    })
  ) {
    return { eligible: false, reason: "SAMPLE_RATE_MISS", config };
  }

  return { eligible: true, reason: null, config };
}

module.exports = {
  DEFAULT_CAPTURE_CONFIG,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  MAX_CAPTURE_TIMEOUT_MS,
  resolveContextCaptureConfig,
  isEligibleForContextCapture,
  isOrganizationAllowlisted,
  isWithinSampleRate
};
