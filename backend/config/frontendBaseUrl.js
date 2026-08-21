/**
 * Resolves the public Atlas frontend origin for transactional links
 * (password reset, invitations, OAuth redirects).
 *
 * Invitation links always prefer the Atlas app host for newly issued mail.
 */

const FRONTEND_URL_ENV_KEYS = Object.freeze(["FRONTEND_URL", "ATLAS_FRONTEND_URL", "APP_URL"]);

const DEV_DEFAULT_FRONTEND_URL = "http://localhost:5173";
const ATLAS_APP_ORIGIN = "https://app.useatlas-ai.com";
const TEAM_VISION_MARKETING_HOSTS = new Set([
  "teamvisionfinancial.com",
  "www.teamvisionfinancial.com"
]);

function isProductionNodeEnv(env = process.env) {
  return env.NODE_ENV === "production";
}

function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function readConfiguredFrontendUrl(env = process.env) {
  for (const key of FRONTEND_URL_ENV_KEYS) {
    const value = String(env[key] || "").trim();

    if (value) {
      return stripTrailingSlash(value);
    }
  }

  return null;
}

function hostnameOf(urlValue) {
  try {
    return new URL(urlValue).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isTeamVisionMarketingUrl(urlValue) {
  return TEAM_VISION_MARKETING_HOSTS.has(hostnameOf(urlValue));
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

/**
 * Newly issued invitation / accept links must use the Atlas app host.
 * Legacy TV marketing FRONTEND_URL values are remapped; localhost stays for local.
 */
function resolveInvitationFrontendBaseUrl(env = process.env) {
  const explicitApp = stripTrailingSlash(env.ATLAS_APP_URL || env.ATLAS_INVITE_BASE_URL || "");
  if (explicitApp) {
    return explicitApp;
  }

  const configured = readConfiguredFrontendUrl(env);

  if (configured) {
    if (isTeamVisionMarketingUrl(configured)) {
      return ATLAS_APP_ORIGIN;
    }
    return configured;
  }

  if (isProductionNodeEnv(env)) {
    return ATLAS_APP_ORIGIN;
  }

  return DEV_DEFAULT_FRONTEND_URL;
}

function buildAcceptInvitationUrl(token, env = process.env) {
  const base = resolveInvitationFrontendBaseUrl(env);
  return `${base}/app/accept-invitation?token=${encodeURIComponent(token)}`;
}

module.exports = {
  FRONTEND_URL_ENV_KEYS,
  DEV_DEFAULT_FRONTEND_URL,
  ATLAS_APP_ORIGIN,
  readConfiguredFrontendUrl,
  resolveFrontendBaseUrl,
  resolveInvitationFrontendBaseUrl,
  buildAcceptInvitationUrl,
  isTeamVisionMarketingUrl
};
