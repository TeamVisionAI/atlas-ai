const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EXPECTED_STAGING_REF,
  FORBIDDEN_TABLES,
  FORBIDDEN_BUCKETS,
  assertStagingVerifyTarget
} = require("../dev/environment/verifyStagingBaseline");
const { PRODUCTION_SUPABASE_PROJECT_REF } = require("../config/atlasEnvironment");

test("staging verifier expects jmobhvoscivanvsqpnwk and forbids 039 objects", () => {
  assert.equal(EXPECTED_STAGING_REF, "jmobhvoscivanvsqpnwk");
  assert.notEqual(EXPECTED_STAGING_REF, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.ok(FORBIDDEN_TABLES.includes("communication_media"));
  assert.ok(FORBIDDEN_BUCKETS.includes("communication-media"));
});

test("staging verifier HARD FAILS production Supabase", () => {
  const originalAtlasEnv = process.env.ATLAS_ENV;
  const originalExpected = process.env.ATLAS_EXPECTED_SUPABASE_REF;
  const originalUrl = process.env.SUPABASE_URL;
  const originalDb = process.env.DATABASE_URL;

  try {
    process.env.ATLAS_ENV = "staging";
    process.env.ATLAS_EXPECTED_SUPABASE_REF = EXPECTED_STAGING_REF;
    process.env.SUPABASE_URL = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
    delete process.env.DATABASE_URL;
    assert.throws(() => assertStagingVerifyTarget(), /HARD FAIL/);
  } finally {
    if (originalAtlasEnv === undefined) delete process.env.ATLAS_ENV;
    else process.env.ATLAS_ENV = originalAtlasEnv;
    if (originalExpected === undefined) delete process.env.ATLAS_EXPECTED_SUPABASE_REF;
    else process.env.ATLAS_EXPECTED_SUPABASE_REF = originalExpected;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDb;
  }
});
