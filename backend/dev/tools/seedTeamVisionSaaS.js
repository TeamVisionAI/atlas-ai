#!/usr/bin/env node
/**
 * Sprint 16.9 — Seed Team Vision organization and SUPER_ADMIN from environment variables.
 * Never hardcodes passwords.
 *
 * Required env vars:
 *   ATLAS_SUPER_ADMIN_EMAIL
 *   ATLAS_SUPER_ADMIN_PASSWORD
 *   ATLAS_SUPER_ADMIN_NAME (optional, defaults to "Super Admin")
 */

require("dotenv").config();

const { withPostgresTransaction } = require("../environment/databaseConnection");
const { hashPassword } = require("../../security/passwordService");
const { DEFAULT_ORGANIZATION_ID } = require("../../modules/prospects/domain/constants");

const TEAM_VISION_ORG_ID = DEFAULT_ORGANIZATION_ID;

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Set it in .env before running the seeder.`);
  }

  return value;
}

async function seedTeamVisionSaaS() {
  if (process.env.NODE_ENV === "production" && process.env.ATLAS_ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error(
      "Production seeding blocked. Set ATLAS_ALLOW_PRODUCTION_SEED=true to override, or use the setup wizard."
    );
  }

  const email = requireEnv("ATLAS_SUPER_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("ATLAS_SUPER_ADMIN_PASSWORD");
  const name = process.env.ATLAS_SUPER_ADMIN_NAME?.trim() || "Super Admin";
  const passwordHash = hashPassword(password);

  return withPostgresTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO organizations (
          id, name, slug, status, is_active,
          subscription_plan, subscription_status, timezone, updated_at
        )
        VALUES ($1, 'Team Vision', 'team-vision', 'active', true, 'professional', 'active', 'America/New_York', now())
        ON CONFLICT (id) DO UPDATE SET
          name = 'Team Vision',
          slug = 'team-vision',
          status = 'active',
          is_active = true,
          updated_at = now()
      `,
      [TEAM_VISION_ORG_ID]
    );

    await client.query(
      `
        INSERT INTO organization_subscriptions (organization_id, plan, status, renewal_date)
        VALUES ($1, 'professional', 'active', now() + interval '1 year')
        ON CONFLICT (organization_id) DO UPDATE SET
          plan = 'professional',
          status = 'active',
          updated_at = now()
      `,
      [TEAM_VISION_ORG_ID]
    );

    const { rows: existing } = await client.query(
      "SELECT id FROM users WHERE lower(email) = $1 LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      await client.query(
        `
          UPDATE users
          SET name = $1, password_hash = $2, role = 'SUPER_ADMIN', is_active = true, updated_at = now()
          WHERE id = $3
        `,
        [name, passwordHash, existing[0].id]
      );

      return {
        organizationId: TEAM_VISION_ORG_ID,
        userId: existing[0].id,
        email,
        created: false
      };
    }

    const { rows: users } = await client.query(
      `
        INSERT INTO users (
          organization_id, name, email, password_hash, role, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', true, now())
        RETURNING id
      `,
      [TEAM_VISION_ORG_ID, name, email, passwordHash]
    );

    return {
      organizationId: TEAM_VISION_ORG_ID,
      userId: users[0].id,
      email,
      created: true
    };
  });
}

async function main() {
  const result = await seedTeamVisionSaaS();

  console.log("Team Vision SaaS seed complete.\n");
  console.log("Organization:", "Team Vision", `(${result.organizationId})`);
  console.log("Super Admin:", result.email, result.created ? "(created)" : "(updated)");
  console.log("\nLogin with ATLAS_SUPER_ADMIN_EMAIL and ATLAS_SUPER_ADMIN_PASSWORD from .env");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("seedTeamVisionSaaS failed:", error.message);
    process.exit(1);
  });
}

module.exports = { seedTeamVisionSaaS };
