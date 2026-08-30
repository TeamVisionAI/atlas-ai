/**
 * BR-175 — fail-closed quality capture gates.
 * Platform OFF always wins. New tenants default off until configured.
 */

const { FEATURE_FLAGS, MODES } = require("./constants");

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

function parseMode(value) {
  const normalized = String(value || MODES.OFF)
    .trim()
    .toUpperCase();
  if (normalized === MODES.OBSERVE || normalized === MODES.REVIEW || normalized === MODES.OFF) {
    return normalized;
  }
  return MODES.OFF;
}

function resolvePlatformCaptureConfig(env = process.env) {
  const enabled = parseBooleanStrictTrue(env[FEATURE_FLAGS.CAPTURE_ENABLED_ENV]);
  const mode = parseMode(env[FEATURE_FLAGS.MODE_ENV]);

  if (enabled.malformed) {
    return {
      captureEnabled: false,
      mode: MODES.OFF,
      failClosed: true,
      failClosedReason: "MALFORMED_CAPTURE_ENABLED"
    };
  }
  if (!enabled.value) {
    return {
      captureEnabled: false,
      mode: MODES.OFF,
      failClosed: true,
      failClosedReason: "PLATFORM_CAPTURE_OFF"
    };
  }
  if (mode === MODES.OFF) {
    return {
      captureEnabled: false,
      mode: MODES.OFF,
      failClosed: true,
      failClosedReason: "PLATFORM_MODE_OFF"
    };
  }

  return {
    captureEnabled: true,
    mode,
    failClosed: false,
    failClosedReason: null
  };
}

function clampSampleRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 1;
  }
  if (n < 0) {
    return 0;
  }
  if (n > 1) {
    return 1;
  }
  return n;
}

function isCaptureEligible({
  organizationId = null,
  tenantSettings = null,
  env,
  sampleRoll = 0
} = {}) {
  const platform = resolvePlatformCaptureConfig(env);
  if (!platform.captureEnabled || platform.failClosed) {
    return {
      eligible: false,
      reason: platform.failClosedReason || "PLATFORM_CAPTURE_OFF",
      platform,
      effectiveMode: MODES.OFF
    };
  }
  if (!organizationId) {
    return {
      eligible: false,
      reason: "ORGANIZATION_REQUIRED",
      platform,
      effectiveMode: MODES.OFF
    };
  }
  if (!tenantSettings?.participationEnabled) {
    return {
      eligible: false,
      reason: "TENANT_NOT_PARTICIPATING",
      platform,
      effectiveMode: MODES.OFF
    };
  }
  const tenantMode = parseMode(tenantSettings.mode);
  if (tenantMode === MODES.OFF) {
    return {
      eligible: false,
      reason: "TENANT_MODE_OFF",
      platform,
      effectiveMode: MODES.OFF
    };
  }
  const sampleRate = clampSampleRate(tenantSettings.sampleRate);
  if (Number(sampleRoll) >= sampleRate) {
    return {
      eligible: false,
      reason: "SAMPLED_OUT",
      platform,
      effectiveMode: MODES.OFF
    };
  }

  const effectiveMode = platform.mode === MODES.OBSERVE ? MODES.OBSERVE : tenantMode;
  return {
    eligible: true,
    reason: null,
    platform,
    effectiveMode
  };
}

module.exports = {
  parseBooleanStrictTrue,
  parseMode,
  resolvePlatformCaptureConfig,
  clampSampleRate,
  isCaptureEligible
};
