/**
 * BR-147 — Apply migration 052 (campaign_intake_codes + campaign_intake_attributions).
 *
 * Usage (production — after verified backup):
 *   CONFIRM_CAMPAIGN_INTAKE_MIGRATION_052=yes node -r dotenv/config \
 *     backend/dev/applyCampaignIntakeCodesMigration052.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_FILE = path.join(
  __dirname,
  "../database/migrations/052_campaign_intake_codes.sql"
);

function assertConfirmationGate(env = process.env) {
  if (env.CONFIRM_CAMPAIGN_INTAKE_MIGRATION_052 !== "yes") {
    const error = new Error(
      "Refusing to apply. Set CONFIRM_CAMPAIGN_INTAKE_MIGRATION_052=yes only after a verified backup/snapshot."
    );
    error.exitCode = 1;
    error.code = "CAMPAIGN_INTAKE_MIGRATION_CONFIRMATION_REQUIRED";
    throw error;
  }
}

function assertDatabaseUrl(env = process.env) {
  if (!env.DATABASE_URL) {
    const error = new Error("DATABASE_URL not set");
    error.exitCode = 1;
    error.code = "CAMPAIGN_INTAKE_MIGRATION_DATABASE_URL_MISSING";
    throw error;
  }
}

function loadMigration052Sql() {
  if (!fs.existsSync(MIGRATION_FILE)) {
    throw new Error(`Migration file not found: ${MIGRATION_FILE}`);
  }
  const sql = fs.readFileSync(MIGRATION_FILE, "utf8");
  if (/_down\.sql/i.test(path.basename(MIGRATION_FILE))) {
    throw new Error("Refusing to apply a down migration.");
  }
  return sql;
}

async function verifySchema(client) {
  const codes = await client.query(
    `SELECT to_regclass('public.campaign_intake_codes') AS t`
  );
  const attributions = await client.query(
    `SELECT to_regclass('public.campaign_intake_attributions') AS t`
  );
  const codeColumns = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_intake_codes'
    ORDER BY ordinal_position
    `
  );
  const codeIndexes = await client.query(
    `
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'campaign_intake_codes'
    ORDER BY indexname
    `
  );
  const rls = await client.query(
    `
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('campaign_intake_codes', 'campaign_intake_attributions')
    ORDER BY relname
    `
  );

  return {
    codesTablePresent: Boolean(codes.rows[0]?.t),
    attributionsTablePresent: Boolean(attributions.rows[0]?.t),
    codeColumns: codeColumns.rows.map((row) => row.column_name),
    codeIndexes: codeIndexes.rows.map((row) => row.indexname),
    rlsEnabled: Object.fromEntries(
      rls.rows.map((row) => [row.relname, Boolean(row.relrowsecurity)])
    )
  };
}

async function applyCampaignIntakeCodesMigration052({
  env = process.env,
  clientFactory = null
} = {}) {
  assertConfirmationGate(env);
  assertDatabaseUrl(env);
  const sql = loadMigration052Sql();

  const client =
    clientFactory ||
    new Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 30000,
      ssl: { rejectUnauthorized: false }
    });

  const shouldEnd = !clientFactory;

  try {
    if (!clientFactory) {
      await client.connect();
    }

    const before = await verifySchema(client);

    const needsRls =
      before.codesTablePresent &&
      before.attributionsTablePresent &&
      (!before.rlsEnabled?.campaign_intake_codes ||
        !before.rlsEnabled?.campaign_intake_attributions);

    if (before.codesTablePresent && before.attributionsTablePresent && !needsRls) {
      return {
        ok: true,
        applied: false,
        message: "Tables already present with RLS — skipped apply",
        verification: before
      };
    }

    if (before.codesTablePresent && before.attributionsTablePresent && needsRls) {
      // Tables exist (partial prior apply) — RLS/grants + schema reload only.
      const rlsSql = fs.readFileSync(
        path.join(__dirname, "../database/migrations/052_campaign_intake_codes_rls.sql"),
        "utf8"
      );
      await client.query("BEGIN");
      await client.query(rlsSql);
      await client.query("NOTIFY pgrst, 'reload schema'");
      await client.query("COMMIT");
      const after = await verifySchema(client);
      return {
        ok: true,
        applied: true,
        message: "RLS patch applied to existing campaign_intake tables",
        verification: after
      };
    }

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("NOTIFY pgrst, 'reload schema'");
    await client.query("COMMIT");

    const after = await verifySchema(client);

    return {
      ok: true,
      applied: true,
      message: "Migration 052 applied",
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
  applyCampaignIntakeCodesMigration052()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            ok: result.ok,
            applied: result.applied,
            message: result.message,
            codesTablePresent: result.verification?.codesTablePresent || false,
            attributionsTablePresent:
              result.verification?.attributionsTablePresent || false,
            codeColumnCount: result.verification?.codeColumns?.length || 0,
            codeIndexCount: result.verification?.codeIndexes?.length || 0,
            rlsEnabled: result.verification?.rlsEnabled || {}
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
          code: error.code || "CAMPAIGN_INTAKE_MIGRATION_FAILED",
          error: error.message
        })
      );
      process.exit(error.exitCode || 1);
    });
}

module.exports = {
  applyCampaignIntakeCodesMigration052,
  assertConfirmationGate,
  assertDatabaseUrl,
  loadMigration052Sql,
  verifySchema
};
