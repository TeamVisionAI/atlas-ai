/**
 * RC3 Phase B — structural verification for migration 025.
 * Does not apply migrations. Optional DB check when DATABASE_URL is present.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const forward = path.join(
  root,
  "database/migrations/025_financial_intelligence_strategy_evaluations.sql"
);
const down = path.join(
  root,
  "database/migrations/025_financial_intelligence_strategy_evaluations_down.sql"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifySqlFiles() {
  assert(fs.existsSync(forward), "Forward migration 025 missing");
  assert(fs.existsSync(down), "Down migration 025 missing");

  const sql = fs.readFileSync(forward, "utf8");
  const downSql = fs.readFileSync(down, "utf8");

  assert(sql.includes("atlas_fi_strategy_evaluations"), "Table name missing");
  assert(sql.includes("organization_id UUID NOT NULL"), "organization_id required");
  assert(sql.includes("review_id UUID NOT NULL"), "review_id required");
  assert(sql.includes("REFERENCES atlas_policy_reviews(id)"), "review FK required");
  assert(sql.includes("ON DELETE CASCADE"), "intentional cascade on review delete");
  assert(
    sql.includes("atlas_fi_strategy_evaluations_family_version_unique"),
    "family/version unique constraint required"
  );
  assert(sql.includes("idx_atlas_fi_strategy_evaluations_org"), "org index required");
  assert(sql.includes("idx_atlas_fi_strategy_evaluations_review"), "review index required");
  assert(sql.includes("idx_atlas_fi_strategy_evaluations_family"), "family index required");
  assert(sql.includes("prospect_id UUID"), "optional prospect_id present");
  assert(sql.includes("current_iul_snapshot JSONB"), "snapshot JSONB present");
  assert(sql.includes("created_at TIMESTAMPTZ"), "created_at present");
  assert(sql.includes("updated_at TIMESTAMPTZ"), "updated_at present");
  assert(
    sql.includes("Optional CRM linkage") || sql.includes("prospect_id"),
    "prospect boundary comment/column present"
  );
  assert(downSql.includes("DROP TABLE IF EXISTS atlas_fi_strategy_evaluations"), "down drops table");

  // Application-level tenant isolation (no RLS policies in this migration).
  assert(!sql.includes("ENABLE ROW LEVEL SECURITY"), "RC3 uses app-level org isolation (documented)");

  return {
    ok: true,
    notes: [
      "Tenant isolation is enforced in StrategyEvaluationService / routes via organization_id.",
      "prospect_id is optional FI CRM linkage and must remain outside PI Facts/shared reports.",
      "ON DELETE CASCADE removes FI evaluations when a PI review is deleted — intentional FI ownership under reviewId."
    ]
  };
}

async function optionalDbProbe() {
  if (!process.env.DATABASE_URL) {
    return { skipped: true, reason: "DATABASE_URL not set" };
  }

  try {
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const result = await client.query(
      `SELECT to_regclass('public.atlas_fi_strategy_evaluations') AS table_name`
    );
    await client.end();
    return {
      skipped: false,
      tablePresent: Boolean(result.rows[0]?.table_name)
    };
  } catch (error) {
    return {
      skipped: false,
      error: error.message,
      note: "Environment/network failure — not treated as SQL structural failure."
    };
  }
}

async function main() {
  const structural = verifySqlFiles();
  const db = await optionalDbProbe();
  console.log(
    JSON.stringify(
      {
        migration: "025_financial_intelligence_strategy_evaluations",
        structural,
        databaseProbe: db
      },
      null,
      2
    )
  );
  console.log("FI migration 025 structural verification passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
