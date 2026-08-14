const test = require("node:test");
const assert = require("node:assert/strict");

const {
  STAGING_USERS,
  STAGING_PROSPECTS,
  assertStagingSeedTarget
} = require("../dev/environment/seedStagingSyntheticData");
const { PRODUCTION_SUPABASE_PROJECT_REF } = require("../config/atlasEnvironment");

test("synthetic staging personas are clearly fake and include required roles", () => {
  const emails = STAGING_USERS.map((user) => user.email);
  const roles = STAGING_USERS.map((user) => user.saasRole);

  assert.ok(emails.every((email) => email.endsWith("@atlas.test")));
  assert.ok(roles.includes("SUPER_ADMIN"));
  assert.ok(roles.includes("RVP"));
  assert.ok(roles.includes("REPRESENTATIVE"));
  assert.ok(STAGING_USERS.some((user) => user.profileSettings?.meta_review_user === true));
});

test("synthetic staging prospects include a designated audio-test prospect", () => {
  assert.equal(STAGING_PROSPECTS.length >= 3, true);
  assert.ok(STAGING_PROSPECTS.every((prospect) => prospect.phone.startsWith("+1555")));
  assert.ok(STAGING_PROSPECTS.every((prospect) => prospect.email.endsWith("@atlas.test")));
  assert.ok(STAGING_PROSPECTS.some((prospect) => prospect.tag === "staging-audio-test"));
});

test("staging seeder refuses non-staging and production Supabase", () => {
  const originalEnv = { ...process.env };

  try {
    process.env.ATLAS_ENV = "development";
    assert.throws(() => assertStagingSeedTarget(), /ATLAS_ENV=staging/);

    process.env.ATLAS_ENV = "staging";
    process.env.ATLAS_EXPECTED_SUPABASE_REF = "abcdefghijklmnopqrst";
    process.env.SUPABASE_URL = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
    assert.throws(() => assertStagingSeedTarget(), /HARD FAIL/);
  } finally {
    process.env = originalEnv;
  }
});
