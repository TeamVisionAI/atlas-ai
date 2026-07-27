/**
 * Express CORS configuration for Atlas API.
 * Production uses an explicit allowlist; development reflects all origins.
 */

const DEFAULT_PRODUCTION_ORIGINS = Object.freeze([
  "https://teamvisionfinancial.com",
  "https://www.teamvisionfinancial.com",
  "http://localhost:5173"
]);

function parseConfiguredOrigins() {
  return String(process.env.ATLAS_CORS_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildAllowedOrigins() {
  return [...new Set([...DEFAULT_PRODUCTION_ORIGINS, ...parseConfiguredOrigins()])];
}

function buildCorsOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const allowedOrigins = buildAllowedOrigins();

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

      if (process.env.NODE_ENV !== "production") {
        console.warn("[cors] blocked origin:", origin);
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  };
}

module.exports = {
  DEFAULT_PRODUCTION_ORIGINS,
  buildAllowedOrigins,
  buildCorsOptions
};
