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
  { version: "007", file: "007_atlas_executive_dashboard_read_model.sql" },
  { version: "008", file: "008_lc1_security_foundation.sql", note: "LC1 security foundation" },
  { version: "009", file: "009_identity_management.sql", note: "LC1.1 identity management" },
  { version: "010", file: "010_platform_bootstrap.sql", note: "LC1.1 platform bootstrap wizard" },
  { version: "011", file: "011_saas_multi_tenant_foundation.sql", note: "Sprint 16.9 SaaS multi-tenant foundation" }
];

function loadMigrationSql(fileName) {
  const filePath = path.join(MIGRATIONS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

const ENSURE_ATLAS_SEED_USERS_SQL = `
  INSERT INTO atlas_users (id, email, first_name, last_name, display_name)
  VALUES
    (
      '00000000-0000-4000-8000-000000000001',
      'ana.reyes1510@gmail.com',
      'Ana',
      'Perez',
      'Ana Perez'
    ),
    (
      '00000000-0000-4000-8000-000000000002',
      'niovel@teamvision.ai',
      'Niovel',
      'Perez',
      'Niovel'
    )
  ON CONFLICT (id) DO NOTHING;
`;

async function ensureAtlasSeedUsers(client) {
  const hasUsers = await tableExists(client, "atlas_users");

  if (!hasUsers) {
    return;
  }

  await client.query(ENSURE_ATLAS_SEED_USERS_SQL);
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
          await ensureAtlasSeedUsers(client);
          continue;
        }
      }

      if (migration.version === "008") {
        await ensureAtlasSeedUsers(client);
      }

      const sql = loadMigrationSql(migration.file);
      console.log(`Applying migration ${migration.version}: ${migration.file}`);
      await client.query(sql);
      applied.push(migration.version);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("Ensuring Atlas development users (dev only)...");
    await seedAtlasUsers();
    console.log("Atlas development users verified.");
  } else {
    console.log("Skipping user seed in production — use the setup wizard for first administrator.");
  }

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
