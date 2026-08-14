const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PRODUCTION_SUPABASE_PROJECT_REF,
  resolveAtlasEnv,
  extractSupabaseProjectRef,
  extractSupabaseProjectRefFromEnv,
  assertStagingSupabaseIsolation
} = require("../config/atlasEnvironment");

const STAGING_REF = "abcdefghijklmnopqrst";
const PRODUCTION_URL = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

test("resolveAtlasEnv supports development, staging, production and allows unset", () => {
  assert.equal(resolveAtlasEnv({}), null);
  assert.equal(resolveAtlasEnv({ ATLAS_ENV: "" }), null);
  assert.equal(resolveAtlasEnv({ ATLAS_ENV: "development" }), "development");
  assert.equal(resolveAtlasEnv({ ATLAS_ENV: "STAGING" }), "staging");
  assert.equal(resolveAtlasEnv({ ATLAS_ENV: "production" }), "production");
});

test("resolveAtlasEnv rejects unknown values", () => {
  assert.throws(
    () => resolveAtlasEnv({ ATLAS_ENV: "prod" }),
    /Invalid ATLAS_ENV/
  );
});

test("extractSupabaseProjectRef reads project URL, db host, and pooler user", () => {
  assert.equal(extractSupabaseProjectRef(STAGING_URL), STAGING_REF);
  assert.equal(
    extractSupabaseProjectRef(`postgresql://postgres:pw@db.${STAGING_REF}.supabase.co:5432/postgres`),
    STAGING_REF
  );
  assert.equal(
    extractSupabaseProjectRef(
      `postgresql://postgres.${STAGING_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    ),
    STAGING_REF
  );
  assert.equal(extractSupabaseProjectRef(PRODUCTION_URL), PRODUCTION_SUPABASE_PROJECT_REF);
});

test("assertStagingSupabaseIsolation is skipped unless ATLAS_ENV=staging", () => {
  assert.equal(
    assertStagingSupabaseIsolation({
      SUPABASE_URL: PRODUCTION_URL
    }).skipped,
    true
  );
  assert.equal(
    assertStagingSupabaseIsolation({
      ATLAS_ENV: "production",
      SUPABASE_URL: PRODUCTION_URL
    }).skipped,
    true
  );
  assert.equal(
    assertStagingSupabaseIsolation({
      ATLAS_ENV: "development",
      SUPABASE_URL: PRODUCTION_URL
    }).skipped,
    true
  );
});

test("staging requires ATLAS_EXPECTED_SUPABASE_REF", () => {
  assert.throws(
    () =>
      assertStagingSupabaseIsolation({
        ATLAS_ENV: "staging",
        SUPABASE_URL: STAGING_URL
      }),
    /ATLAS_EXPECTED_SUPABASE_REF is required/
  );
});

test("staging expected ref cannot be production", () => {
  assert.throws(
    () =>
      assertStagingSupabaseIsolation({
        ATLAS_ENV: "staging",
        ATLAS_EXPECTED_SUPABASE_REF: PRODUCTION_SUPABASE_PROJECT_REF,
        SUPABASE_URL: STAGING_URL
      }),
    /must not be production ref/
  );
});

test("staging HARD FAILS when connected to production Supabase", () => {
  assert.throws(
    () =>
      assertStagingSupabaseIsolation({
        ATLAS_ENV: "staging",
        ATLAS_EXPECTED_SUPABASE_REF: STAGING_REF,
        SUPABASE_URL: PRODUCTION_URL
      }),
    /HARD FAIL/
  );

  assert.throws(
    () =>
      assertStagingSupabaseIsolation({
        ATLAS_ENV: "staging",
        ATLAS_EXPECTED_SUPABASE_REF: STAGING_REF,
        DATABASE_URL: `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
      }),
    /HARD FAIL/
  );

  assert.throws(
    () =>
      assertStagingSupabaseIsolation({
        ATLAS_ENV: "staging",
        ATLAS_EXPECTED_SUPABASE_REF: STAGING_REF,
        SUPABASE_URL: STAGING_URL,
        DATABASE_URL: `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
      }),
    /HARD FAIL/
  );
});

test("staging refuses expected-ref mismatch", () => {
  assert.throws(
    () =>
      assertStagingSupabaseIsolation({
        ATLAS_ENV: "staging",
        ATLAS_EXPECTED_SUPABASE_REF: STAGING_REF,
        SUPABASE_URL: "https://otherstagingprojectref12.supabase.co"
      }),
    /does not match ATLAS_EXPECTED_SUPABASE_REF/
  );
});

test("staging accepts matching non-production ref", () => {
  const result = assertStagingSupabaseIsolation({
    ATLAS_ENV: "staging",
    ATLAS_EXPECTED_SUPABASE_REF: STAGING_REF,
    SUPABASE_URL: STAGING_URL,
    DATABASE_URL: `postgresql://postgres.${STAGING_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.equal(result.actualRef, STAGING_REF);
});

test("extractSupabaseProjectRefFromEnv reads SUPABASE_URL then DATABASE_URL", () => {
  assert.equal(
    extractSupabaseProjectRefFromEnv({
      SUPABASE_URL: STAGING_URL
    }),
    STAGING_REF
  );
  assert.equal(
    extractSupabaseProjectRefFromEnv({
      DATABASE_URL: `postgresql://postgres.${STAGING_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    }),
    STAGING_REF
  );
});

test("server.js asserts staging isolation at startup", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(source, /assertStagingSupabaseIsolation/);
});
