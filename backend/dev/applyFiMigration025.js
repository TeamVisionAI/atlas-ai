/**
 * RC3 — Apply migration 025 to the database referenced by DATABASE_URL.
 *
 * SAFETY: Requires explicit confirmation flag.
 * Do not run until a verified backup/snapshot ID is recorded.
 *
 * Usage:
 *   CONFIRM_FI_MIGRATION_025=yes node -r dotenv/config backend/dev/applyFiMigration025.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  if (process.env.CONFIRM_FI_MIGRATION_025 !== "yes") {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          "Refusing to apply. Set CONFIRM_FI_MIGRATION_025=yes only after a verified backup/snapshot."
      })
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, error: "DATABASE_URL not set" }));
    process.exit(1);
  }

  const sqlPath = path.join(
    __dirname,
    "../database/migrations/025_financial_intelligence_strategy_evaluations.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000
  });

  await client.connect();
  try {
    const before = await client.query(
      `SELECT to_regclass('public.atlas_fi_strategy_evaluations') AS t`
    );
    if (before.rows[0]?.t) {
      console.log(
        JSON.stringify({
          ok: true,
          applied: false,
          message: "Table already present — skipped apply; run verifyFiProductionSchema.js"
        })
      );
      return;
    }

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    const after = await client.query(
      `SELECT to_regclass('public.atlas_fi_strategy_evaluations') AS t`
    );

    console.log(
      JSON.stringify({
        ok: Boolean(after.rows[0]?.t),
        applied: true,
        fiTablePresent: Boolean(after.rows[0]?.t),
        message: "Migration 025 applied. Run verifyFiProductionSchema.js next."
      })
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(JSON.stringify({ ok: false, applied: false, error: error.message }));
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
