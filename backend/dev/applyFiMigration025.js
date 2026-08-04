/**
 * RC3 — Apply migration 025 to the database referenced by DATABASE_URL.
 *
 * SAFETY: Requires explicit confirmation flag.
 * Do not run until a verified backup/snapshot ID is recorded.
 * This helper is not a substitute for a backup.
 *
 * Usage:
 *   CONFIRM_FI_MIGRATION_025=yes node -r dotenv/config backend/dev/applyFiMigration025.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function assertConfirmationGate(env = process.env) {
  if (env.CONFIRM_FI_MIGRATION_025 !== "yes") {
    const error = new Error(
      "Refusing to apply. Set CONFIRM_FI_MIGRATION_025=yes only after a verified backup/snapshot."
    );
    error.exitCode = 1;
    error.code = "FI_MIGRATION_CONFIRMATION_REQUIRED";
    throw error;
  }
}

function assertDatabaseUrl(env = process.env) {
  if (!env.DATABASE_URL) {
    const error = new Error("DATABASE_URL not set");
    error.exitCode = 1;
    error.code = "FI_MIGRATION_DATABASE_URL_MISSING";
    throw error;
  }
}

function loadMigration025Sql() {
  const sqlPath = path.join(
    __dirname,
    "../database/migrations/025_financial_intelligence_strategy_evaluations.sql"
  );
  if (!fs.existsSync(sqlPath)) {
    const error = new Error("Migration 025 SQL file not found");
    error.exitCode = 1;
    error.code = "FI_MIGRATION_FILE_MISSING";
    throw error;
  }
  return fs.readFileSync(sqlPath, "utf8");
}

async function applyFiMigration025({ env = process.env, clientFactory = null } = {}) {
  assertConfirmationGate(env);
  assertDatabaseUrl(env);
  const sql = loadMigration025Sql();

  const client =
    clientFactory ||
    new Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 30000
    });

  let shouldEnd = !clientFactory;
  try {
    if (!clientFactory) {
      await client.connect();
    }

    const before = await client.query(
      `SELECT to_regclass('public.atlas_fi_strategy_evaluations') AS t`
    );
    if (before.rows[0]?.t) {
      return {
        ok: true,
        applied: false,
        fiTablePresent: true,
        message: "Table already present — skipped apply; run verifyFiProductionSchema.js"
      };
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback errors */
      }
      throw error;
    }

    const after = await client.query(
      `SELECT to_regclass('public.atlas_fi_strategy_evaluations') AS t`
    );

    if (!after.rows[0]?.t) {
      const error = new Error("Migration 025 completed but table is still missing");
      error.exitCode = 1;
      error.code = "FI_MIGRATION_VERIFY_FAILED";
      throw error;
    }

    return {
      ok: true,
      applied: true,
      fiTablePresent: true,
      message: "Migration 025 applied. Run verifyFiProductionSchema.js next."
    };
  } finally {
    if (shouldEnd) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  try {
    const result = await applyFiMigration025();
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    // Never print connection strings or env values.
    console.error(
      JSON.stringify({
        ok: false,
        applied: false,
        error: error.message,
        code: error.code || "FI_MIGRATION_ERROR"
      })
    );
    process.exit(error.exitCode || 1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  assertConfirmationGate,
  assertDatabaseUrl,
  loadMigration025Sql,
  applyFiMigration025
};
