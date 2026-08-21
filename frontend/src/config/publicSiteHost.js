/**
 * Hostname-aware public site branding for dual-domain migration.
 * Atlas marketing: useatlas-ai.com
 * App shell: app.useatlas-ai.com
 * Team Vision marketing: teamvisionfinancial.com (+ www, Vercel)
 */

export const PUBLIC_SITE_BRAND = Object.freeze({
  ATLAS: "atlas",
  TEAM_VISION: "team_vision",
  APP: "app"
});

export const ATLAS_APP_LOGIN_URL = "https://app.useatlas-ai.com/app/login";
export const ATLAS_MARKETING_ORIGIN = "https://useatlas-ai.com";

const ATLAS_MARKETING_HOSTS = new Set(["useatlas-ai.com", "www.useatlas-ai.com"]);

const ATLAS_APP_HOSTS = new Set(["app.useatlas-ai.com"]);

const TEAM_VISION_HOSTS = new Set([
  "teamvisionfinancial.com",
  "www.teamvisionfinancial.com"
]);

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

/**
 * @param {string} [hostname] — defaults to window.location.hostname in browser
 * @returns {"atlas"|"team_vision"|"app"}
 */
export function resolvePublicSiteBrand(hostname) {
  const host = normalizeHostname(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  );

  if (!host || host === "localhost" || host === "127.0.0.1") {
    // Local Vite: default to Team Vision marketing so / stays TV Home;
    // Atlas pages are reachable at /atlas.
    return PUBLIC_SITE_BRAND.TEAM_VISION;
  }

  if (ATLAS_APP_HOSTS.has(host)) {
    return PUBLIC_SITE_BRAND.APP;
  }

  if (ATLAS_MARKETING_HOSTS.has(host)) {
    return PUBLIC_SITE_BRAND.ATLAS;
  }

  if (TEAM_VISION_HOSTS.has(host) || host.endsWith(".vercel.app")) {
    return PUBLIC_SITE_BRAND.TEAM_VISION;
  }

  // Unknown hosts (preview aliases): prefer Team Vision marketing compatibility.
  return PUBLIC_SITE_BRAND.TEAM_VISION;
}

export function isAtlasMarketingHost(hostname) {
  return resolvePublicSiteBrand(hostname) === PUBLIC_SITE_BRAND.ATLAS;
}

export function isAtlasAppHost(hostname) {
  return resolvePublicSiteBrand(hostname) === PUBLIC_SITE_BRAND.APP;
}

export function isTeamVisionMarketingHost(hostname) {
  return resolvePublicSiteBrand(hostname) === PUBLIC_SITE_BRAND.TEAM_VISION;
}

/** Absolute Sign in URL for Atlas marketing CTAs (always points at app host). */
export function getAtlasAppLoginUrl() {
  return ATLAS_APP_LOGIN_URL;
}

/**
 * Hostname-aware public root decision.
 * - useatlas-ai.com → Atlas product homepage
 * - app.useatlas-ai.com → /app/login (never Team Vision marketing)
 * - teamvisionfinancial.com (+ local/vercel) → Team Vision homepage
 */
export function resolvePublicRootDecision(hostname) {
  const brand = resolvePublicSiteBrand(hostname);
  if (brand === PUBLIC_SITE_BRAND.APP) {
    return { kind: "redirect", to: "/app/login" };
  }
  if (brand === PUBLIC_SITE_BRAND.ATLAS) {
    return { kind: "atlas_home" };
  }
  return { kind: "team_vision_home" };
}
