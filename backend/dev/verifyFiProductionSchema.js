/**
 * RC3 — Read-only verification that migration 025 schema exists.
 * Loads dotenv. Does not apply migrations. Does not print connection strings.
 *
 * Usage: node -r dotenv/config backend/dev/verifyFiProductionSchema.js
 */

require("dotenv").config();

const { Client } = require("pg");

const REQUIRED_COLUMNS = [
  "id",
  "organization_id",
  "review_id",
  "prospect_id",
  "evaluation_family_id",
  "version",
  "status",
  "current_iul_snapshot",
  "term_quote",
  "investment_horizon",
  "risk_profile",
  "projection_outputs",
  "evaluation_payload",
  "missing_data_warnings",
  "replacement_warnings",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "deleted_at"
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, error: "DATABASE_URL not set" }));
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 20000
  });

  try {
    await client.connect();
    const table = await client.query(
      `SELECT to_regclass('public.atlas_fi_strategy_evaluations') AS t`
    );
    const present = Boolean(table.rows[0]?.t);

    if (!present) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            fiTablePresent: false,
            message: "atlas_fi_strategy_evaluations not found — apply migration 025"
          },
          null,
          2
        )
      );
      process.exit(2);
    }

    const cols = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'atlas_fi_strategy_evaluations'
       ORDER BY ordinal_position`
    );
    const columnNames = cols.rows.map((row) => row.column_name);
    const missingColumns = REQUIRED_COLUMNS.filter((name) => !columnNames.includes(name));

    const constraints = await client.query(
      `SELECT conname, contype
       FROM pg_constraint
       WHERE conrelid = 'public.atlas_fi_strategy_evaluations'::regclass`
    );

    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'atlas_fi_strategy_evaluations'`
    );

    const count = await client.query(
      `SELECT COUNT(*)::int AS n FROM atlas_fi_strategy_evaluations WHERE deleted_at IS NULL`
    );

    const ok =
      missingColumns.length === 0 &&
      constraints.rows.some((row) => row.conname.includes("family_version_unique")) &&
      indexes.rows.some((row) => row.indexname.includes("review")) &&
      indexes.rows.some((row) => row.indexname.includes("family"));

    console.log(
      JSON.stringify(
        {
          ok,
          fiTablePresent: true,
          columnCount: columnNames.length,
          missingColumns,
          constraintNames: constraints.rows.map((row) => row.conname),
          indexNames: indexes.rows.map((row) => row.indexname),
          activeRowCount: count.rows[0].n,
          notes: [
            "Tenant isolation is application-enforced via organization_id.",
            "prospect_id is optional FI CRM linkage outside PI Facts.",
            "No connection strings or row payloads are printed."
          ]
        },
        null,
        2
      )
    );

    process.exit(ok ? 0 : 3);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
