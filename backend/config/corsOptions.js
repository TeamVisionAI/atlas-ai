/**
 * Express CORS configuration for Atlas API.
 * Production uses an explicit allowlist; development reflects all origins.
 *
 * Public QR pages are served from ATLAS_PUBLIC_URL. Browser form POSTs to
 * /go/:token/bind send that host as Origin — it must be allowlisted or bind
 * never reaches the route.
 */

const DEFAULT_PRODUCTION_ORIGINS = Object.freeze([
  "https://teamvisionfinancial.com",
  "https://www.teamvisionfinancial.com",
  "https://useatlas-ai.com",
  "https://www.useatlas-ai.com",
  "https://app.useatlas-ai.com",
  "http://localhost:5173"
]);

/**
 * Normalize a URL or origin string to `scheme://host[:port]` only.
 * Returns null when the value cannot be parsed as an absolute http(s) URL.
 */
function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
      ? raw
      : `https://${raw}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function parseConfiguredOrigins(env = process.env) {
  return String(env.ATLAS_CORS_ORIGINS || "")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

function buildAllowedOrigins(env = process.env) {
  const fromPublicUrl = normalizeOrigin(env.ATLAS_PUBLIC_URL);
  return [
    ...new Set([
      ...DEFAULT_PRODUCTION_ORIGINS,
      ...parseConfiguredOrigins(env),
      ...(fromPublicUrl ? [fromPublicUrl] : [])
    ])
  ];
}

function buildCorsOptions(env = process.env) {
  const isProduction = env.NODE_ENV === "production";
  const allowedOrigins = buildAllowedOrigins(env);

  if (!isProduction) {
    return {
      origin: true,
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    };
  }

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Deny without throwing — callback(new Error) becomes a misleading 500
      // and blocks same-host public QR form POSTs when Origin is present.
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  };
}

/**
 * Production-only: reject requests that present a non-allowlisted Origin
 * before route handlers run (prevents QR bind side effects).
 * Missing Origin is allowed (curl / same-site navigations without Origin).
 */
function createDisallowedOriginRejector(env = process.env) {
  if (env.NODE_ENV !== "production") {
    return function passthrough(_req, _res, next) {
      next();
    };
  }

  const allowedOrigins = new Set(buildAllowedOrigins(env));

  return function rejectDisallowedCorsOrigin(req, res, next) {
    const origin = req.get("origin");
    if (!origin || allowedOrigins.has(origin)) {
      return next();
    }
    return res.status(403).type("text").send("Forbidden");
  };
}

module.exports = {
  DEFAULT_PRODUCTION_ORIGINS,
  normalizeOrigin,
  buildAllowedOrigins,
  buildCorsOptions,
  createDisallowedOriginRejector
};
