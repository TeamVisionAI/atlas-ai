#!/usr/bin/env node
/**
 * Verify Atlas staging DB after migrations 001–038.
 * Refuses production Supabase. Fails if migration 039 / communication_media exists.
 */

const fs = require("fs");
const path = require("path");

const {
  assertStagingSupabaseIsolation,
  resolveAtlasEnv,
  PRODUCTION_SUPABASE_PROJECT_REF
} = require("../../config/atlasEnvironment");

const EXPECTED_STAGING_REF = "jmobhvosciwanvsqpnwk";
const FORBIDDEN_TABLES = ["communication_media"];
const FORBIDDEN_BUCKETS = ["communication-media"];
const PRODUCTION_EMAIL_MARKERS = ["@teamvisionfinancial.com", "@teamvision.ai"];
const PRODUCTION_PHONE_MARKERS = ["+1787", "+1939"];

const REQUIRED_TABLES = [
  "prospects",
  "conversation_logs",
  "atlas_users",
  "atlas_core_prospects",
  "atlas_business_events",
  "atlas_timeline_entries",
  "atlas_mission_control_state",
  "organizations",
  "users"
];

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

function assertStagingVerifyTarget() {
  if (resolveAtlasEnv() !== "staging") {
    throw new Error("verifyStagingBaseline requires ATLAS_ENV=staging.");
  }

  const result = assertStagingSupabaseIsolation();

  if (result.actualRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("verifyStagingBaseline HARD FAIL: production Supabase ref.");
  }

  if (result.actualRef !== EXPECTED_STAGING_REF) {
    throw new Error(
      `verifyStagingBaseline expected ref ${EXPECTED_STAGING_REF}, got ${result.actualRef}.`
    );
  }

  return result;
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

async function verifyStagingBaseline() {
  const isolation = assertStagingVerifyTarget();
  const { connectPostgres } = require("./databaseConnection");
  const client = await connectPostgres();

  try {
    for (const tableName of REQUIRED_TABLES) {
      if (!(await tableExists(client, tableName))) {
        throw new Error(`Missing required staging table: ${tableName}`);
      }
    }

    for (const tableName of FORBIDDEN_TABLES) {
      if (await tableExists(client, tableName)) {
        throw new Error(`Forbidden 039 table present: ${tableName}`);
      }
    }

    const { rows: buckets } = await client.query(
      `
        SELECT id
        FROM storage.buckets
        WHERE id = ANY($1::text[])
      `,
      [FORBIDDEN_BUCKETS]
    ).catch(() => ({ rows: [] }));

    if (buckets.length > 0) {
      throw new Error(`Forbidden storage bucket present: ${buckets.map((row) => row.id).join(", ")}`);
    }

    if (await tableExists(client, "atlas_users")) {
      const { rows: users } = await client.query(
        `
          SELECT email
          FROM atlas_users
          WHERE email IS NOT NULL
        `
      );
      const leaked = users
        .map((row) => String(row.email || "").toLowerCase())
        .filter((email) => PRODUCTION_EMAIL_MARKERS.some((marker) => email.includes(marker)));

      if (leaked.length > 0) {
        throw new Error("Staging atlas_users contains production-like emails. Stop.");
      }
    }

    if (await tableExists(client, "prospects")) {
      const { rows: phones } = await client.query(
        `
          SELECT phone
          FROM prospects
          WHERE phone IS NOT NULL
        `
      );
      const leakedPhones = phones
        .map((row) => String(row.phone || ""))
        .filter((phone) => PRODUCTION_PHONE_MARKERS.some((marker) => phone.startsWith(marker)));

      if (leakedPhones.length > 0) {
        throw new Error("Staging prospects contain production-like phone numbers. Stop.");
      }
    }

    return {
      ok: true,
      atlasEnv: isolation.atlasEnv,
      supabaseRef: isolation.actualRef,
      forbidden039Absent: true
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  loadStagingEnv();
  console.log("Verifying Atlas staging baseline (001–038, no 039)\n");
  console.log("Protected production Supabase ref:", PRODUCTION_SUPABASE_PROJECT_REF);
  const result = await verifyStagingBaseline();
  console.log("Staging baseline verification passed.");
  console.log("  atlasEnv:", result.atlasEnv);
  console.log("  supabaseRef:", result.supabaseRef);
  console.log("  communication_media absent: yes");
  console.log("  communication-media bucket absent: yes");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("verifyStagingBaseline failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  EXPECTED_STAGING_REF,
  FORBIDDEN_TABLES,
  FORBIDDEN_BUCKETS,
  REQUIRED_TABLES,
  assertStagingVerifyTarget,
  verifyStagingBaseline
};
