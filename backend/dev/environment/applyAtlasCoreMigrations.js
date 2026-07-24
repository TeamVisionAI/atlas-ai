#!/usr/bin/env node
/**
 * Sprint 15.5 — Apply Atlas Core migrations 002 (prerequisite) and 003–007 to Supabase.
 * Development tooling only — requires DATABASE_URL or SUPABASE_DB_PASSWORD.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { withPostgresTransaction } = require("./databaseConnection");
const { seedAtlasUsers } = require("./seedAtlasUsers");

const MIGRATIONS_DIR = path.join(__dirname, "../../database/migrations");

const MIGRATION_FILES = [
  {
    version: "002",
    file: "002_quick_capture.sql",
    note: "Prerequisite for atlas_users FK in 003"
  },
  { version: "003", file: "003_atlas_core_prospects.sql" },
  { version: "004", file: "004_atlas_business_events.sql" },
  { version: "005", file: "005_atlas_timeline_entries.sql" },
  { version: "006", file: "006_atlas_mission_control_read_model.sql" },
  { version: "007", file: "007_atlas_executive_dashboard_read_model.sql" }
];

function loadMigrationSql(fileName) {
  const filePath = path.join(MIGRATIONS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1
    `,
    [tableName]
  );

  return rows.length > 0;
}

async function applyAtlasCoreMigrations({ includePrerequisite = true } = {}) {
  const applied = [];

  await withPostgresTransaction(async (client) => {
    for (const migration of MIGRATION_FILES) {
      if (!includePrerequisite && migration.version === "002") {
        continue;
      }

      if (migration.version === "002") {
        const hasUsers = await tableExists(client, "atlas_users");

        if (hasUsers) {
          console.log(`Skipping ${migration.version} DDL — atlas_users already exists`);
          continue;
        }
      }

      const sql = loadMigrationSql(migration.file);
      console.log(`Applying migration ${migration.version}: ${migration.file}`);
      await client.query(sql);
      applied.push(migration.version);
    }
  });

  console.log("Ensuring Atlas default users (Ana + Niovel)...");
  await seedAtlasUsers();
  console.log("Atlas default users verified.");

  return applied;
}

async function main() {
  const onlyCore = process.argv.includes("--core-only");
  console.log("Sprint 15.5 — Applying Atlas Core migrations to Supabase\n");

  const applied = await applyAtlasCoreMigrations({ includePrerequisite: !onlyCore });

  console.log("");
  console.log("Applied migration versions:", applied.join(", ") || "(none — already present)");
  console.log("Atlas Core database baseline synchronized.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("applyAtlasCoreMigrations failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  applyAtlasCoreMigrations,
  MIGRATION_FILES
};
