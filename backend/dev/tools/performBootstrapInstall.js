#!/usr/bin/env node
/**
 * Perform first-time Atlas bootstrap via direct Postgres.
 * Development / installation verification only — mirrors POST /api/setup/complete
 * when SUPABASE_SERVICE_ROLE_KEY is unavailable locally.
 */

require("dotenv").config();

const crypto = require("crypto");
const { withPostgresTransaction } = require("../environment/databaseConnection");
const { hashPassword } = require("../../security/passwordService");
const { DEFAULT_ORGANIZATION_ID } = require("../../modules/prospects/domain/constants");

const SETUP_KEY = "setup_completed_at";

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "performBootstrapInstall is disabled in production. Use POST /api/setup/complete with SUPABASE_SERVICE_ROLE_KEY configured."
    );
  }
}

function slugify(name) {
  return String(name || "organization")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "organization";
}

function requireField(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

async function performBootstrapInstall(input = {}) {
  assertDevelopmentOnly();

  const organizationName = requireField(input.organizationName, "organizationName");
  const firstName = requireField(input.ownerFirstName, "ownerFirstName");
  const lastName = requireField(input.ownerLastName, "ownerLastName");
  const email = requireField(input.ownerEmail, "ownerEmail").toLowerCase();
  const password = requireField(input.password, "password");
  const passwordHash = hashPassword(password);
  const slug = slugify(organizationName);
  const displayName = `${firstName} ${lastName}`.trim();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const completedAt = new Date().toISOString();

  return withPostgresTransaction(async (client) => {
    const { rows: userRows } = await client.query("SELECT COUNT(*)::int AS count FROM atlas_users");
    const { rows: settingRows } = await client.query(
      "SELECT value FROM atlas_platform_settings WHERE key = $1",
      [SETUP_KEY]
    );

    if (userRows[0].count > 0 || settingRows[0]?.value?.completedAt) {
      throw new Error("Platform setup has already been completed.");
    }

    await client.query(
      `
        INSERT INTO organizations (id, name, slug, status, updated_at)
        VALUES ($1, $2, $3, 'active', now())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          status = 'active',
          updated_at = now()
      `,
      [DEFAULT_ORGANIZATION_ID, organizationName, slug]
    );

    const { rows: users } = await client.query(
      `
        INSERT INTO atlas_users (
          email, first_name, last_name, display_name,
          organization_id, role, status, password_hash, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'administrator', 'active', $6, now())
        RETURNING id, email, first_name, last_name, display_name, role, status, organization_id
      `,
      [email, firstName, lastName, displayName, DEFAULT_ORGANIZATION_ID, passwordHash]
    );

    const admin = users[0];

    await client.query(
      `UPDATE organizations SET owner_user_id = $1, updated_at = now() WHERE id = $2`,
      [admin.id, DEFAULT_ORGANIZATION_ID]
    );

    await client.query(
      `
        INSERT INTO atlas_platform_settings (key, value, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `,
      [
        SETUP_KEY,
        JSON.stringify({
          completedAt,
          administratorUserId: admin.id,
          organizationId: DEFAULT_ORGANIZATION_ID
        })
      ]
    );

    await client.query(
      `
        INSERT INTO atlas_sessions (user_id, token, expires_at, remember_me)
        VALUES ($1, $2, $3, false)
      `,
      [admin.id, token, expiresAt]
    );

    await client.query(
      `
        INSERT INTO atlas_audit_log (organization_id, user_id, user_email, action, target_type, target_id, result)
        VALUES ($1, $2, $3, 'platform.setup_completed', 'organization', $4, 'success')
      `,
      [DEFAULT_ORGANIZATION_ID, admin.id, email, DEFAULT_ORGANIZATION_ID]
    );

    return {
      organization: { id: DEFAULT_ORGANIZATION_ID, name: organizationName, slug },
      user: admin,
      token,
      expiresAt
    };
  });
}

async function main() {
  const result = await performBootstrapInstall({
    organizationName: process.env.ATLAS_SETUP_ORG_NAME,
    ownerFirstName: process.env.ATLAS_SETUP_OWNER_FIRST_NAME,
    ownerLastName: process.env.ATLAS_SETUP_OWNER_LAST_NAME,
    ownerEmail: process.env.ATLAS_SETUP_OWNER_EMAIL,
    password: process.env.ATLAS_SETUP_PASSWORD
  });

  console.log("Atlas bootstrap installation complete.\n");
  console.log("Organization:", result.organization.name);
  console.log("Administrator:", result.user.email, `(${result.user.role})`);
  console.log("Session token:", result.token);
  console.log("\nVerify:");
  console.log("  curl http://localhost:3000/api/setup/status");
  console.log(`  curl -H "Authorization: Bearer ${result.token}" http://localhost:3000/api/auth/me`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("performBootstrapInstall failed:", error.message);
    process.exit(1);
  });
}

module.exports = { performBootstrapInstall };
