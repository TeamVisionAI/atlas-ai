#!/usr/bin/env node
/**
 * Seed synthetic-only Atlas staging personas and prospects.
 * Refuses production Supabase. Does not clone production users, phones, or logs.
 */

const fs = require("fs");
const path = require("path");

const {
  assertStagingSupabaseIsolation,
  resolveAtlasEnv,
  PRODUCTION_SUPABASE_PROJECT_REF
} = require("../../config/atlasEnvironment");
const { hashPassword } = require("../../security/passwordService");

function loadStagingEnv() {
  const dotenv = require("dotenv");
  const repoRoot = path.resolve(__dirname, "../../..");
  const explicitEnvFile = process.env.ATLAS_STAGING_ENV_FILE
    ? path.resolve(process.env.ATLAS_STAGING_ENV_FILE)
    : null;
  const defaultStagingFile = path.join(repoRoot, ".env.staging.local");

  if (explicitEnvFile && fs.existsSync(explicitEnvFile)) {
    dotenv.config({ path: explicitEnvFile, override: true });
    return;
  }

  if (fs.existsSync(defaultStagingFile)) {
    dotenv.config({ path: defaultStagingFile, override: true });
    return;
  }

  dotenv.config();
}

const DEFAULT_ORG_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_STAGING_PASSWORD = "AtlasStaging2026!";

const STAGING_USERS = Object.freeze([
  {
    id: "a1111111-1111-4111-8111-111111111111",
    email: "staging.superadmin@atlas.test",
    firstName: "Staging",
    lastName: "SuperAdmin",
    displayName: "Staging SuperAdmin",
    atlasRole: "administrator",
    saasRole: "SUPER_ADMIN",
    profileSettings: {}
  },
  {
    id: "a2222222-2222-4222-8222-222222222222",
    email: "staging.rvp@atlas.test",
    firstName: "Staging",
    lastName: "Rvp",
    displayName: "Staging RVP",
    atlasRole: "rvp",
    saasRole: "RVP",
    profileSettings: {}
  },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    email: "staging.agent@atlas.test",
    firstName: "Staging",
    lastName: "Agent",
    displayName: "Staging Agent",
    atlasRole: "agent",
    saasRole: "REPRESENTATIVE",
    profileSettings: {}
  },
  {
    id: "a4444444-4444-4444-8444-444444444444",
    email: "staging.reviewer@atlas.test",
    firstName: "Staging",
    lastName: "Reviewer",
    displayName: "Staging Meta Reviewer",
    atlasRole: "recruiter",
    saasRole: "REPRESENTATIVE",
    profileSettings: { meta_review_user: true }
  }
]);

const STAGING_PROSPECTS = Object.freeze([
  {
    id: "b1111111-1111-4111-8111-111111111111",
    displayName: "Staging Lead One",
    email: "staging.lead.one@atlas.test",
    phone: "+15550100001",
    tag: "staging-synthetic"
  },
  {
    id: "b2222222-2222-4222-8222-222222222222",
    displayName: "Staging Lead Two",
    email: "staging.lead.two@atlas.test",
    phone: "+15550100002",
    tag: "staging-synthetic"
  },
  {
    id: "b9999999-9999-4999-8999-999999999999",
    displayName: "Staging Audio Test",
    email: "staging.audio.test@atlas.test",
    phone: "+15550100999",
    tag: "staging-audio-test"
  }
]);

