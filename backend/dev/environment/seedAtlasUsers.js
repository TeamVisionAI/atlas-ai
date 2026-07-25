#!/usr/bin/env node
/**
 * LC1 — Seed Atlas users with roles and dev password hashes.
 */

require("dotenv").config();

const { withPostgresTransaction } = require("./databaseConnection");
const { hashPassword } = require("../../security/passwordService");

const DEFAULT_ORG_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_DEV_PASSWORD = process.env.ATLAS_DEV_DEFAULT_PASSWORD || "AtlasDev2026!";

const LC1_USERS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "ana@teamvision.ai",
    firstName: "Ana",
    lastName: "Recruiter",
    displayName: "Ana",
    role: "recruiter"
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "niovel@teamvision.ai",
    firstName: "Niovel",
    lastName: "Perez",
    displayName: "Niovel",
    role: "administrator"
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "ops@teamvision.ai",
    firstName: "Ops",
    lastName: "Center",
    displayName: "Ops",
    role: "operations"
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    email: "agent@teamvision.ai",
    firstName: "Field",
    lastName: "Agent",
    displayName: "Agent",
    role: "agent"
  }
];

async function seedAtlasUsers() {
  const passwordHash = hashPassword(DEFAULT_DEV_PASSWORD);

  await withPostgresTransaction(async (client) => {
    for (const user of LC1_USERS) {
      await client.query(
        `
          INSERT INTO atlas_users (
            id, email, first_name, last_name, display_name,
            organization_id, role, status, password_hash, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, now())
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            display_name = EXCLUDED.display_name,
            organization_id = EXCLUDED.organization_id,
            role = EXCLUDED.role,
            status = 'active',
            password_hash = EXCLUDED.password_hash,
            updated_at = now()
        `,
        [
          user.id,
          user.email,
          user.firstName,
          user.lastName,
          user.displayName,
          DEFAULT_ORG_ID,
          user.role,
          passwordHash
        ]
      );
    }
  });

  return LC1_USERS.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role
  }));
}

async function main() {
  console.log("Seeding LC1 Atlas users...\n");

  const users = await seedAtlasUsers();

  for (const user of users) {
    console.log(`  - ${user.displayName} (${user.role}) ${user.email}`);
  }

  console.log("\nDefault dev password (when hash is seeded):", DEFAULT_DEV_PASSWORD);
  console.log("Atlas LC1 users seeded.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("seedAtlasUsers failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  seedAtlasUsers,
  LC1_USERS,
  DEFAULT_DEV_PASSWORD
};
