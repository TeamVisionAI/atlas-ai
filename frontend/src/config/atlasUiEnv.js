/**
 * Frontend Atlas environment helpers.
 * Banner and fail-closed routing key off VITE_ATLAS_ENV, not NODE_ENV.
 */

function readEnv(env) {
  if (env) {
    return env;
  }

  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}

export function resolveAtlasUiEnv(env) {
  return String(readEnv(env).VITE_ATLAS_ENV || "")
    .trim()
    .toLowerCase();
}

export function isStagingUi(env) {
  return resolveAtlasUiEnv(env) === "staging";
}
