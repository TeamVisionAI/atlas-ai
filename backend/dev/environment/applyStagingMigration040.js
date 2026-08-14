#!/usr/bin/env node
/**
 * Apply migration 040 (STT audit columns) to STAGING Supabase only.
 * Never production. Never re-runs 001–039. Never runs *_down.sql.
 */

const fs = require("fs");
const path = require("path");

const {
  assertStagingSupabaseIsolation,
  resolveAtlasEnv,
  extractSupabaseProjectRefFromEnv,
  PRODUCTION_SUPABASE_PROJECT_REF
} = require("../../config/atlasEnvironment");

const STAGING_REF = "jmobhvosciwanvsqpnwk";
const MIGRATION_FILE = path.join(
  __dirname,
  "../../database/migrations/040_communication_media_transcript_audit.sql"
);

function loadStagingEnv() {
  const dotenv = require("dotenv");
  const repoRoot = path.resolve(__dirname, "../../..");
  const explicitEnvFile = process.env.ATLAS_STAGING_ENV_FILE
    ? path.resolve(process.env.ATLAS_STAGING_ENV_FILE)
    : null;
  const defaultStagingFile = path.join(repoRoot, ".env.staging.local");

  if (explicitEnvFile && fs.existsSync(explicitEnvFile)) {
    dotenv.config({ path: explicitEnvFile, override: true });
    return;
  }

  if (fs.existsSync(defaultStagingFile)) {
    dotenv.config({ path: defaultStagingFile, override: true });
    return;
  }

  dotenv.config();
}

function assertStaging040Target() {
  if (resolveAtlasEnv() !== "staging") {
    throw new Error("applyStagingMigration040 requires ATLAS_ENV=staging. Refusing to run.");
  }

  assertStagingSupabaseIsolation();

  const liveRef = extractSupabaseProjectRefFromEnv();
  if (liveRef !== STAGING_REF) {
    throw new Error(
      `Refusing 040: expected staging ref ${STAGING_REF}, got ${liveRef || "(missing)"}`
    );
  }

  const blob = [
    process.env.SUPABASE_URL,
    process.env.DATABASE_URL,
    process.env.ATLAS_EXPECTED_SUPABASE_REF
  ]
    .filter(Boolean)
    .join("\n");

  if (blob.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    throw new Error("Refusing 040: production Supabase ref is present in staging env.");
  }
}

async function applyStagingMigration040() {
  loadStagingEnv();
  assertStaging040Target();

  if (!fs.existsSync(MIGRATION_FILE)) {
    throw new Error(`Missing ${MIGRATION_FILE}`);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, "utf8");
  if (/_down\.sql/i.test(path.basename(MIGRATION_FILE))) {
    throw new Error("Refusing to apply a down migration.");
  }

  const { connectPostgres } = require("./databaseConnection");
  const client = await connectPostgres();

  try {
    console.log("ATLAS_ENV", resolveAtlasEnv());
    console.log("SUPABASE ref", extractSupabaseProjectRefFromEnv());
    console.log("Applying 040_communication_media_transcript_audit.sql to staging only");
    await client.query(sql);
    console.log("040 applied");
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  applyStagingMigration040().catch((error) => {
    console.error("040 FAILED:", error.message);
    process.exit(1);
  });
}

module.exports = {
  applyStagingMigration040,
  assertStaging040Target,
  STAGING_REF
};
