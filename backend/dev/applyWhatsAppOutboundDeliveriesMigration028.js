/**
 * BR-075 — Apply migration 028 (whatsapp_outbound_deliveries).
 *
 * SAFETY: Requires explicit confirmation flag.
 * Do not run until a verified backup/snapshot ID is recorded.
 * This helper is not a substitute for a backup.
 *
 * Usage:
 *   CONFIRM_WHATSAPP_OUTBOUND_MIGRATION_028=yes node -r dotenv/config \
 *     backend/dev/applyWhatsAppOutboundDeliveriesMigration028.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function assertConfirmationGate(env = process.env) {
  if (env.CONFIRM_WHATSAPP_OUTBOUND_MIGRATION_028 !== "yes") {
    const error = new Error(
      "Refusing to apply. Set CONFIRM_WHATSAPP_OUTBOUND_MIGRATION_028=yes only after a verified backup/snapshot."
    );
    error.exitCode = 1;
    error.code = "WA_OUTBOUND_MIGRATION_CONFIRMATION_REQUIRED";
    throw error;
  }
}

function assertDatabaseUrl(env = process.env) {
  if (!env.DATABASE_URL) {
    const error = new Error("DATABASE_URL not set");
    error.exitCode = 1;
    error.code = "WA_OUTBOUND_MIGRATION_DATABASE_URL_MISSING";
    throw error;
  }
}

function loadMigration028Sql() {
  const sqlPath = path.join(
    __dirname,
    "../database/migrations/028_whatsapp_outbound_deliveries.sql"
  );

  if (!fs.existsSync(sqlPath)) {
    const error = new Error("Migration 028 SQL file not found");
    error.exitCode = 1;
    error.code = "WA_OUTBOUND_MIGRATION_FILE_MISSING";
    throw error;
  }

  return fs.readFileSync(sqlPath, "utf8");
}

async function verifySchema(client) {
  const table = await client.query(
    `SELECT to_regclass('public.whatsapp_outbound_deliveries') AS t`
  );
  const columns = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_outbound_deliveries'
    ORDER BY ordinal_position
    `
  );
  const indexes = await client.query(
    `
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_outbound_deliveries'
    ORDER BY indexname
    `
  );
  const securities026 = await client.query(
    `SELECT to_regclass('public.atlas_user_securities_authorization') AS t`
  );
  const bootstrap027 = await client.query(
    `SELECT to_regclass('public.atlas_organization_securities_authority_bootstrap') AS t`
  );

  return {
    tablePresent: Boolean(table.rows[0]?.t),
    columns: columns.rows.map((row) => row.column_name),
    indexes: indexes.rows.map((row) => row.indexname),
    migration026Intact: Boolean(securities026.rows[0]?.t),
    migration027Intact: Boolean(bootstrap027.rows[0]?.t)
  };
}

async function applyWhatsAppOutboundDeliveriesMigration028({
  env = process.env,
  clientFactory = null
} = {}) {
  assertConfirmationGate(env);
  assertDatabaseUrl(env);
  const sql = loadMigration028Sql();

  const client =
    clientFactory ||
    new Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 30000
    });

  const shouldEnd = !clientFactory;

  try {
    if (!clientFactory) {
      await client.connect();
    }

    const before = await verifySchema(client);

    if (before.tablePresent) {
      return {
        ok: true,
        applied: false,
        message: "Table already present — skipped apply",
        verification: before
      };
    }

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    const after = await verifySchema(client);

    return {
      ok: true,
      applied: true,
      message: "Migration 028 applied",
      verification: after
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }

    throw error;
  } finally {
    if (shouldEnd) {
      await client.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  applyWhatsAppOutboundDeliveriesMigration028()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            ok: result.ok,
            applied: result.applied,
            message: result.message,
            tablePresent: result.verification?.tablePresent || false,
            columnCount: result.verification?.columns?.length || 0,
            indexCount: result.verification?.indexes?.length || 0,
            migration026Intact: result.verification?.migration026Intact || false,
            migration027Intact: result.verification?.migration027Intact || false,
            // Never print connection strings or secrets.
            backupNote:
              "Operator must retain a verified Supabase/Postgres snapshot before apply. This script does not create backups."
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          ok: false,
          code: error.code || "WA_OUTBOUND_MIGRATION_FAILED",
          error: error.message
        })
      );
      process.exit(error.exitCode || 1);
    });
}

module.exports = {
  applyWhatsAppOutboundDeliveriesMigration028,
  assertConfirmationGate,
  assertDatabaseUrl,
  loadMigration028Sql,
  verifySchema
};