function assertStagingSeedTarget() {
  if (resolveAtlasEnv() !== "staging") {
    throw new Error("seedStagingSyntheticData requires ATLAS_ENV=staging. Refusing to run.");
  }

  assertStagingSupabaseIsolation();
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

async function seedStagingSyntheticData() {
  assertStagingSeedTarget();

  const { withPostgresTransaction } = require("./databaseConnection");
  const password = process.env.STAGING_SEED_PASSWORD || DEFAULT_STAGING_PASSWORD;
  const passwordHash = hashPassword(password);

  await withPostgresTransaction(async (client) => {
    const hasUsersTable = await tableExists(client, "users");
    const hasAtlasUsers = await tableExists(client, "atlas_users");
    const hasCoreProspects = await tableExists(client, "atlas_core_prospects");
    const hasLegacyProspects = await tableExists(client, "prospects");

    if (!hasAtlasUsers) {
      throw new Error("atlas_users is missing. Apply staging baseline migrations first.");
    }

    for (const user of STAGING_USERS) {
      await client.query(
        `
          INSERT INTO atlas_users (
            id, email, first_name, last_name, display_name,
            organization_id, role, status, password_hash, profile_settings, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9::jsonb, now())
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            display_name = EXCLUDED.display_name,
            organization_id = EXCLUDED.organization_id,
            role = EXCLUDED.role,
            status = 'active',
            password_hash = EXCLUDED.password_hash,
            profile_settings = EXCLUDED.profile_settings,
            updated_at = now()
        `,
        [
          user.id,
          user.email,
          user.firstName,
          user.lastName,
          user.displayName,
          DEFAULT_ORG_ID,
          user.atlasRole,
          passwordHash,
          JSON.stringify(user.profileSettings || {})
        ]
      );

      if (hasUsersTable) {
        await client.query(
          `
            INSERT INTO users (
              id, organization_id, name, email, password_hash, role, is_active, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, true, now())
            ON CONFLICT (id) DO UPDATE SET
              organization_id = EXCLUDED.organization_id,
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              password_hash = EXCLUDED.password_hash,
              role = EXCLUDED.role,
              is_active = true,
              updated_at = now()
          `,
          [user.id, DEFAULT_ORG_ID, user.displayName, user.email, passwordHash, user.saasRole]
        );
      }
    }

    const ownerId = STAGING_USERS[2].id;

    for (const prospect of STAGING_PROSPECTS) {
      if (hasCoreProspects) {
        await client.query(
          `
            INSERT INTO atlas_core_prospects (
              id, organization_id, display_name, email, primary_phone,
              normalized_primary_phone, preferred_language, lead_source, tags,
              assigned_agent_id, ownership, lifecycle_state, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, 'english',
              '{"sourceType":"staging","sourceName":"synthetic"}'::jsonb,
              $7::jsonb, $8, 'HUMAN', 'new_lead', now()
            )
            ON CONFLICT (id) DO UPDATE SET
              display_name = EXCLUDED.display_name,
              email = EXCLUDED.email,
              primary_phone = EXCLUDED.primary_phone,
              normalized_primary_phone = EXCLUDED.normalized_primary_phone,
              tags = EXCLUDED.tags,
              assigned_agent_id = EXCLUDED.assigned_agent_id,
              updated_at = now()
          `,
          [
            prospect.id,
            DEFAULT_ORG_ID,
            prospect.displayName,
            prospect.email,
            prospect.phone,
            prospect.phone.replace(/\D/g, ""),
            JSON.stringify([prospect.tag]),
            ownerId
          ]
        );
      }

      if (hasLegacyProspects) {
        await client.query(
          `
            INSERT INTO prospects (
              id, phone, name, first_name, last_name, status,
              normalized_phone, organization_id, owner_user_id, source, preferred_language
            )
            VALUES ($1, $2, $3, 'Staging', $4, 'NEW', $5, $6, $7, 'STAGING_SYNTHETIC', 'english')
            ON CONFLICT (id) DO UPDATE SET
              phone = EXCLUDED.phone,
              name = EXCLUDED.name,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              normalized_phone = EXCLUDED.normalized_phone,
              organization_id = EXCLUDED.organization_id,
              owner_user_id = EXCLUDED.owner_user_id,
              source = EXCLUDED.source,
              preferred_language = EXCLUDED.preferred_language,
              updated_at = now()
          `,
          [
            prospect.id,
            prospect.phone,
            prospect.displayName,
            prospect.displayName.replace(/^Staging\s+/i, ""),
            prospect.phone.replace(/\D/g, ""),
            DEFAULT_ORG_ID,
            ownerId
          ]
        );
      }
    }
  });

  return {
    users: STAGING_USERS.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.saasRole,
      atlasRole: user.atlasRole,
      metaReview: user.profileSettings?.meta_review_user === true
    })),
    prospects: STAGING_PROSPECTS.map((prospect) => ({
      id: prospect.id,
      displayName: prospect.displayName,
      email: prospect.email,
      phone: prospect.phone,
      tag: prospect.tag
    })),
    usedDefaultPassword: !process.env.STAGING_SEED_PASSWORD
  };
}

async function main() {
  loadStagingEnv();
  console.log("Seeding synthetic Atlas staging data\n");
  console.log("Protected production Supabase ref:", PRODUCTION_SUPABASE_PROJECT_REF);
  console.log("");

  const result = await seedStagingSyntheticData();

  for (const user of result.users) {
    console.log(`  user  ${user.email}  ${user.saasRole}${user.metaReview ? " (meta reviewer)" : ""}`);
  }

  for (const prospect of result.prospects) {
    console.log(`  prospect  ${prospect.displayName}  ${prospect.phone}  ${prospect.tag}`);
  }

  if (result.usedDefaultPassword) {
    console.log("\nDefault staging seed password:", DEFAULT_STAGING_PASSWORD);
    console.log("Set STAGING_SEED_PASSWORD to override.");
  } else {
    console.log("\nStaging seed password taken from STAGING_SEED_PASSWORD.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("seedStagingSyntheticData failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  STAGING_USERS,
  STAGING_PROSPECTS,
  DEFAULT_STAGING_PASSWORD,
  seedStagingSyntheticData,
  assertStagingSeedTarget
};
