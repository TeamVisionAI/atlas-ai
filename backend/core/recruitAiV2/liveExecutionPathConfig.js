/**
 * Recruit AI v2 — live execution path cutover gate (BR-112).
 *
 * Independent from BR-111 authorization. When enabled, the authoritative live CE
 * may pass options.allowExecution=true into processRecruitAiV2Turn.
 * BR-111 still decides whether mutation is permitted.
 *
 * Env:
 * - RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED=true|false
 *
 * Fail-closed: absent / malformed → disabled.
 * Shadow and advisory must never use this gate to set allowExecution.
 */

const { FEATURE_FLAGS } = require("./constants");

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

function failClosedConfig(reason) {
  return {
    enabled: false,
    failClosed: true,
    failClosedReason: reason
  };
}

/**
 * Resolve live-path cutover config. Defaults keep the live path closed.
 */
function resolveLiveExecutionPathConfig(env = process.env) {
  const flag = parseBooleanStrictTrue(
    env[FEATURE_FLAGS.LIVE_EXECUTION_PATH_ENABLED_ENV]
  );
  if (flag.malformed) {
    return failClosedConfig("MALFORMED_LIVE_EXECUTION_PATH_ENABLED");
  }
  return {
    enabled: Boolean(flag.value),
    failClosed: false,
    failClosedReason: null
  };
}

function isLiveExecutionPathEnabled(env = process.env) {
  return resolveLiveExecutionPathConfig(env).enabled === true;
}

/**
 * Derive allowExecution for a turn.
 * Only the authoritative live CE bridge (invocationSource === "live_ce") may
 * request allowExecution, and only when the live-path flag is exactly true.
 *
 * Shadow / advisory / playground / sync tests must use other sources → false.
 */
function resolveAllowExecutionForLiveTurn({
  env = process.env,
  invocationSource = null
} = {}) {
  if (invocationSource !== "live_ce") {
    return false;
  }
  return isLiveExecutionPathEnabled(env) === true;
}

module.exports = {
  resolveLiveExecutionPathConfig,
  isLiveExecutionPathEnabled,
  resolveAllowExecutionForLiveTurn
};
