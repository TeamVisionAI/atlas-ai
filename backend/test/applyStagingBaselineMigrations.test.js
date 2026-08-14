const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  MAX_BASELINE_VERSION,
  listStagingBaselineMigrations,
  assertStagingMigrationTarget
} = require("../dev/environment/applyStagingBaselineMigrations");
const { PRODUCTION_SUPABASE_PROJECT_REF } = require("../config/atlasEnvironment");

const MIGRATIONS_DIR = path.join(__dirname, "../database/migrations");

test("staging baseline lists 001–038, both 010 files, and never 039", () => {
  const files = listStagingBaselineMigrations(MIGRATIONS_DIR);

  assert.equal(MAX_BASELINE_VERSION, 38);
  assert.ok(files.includes("001_workflow_foundation.sql"));
  assert.ok(files.includes("038_qr_campaign_manager.sql"));
  assert.ok(files.includes("010_platform_bootstrap.sql"));
  assert.ok(files.includes("010_prospect_preferred_language.sql"));
  assert.ok(
    files.indexOf("010_platform_bootstrap.sql") <
      files.indexOf("010_prospect_preferred_language.sql")
  );
  assert.ok(!files.some((name) => name.startsWith("039_")));
  assert.ok(!files.some((name) => /_down\.sql$/i.test(name)));
  assert.equal(
    files.every((name) => {
      const version = Number.parseInt(name.slice(0, 3), 10);
      return version >= 1 && version <= 38;
    }),
    true
  );
});

test("staging PostgREST grant script is service_role only", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/staging/001_postgrest_service_role_grants.sql"),
    "utf8"
  );

  assert.match(sql, /GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role/);
  assert.doesNotMatch(sql, /GRANT ALL ON ALL TABLES IN SCHEMA public TO anon/i);
  assert.doesNotMatch(sql, /GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated/i);
});

test("014 does not COMMENT on Supabase-managed storage catalog tables", () => {
  const sql = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "014_profile_avatars_storage.sql"),
    "utf8"
  );

  assert.match(sql, /INSERT INTO storage\.buckets/);
  assert.match(sql, /CREATE POLICY avatars_public_read ON storage\.objects/);
  assert.doesNotMatch(sql, /COMMENT ON TABLE storage\./i);
  assert.doesNotMatch(sql, /COMMENT ON COLUMN storage\./i);
});

test("staging migrator refuses non-staging and production Supabase", () => {
  const originalEnv = { ...process.env };

  try {
    process.env.ATLAS_ENV = "production";
    process.env.SUPABASE_URL = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
    assert.throws(() => assertStagingMigrationTarget(), /ATLAS_ENV=staging/);

    process.env.ATLAS_ENV = "staging";
    process.env.ATLAS_EXPECTED_SUPABASE_REF = "abcdefghijklmnopqrst";
    assert.throws(() => assertStagingMigrationTarget(), /HARD FAIL/);
  } finally {
    process.env = originalEnv;
  }
});
