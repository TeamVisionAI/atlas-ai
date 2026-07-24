#!/usr/bin/env node
/**
 * Sprint 15.5 — Verify Atlas Core database baseline (tables, indexes, constraints).
 */

require("dotenv").config();

const assert = require("assert");
const { connectPostgres } = require("./databaseConnection");
const { assertAtlasCoreTablesReady, assertSafeEnvironment } = require("./databaseReset");

const REQUIRED_TABLES = [
  "atlas_users",
  "atlas_core_prospects",
  "atlas_business_events",
  "atlas_timeline_entries",
  "atlas_mission_control_state",
  "atlas_mission_control_prospects",
  "atlas_mission_control_processed_events",
  "atlas_executive_dashboard_state",
  "atlas_executive_dashboard_processed_events"
];

const REQUIRED_INDEXES = [
  "idx_atlas_core_prospects_normalized_phone",
  "idx_atlas_business_events_prospect",
  "idx_atlas_timeline_entries_business_event",
  "idx_atlas_timeline_entries_prospect",
  "idx_atlas_mission_control_processed_org",
  "idx_atlas_executive_dashboard_processed_org"
];

const REQUIRED_FK = [
  {
    table: "atlas_core_prospects",
    column: "assigned_agent_id",
    references: "atlas_users"
  }
];

async function verifyViaPostgres(client) {
  const { rows: tables } = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `
  );

  const tableSet = new Set(tables.map((row) => row.table_name));

  for (const tableName of REQUIRED_TABLES) {
    assert(tableSet.has(tableName), `Missing table: ${tableName}`);
  }

  const { rows: indexes } = await client.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `
  );

  const indexSet = new Set(indexes.map((row) => row.indexname));

  for (const indexName of REQUIRED_INDEXES) {
    assert(indexSet.has(indexName), `Missing index: ${indexName}`);
  }

  for (const fk of REQUIRED_FK) {
    const { rows } = await client.query(
      `
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1
          AND kcu.column_name = $2
          AND ccu.table_name = $3
        LIMIT 1
      `,
      [fk.table, fk.column, fk.references]
    );

    assert(rows.length > 0, `Missing FK ${fk.table}.${fk.column} -> ${fk.references}`);
  }
}

async function verifyDatabaseBaseline() {
  assertSafeEnvironment();

  const client = await connectPostgres();

  try {
    await verifyViaPostgres(client);
  } finally {
    await client.end().catch(() => {});
  }

  await assertAtlasCoreTablesReady();

  console.log("Database baseline verification passed.");
  console.log(`  Tables: ${REQUIRED_TABLES.length}`);
  console.log(`  Indexes: ${REQUIRED_INDEXES.length}`);
  console.log(`  Foreign keys: ${REQUIRED_FK.length}`);
}

async function main() {
  console.log("Sprint 15.5 — Verifying Atlas Core database baseline\n");
  await verifyDatabaseBaseline();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("verifyDatabaseBaseline failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  verifyDatabaseBaseline,
  REQUIRED_TABLES,
  REQUIRED_INDEXES
};
