#!/usr/bin/env node
/**
 * Sprint 15.5 — Idempotent Atlas default user baseline (development / RC1).
 * Ensures Ana and Niovel exist for assigned_agent_id foreign keys.
 */

require("dotenv").config();

const { withPostgresTransaction } = require("./databaseConnection");

const ATLAS_USERS_SEED_SQL = `
INSERT INTO atlas_users (id, email, first_name, last_name, display_name)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'ana@teamvision.ai',
    'Ana',
    'Recruiter',
    'Ana'
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

async function seedAtlasUsers() {
  await withPostgresTransaction(async (client) => {
    await client.query(ATLAS_USERS_SEED_SQL);
  });

  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      email: "ana@teamvision.ai",
      displayName: "Ana"
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      email: "niovel@teamvision.ai",
      displayName: "Niovel"
    }
  ];
}

async function main() {
  console.log("Seeding Atlas default users...\n");

  const users = await seedAtlasUsers();

  for (const user of users) {
    console.log(`  - ${user.displayName} (${user.id})`);
  }

  console.log("\nAtlas default users seeded.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("seedAtlasUsers failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  seedAtlasUsers,
  ATLAS_USERS_SEED_SQL
};
