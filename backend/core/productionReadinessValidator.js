/**
 * Sprint 19 — Production readiness validation.
 * Fails startup loudly when required infrastructure or secrets are missing.
 */

function isProduction() {
  return process.env.NODE_ENV === "production";
}

const REQUIRED_TABLES = Object.freeze([
  "prospects",
  "atlas_users",
  "organizations",
  "atlas_business_events"
]);

function isGoogleOAuthEnabled() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

function validateEnvironmentSecrets() {
  if (!isProduction()) {
    return [];
  }

  const missing = [];

  if (!process.env.JWT_SECRET?.trim() && !process.env.ATLAS_JWT_SECRET?.trim()) {
    missing.push("JWT_SECRET (or ATLAS_JWT_SECRET)");
  }

  if (isGoogleOAuthEnabled() && !process.env.GOOGLE_OAUTH_STATE_SECRET?.trim()) {
    missing.push("GOOGLE_OAUTH_STATE_SECRET (required when Google OAuth is enabled)");
  }

  return missing;
}

async function validateRequiredTables() {
  if (!isProduction()) {
    return [];
  }

  const { supabase } = require("../services/supabaseService");
  const missing = [];

  for (const tableName of REQUIRED_TABLES) {
    const { error } = await supabase.from(tableName).select("*").limit(1);

    if (error) {
      const message = String(error.message || "");
      const code = error.code || "";

      if (
        code === "42P01" ||
        message.includes("does not exist") ||
        message.includes("Could not find the table")
      ) {
        missing.push(tableName);
      } else if (code === "PGRST116" || message.includes("permission denied")) {
        continue;
      } else {
        throw new Error(
          `Production table check failed for "${tableName}": ${message || code}`
        );
      }
    }
  }

  return missing;
}

function assertProductionReadinessSync() {
  const missingSecrets = validateEnvironmentSecrets();

  if (missingSecrets.length > 0) {
    throw new Error(
      `Atlas production startup blocked. Missing required secrets: ${missingSecrets.join(", ")}.`
    );
  }
}

async function assertProductionReadinessAsync() {
  assertProductionReadinessSync();

  const missingTables = await validateRequiredTables();

  if (missingTables.length > 0) {
    throw new Error(
      `Atlas production startup blocked. Missing required database tables: ${missingTables.join(", ")}. ` +
        "Apply pending migrations before starting production."
    );
  }
}

function forbidProductionInMemoryFallback(moduleName) {
  if (isProduction()) {
    throw new Error(
      `Atlas production blocked in-memory fallback for ${moduleName}. ` +
        "Required database tables must exist in production."
    );
  }
}

module.exports = {
  REQUIRED_TABLES,
  isGoogleOAuthEnabled,
  validateEnvironmentSecrets,
  validateRequiredTables,
  assertProductionReadinessSync,
  assertProductionReadinessAsync,
  forbidProductionInMemoryFallback
};
