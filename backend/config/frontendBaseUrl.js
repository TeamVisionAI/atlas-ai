/**
 * Resolves the public Atlas frontend origin for transactional links
 * (password reset, invitations, OAuth redirects).
 *
 * Production requires an explicit env var — never falls back to localhost.
 */

const FRONTEND_URL_ENV_KEYS = Object.freeze(["FRONTEND_URL", "ATLAS_FRONTEND_URL", "APP_URL"]);

const DEV_DEFAULT_FRONTEND_URL = "http://localhost:5173";

function isProductionNodeEnv(env = process.env) {
  return env.NODE_ENV === "production";
}

function readConfiguredFrontendUrl(env = process.env) {
  for (const key of FRONTEND_URL_ENV_KEYS) {
    const value = String(env[key] || "").trim();

    if (value) {
      return value.replace(/\/$/, "");
    }
  }

  return null;
}

function resolveFrontendBaseUrl(env = process.env) {
  const configured = readConfiguredFrontendUrl(env);

  if (configured) {
    return configured;
  }

  if (isProductionNodeEnv(env)) {
    throw new Error(
      "FRONTEND_URL is required in production for password reset and invitation links. " +
        `Set one of: ${FRONTEND_URL_ENV_KEYS.join(", ")}.`
    );
  }

  return DEV_DEFAULT_FRONTEND_URL;
}

module.exports = {
  FRONTEND_URL_ENV_KEYS,
  DEV_DEFAULT_FRONTEND_URL,
  readConfiguredFrontendUrl,
  resolveFrontendBaseUrl
};
