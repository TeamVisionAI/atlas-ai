#!/usr/bin/env node
/**
 * Provision a single active staging user for Vercel Preview review.
 * Staging only — refuses production Supabase and non-staging ATLAS_ENV.
 *
 * Usage:
 *   ATLAS_STAGING_ENV_FILE=.env.staging.local \
 *   STAGING_ACCESS_EMAIL=you@example.com \
 *   STAGING_ACCESS_PASSWORD='your-staging-only-password' \
 *   node backend/dev/environment/provisionStagingAccess.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  assertStagingSupabaseIsolation,
  resolveAtlasEnv
} = require("../../config/atlasEnvironment");
const { hashPassword } = require("../../security/passwordService");
const { seedStagingSyntheticData, assertStagingSeedTarget } = require("./seedStagingSyntheticData");

const DEFAULT_ORG_ID = "00000000-0000-4000-8000-000000000001";

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

function resolveAccessEmail() {
  return String(process.env.STAGING_ACCESS_EMAIL || "").trim().toLowerCase();
}

function resolveAccessPassword() {
  return String(process.env.STAGING_ACCESS_PASSWORD || "");
}

function resolveNameParts() {
  const firstName = String(process.env.STAGING_ACCESS_FIRST_NAME || "Niovel").trim();
  const lastName = String(process.env.STAGING_ACCESS_LAST_NAME || "Perez").trim();
  return { firstName, lastName };
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

async function provisionStagingAccess({
  email,
  password,
  firstName,
  lastName,
  atlasRole = "rvp",
  saasRole = "RVP"
}) {
  assertStagingSeedTarget();

  if (!email) {
    throw new Error("STAGING_ACCESS_EMAIL is required.");
  }

  if (!password || password.length < 12) {
    throw new Error("STAGING_ACCESS_PASSWORD is required (minimum 12 characters).");
  }

  const { withPostgresTransaction } = require("./databaseConnection");
  const passwordHash = hashPassword(password);
  const displayName = `${firstName} ${lastName}`.trim();

  let targetUserId = crypto.randomUUID();
  let created = true;

  await withPostgresTransaction(async (client) => {
    const hasUsersTable = await tableExists(client, "users");

    const existing = await client.query(
      `SELECT id FROM atlas_users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );

    if (existing.rows[0]?.id) {
      targetUserId = existing.rows[0].id;
      created = false;
    }

    await client.query(
      `
        INSERT INTO atlas_users (
          id, email, first_name, last_name, display_name,
          organization_id, role, status, password_hash, profile_settings, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, '{}'::jsonb, now())
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
        targetUserId,
        email,
        firstName,
        lastName,
        displayName,
        DEFAULT_ORG_ID,
        atlasRole,
        passwordHash
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
        [targetUserId, DEFAULT_ORG_ID, displayName, email, passwordHash, saasRole]
      );
    }
  });

  return {
    id: targetUserId,
    email,
    organizationId: DEFAULT_ORG_ID,
    atlasRole,
    saasRole,
    created
  };
}

async function main() {
  loadStagingEnv();
  assertStagingSupabaseIsolation();

  const email = resolveAccessEmail();
  let password = resolveAccessPassword();
  const { firstName, lastName } = resolveNameParts();
  const writeCredentialsFile = process.env.STAGING_ACCESS_WRITE_FILE === "1";

  if (!password && writeCredentialsFile) {
    password = crypto.randomBytes(18).toString("base64url");
  }

  if (!password) {
    throw new Error(
      "Set STAGING_ACCESS_PASSWORD or STAGING_ACCESS_WRITE_FILE=1 for one-time local credential file output."
    );
  }

  // Ensure baseline synthetic org/users exist for dashboard data.
  await seedStagingSyntheticData();

  const result = await provisionStagingAccess({
    email,
    password,
    firstName,
    lastName
  });

  console.log("Staging access provisioned:");
  console.log(`  email: ${result.email}`);
  console.log(`  userId: ${result.id}`);
  console.log(`  organizationId: ${result.organizationId}`);
  console.log(`  atlasRole: ${result.atlasRole}`);
  console.log(`  saasRole: ${result.saasRole}`);

  if (writeCredentialsFile) {
    const repoRoot = path.resolve(__dirname, "../../..");
    const credentialsPath = path.join(repoRoot, ".staging-access.local");
    fs.writeFileSync(
      credentialsPath,
      [
        "# Staging-only credentials — gitignored. Delete after first login.",
        `email=${email}`,
        `password=${password}`,
        ""
      ].join("\n"),
      { mode: 0o600 }
    );
    console.log(`  credentials_file: ${credentialsPath}`);
    console.log("  (password stored locally only — not printed to stdout)");
  } else {
    console.log("  password: set via STAGING_ACCESS_PASSWORD (not logged)");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("provisionStagingAccess failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_ORG_ID,
  provisionStagingAccess
};
