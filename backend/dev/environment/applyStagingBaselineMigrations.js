#!/usr/bin/env node
/**
 * Apply Atlas baseline migrations 001–038 to STAGING Supabase only.
 * Never apply 039. Never run against production ref gjuheeztwxbnscjobkzm.
 */

const fs = require("fs");
const path = require("path");

const {
  assertStagingSupabaseIsolation,
  resolveAtlasEnv,
  PRODUCTION_SUPABASE_PROJECT_REF
} = require("../../config/atlasEnvironment");

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

const MIGRATIONS_DIR = path.join(__dirname, "../../database/migrations");
const STAGING_PRE_BASELINE = path.join(
  __dirname,
  "../../database/staging/000_legacy_pre_baseline.sql"
);
const MAX_BASELINE_VERSION = 38;

function loadSql(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQL file not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function listStagingBaselineMigrations(migrationsDir = MIGRATIONS_DIR) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name))
    .filter((name) => !/_down\.sql$/i.test(name));

  const selected = files.filter((name) => {
    const version = Number.parseInt(name.slice(0, 3), 10);
    return version >= 1 && version <= MAX_BASELINE_VERSION;
  });

  selected.sort((a, b) => {
    const versionDiff = Number.parseInt(a.slice(0, 3), 10) - Number.parseInt(b.slice(0, 3), 10);

    if (versionDiff !== 0) {
      return versionDiff;
    }

    if (a.includes("platform_bootstrap")) {
      return -1;
    }

    if (b.includes("platform_bootstrap")) {
      return 1;
    }

    return a.localeCompare(b);
  });

  return selected;
}

function assertStagingMigrationTarget() {
  if (resolveAtlasEnv() !== "staging") {
    throw new Error(
      "applyStagingBaselineMigrations requires ATLAS_ENV=staging. Refusing to run."
    );
  }

  assertStagingSupabaseIsolation();
}

async function applyStagingBaselineMigrations() {
  assertStagingMigrationTarget();

  const { withPostgresTransaction } = require("./databaseConnection");
  const applied = [];
  const migrationFiles = listStagingBaselineMigrations();

  if (migrationFiles.some((name) => name.startsWith("039_"))) {
    throw new Error("Refusing to apply migration 039. Audio schema is out of scope.");
  }

  await withPostgresTransaction(async (client) => {
    console.log("Applying staging pre-baseline (empty legacy prospects + conversation_logs)");
    await client.query(loadSql(STAGING_PRE_BASELINE));
    applied.push("000_legacy_pre_baseline");

    for (const fileName of migrationFiles) {
      console.log(`Applying migration ${fileName}`);
      await client.query(loadSql(path.join(MIGRATIONS_DIR, fileName)));
      applied.push(fileName);
    }
  });

  return applied;
}

async function main() {
  loadStagingEnv();
  console.log("Atlas staging baseline migrations (001–038 only)\n");
  console.log("Protected production Supabase ref:", PRODUCTION_SUPABASE_PROJECT_REF);
  console.log("");

  const applied = await applyStagingBaselineMigrations();

  console.log("");
  console.log("Applied:", applied.join(", "));
  console.log("Staging baseline 001–038 complete. Migration 039 was not applied.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("applyStagingBaselineMigrations failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  MAX_BASELINE_VERSION,
  listStagingBaselineMigrations,
  applyStagingBaselineMigrations,
  assertStagingMigrationTarget
};
