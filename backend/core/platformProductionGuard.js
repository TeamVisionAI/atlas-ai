/**
 * Platform foundation production guards.
 * Ensures production never starts without required security configuration.
 */

const { readConfiguredFrontendUrl } = require("../config/frontendBaseUrl");

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function assertProductionPlatformConfig() {
  if (!isProduction()) {
    return;
  }

  const missing = [];

  if (!process.env.SUPABASE_URL?.trim()) {
    missing.push("SUPABASE_URL");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!readConfiguredFrontendUrl()) {
    missing.push("FRONTEND_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `Atlas production startup blocked. Missing required environment variables: ${missing.join(", ")}. ` +
        "The backend must use the Supabase service role key in production; anon key and Postgres fallback are development-only."
    );
  }
}

module.exports = {
  isProduction,
  assertProductionPlatformConfig
};
