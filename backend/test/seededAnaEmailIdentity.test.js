/**
 * Ana identity email stays on the seeded UUID (login identifier, not a new user).
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { LC1_USERS } = require("../dev/environment/seedAtlasUsers");
const { resolveLoginIdentifier } = require("../services/atlasUserService");
const {
  TEAM_VISION_ANA_USER_ID,
  TEAM_VISION_INTERVIEWER_POOL
} = require("../core/configuration/teamVisionInterviewerPool");
const { normalizeInterviewerPool } = require("../core/interviewerPoolEngine");
const { classifyIntegrationOwnership } = require("../core/personalIntegrationOwnership");

const ANA_ID = "00000000-0000-4000-8000-000000000001";
const ANA_EMAIL = "ana.reyes1510@gmail.com";
const OLD_SEED_EMAIL = "ana@teamvision.ai";

function readRepo(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("seeded Ana email is the real Gmail on the same UUID", () => {
  const ana = LC1_USERS.find((user) => user.id === ANA_ID);
  const anaRows = LC1_USERS.filter(
    (user) =>
      user.id === ANA_ID ||
      String(user.email || "").toLowerCase() === ANA_EMAIL ||
      /ana/i.test(`${user.firstName} ${user.lastName}`)
  );

  assert.ok(ana, "seeded Ana user is present");
  assert.equal(ana.id, ANA_ID);
  assert.equal(ana.email, ANA_EMAIL);
  assert.equal(ana.firstName, "Ana");
  assert.equal(ana.lastName, "Perez");
  assert.equal(ana.displayName, "Ana Perez");
  assert.equal(ana.role, "recruiter");
  assert.equal(anaRows.length, 1);
});

test("seed and bootstrap fixtures do not restore the old Team Vision email", () => {
  const fixtures = [
    "dev/environment/seedAtlasUsers.js",
    "dev/environment/applyAtlasCoreMigrations.js",
    "dev/environment/atlas-core-baseline.sql",
    "services/atlasUserService.js",
    "database/migrations/002_quick_capture.sql",
    "database/migrations/008_lc1_security_foundation.sql"
  ];

  for (const fixture of fixtures) {
    const source = readRepo(fixture);
    assert.doesNotMatch(source, new RegExp(OLD_SEED_EMAIL.replace(".", "\\.")));
    assert.match(source, /ana\.reyes1510@gmail\.com/);
  }
});

test("login identifier maps the real email to email mode without creating a user", () => {
  assert.deepEqual(resolveLoginIdentifier(ANA_EMAIL), {
    mode: "email",
    value: ANA_EMAIL
  });
  assert.deepEqual(resolveLoginIdentifier("4XHKH"), {
    mode: "rep_id",
    value: "4XHKH"
  });

  const authSource = readRepo("services/authService.js");
  assert.match(authSource, /findUserByLoginIdentifier/);
  assert.doesNotMatch(authSource, /createUser\(/);
  assert.doesNotMatch(authSource, /supabase\.auth/);
});

test("changeEmail updates the existing UUID and rejects a second identity", () => {
  const writeSource = readRepo("services/identityWriteService.js");
  const adminSource = readRepo("services/identityAdminService.js");
  const routeSource = readRepo("routes/adminUsers.js");

  assert.match(writeSource, /async function changeEmail\(userId, email\)/);
  assert.match(writeSource, /return updateUser\(userId, \{ email: normalized \}\)/);
  assert.match(writeSource, /EMAIL_CONFLICT/);
  assert.match(writeSource, /A user with this email already exists/);
  assert.doesNotMatch(writeSource, /changeEmail[\s\S]*createUser\(/);
  assert.match(adminSource, /action: "user.email_changed"/);
  assert.match(routeSource, /\/users\/:id\/email/);
});

test("interviewer pool still resolves Ana by UUID, not email", () => {
  const pool = normalizeInterviewerPool(TEAM_VISION_INTERVIEWER_POOL);
  const ana = pool.members.find((member) => member.userId === TEAM_VISION_ANA_USER_ID);

  assert.equal(TEAM_VISION_ANA_USER_ID, ANA_ID);
  assert.ok(ana, "Ana remains in the interviewer pool");
  assert.equal(ana.role, "primary");
  assert.equal(ana.displayName, "Ana Perez");
  assert.equal(Object.prototype.hasOwnProperty.call(ana, "email"), false);
});

test("Zoom and calendar integration ownership stays user-id based", () => {
  const ownership = classifyIntegrationOwnership({
    user_id: ANA_ID,
    organization_id: ANA_ID,
    email: OLD_SEED_EMAIL
  });

  assert.deepEqual(ownership, {
    kind: "personal",
    organizationId: ANA_ID,
    userId: ANA_ID
  });

  const ownershipSource = readRepo("core/personalIntegrationOwnership.js");
  assert.match(ownershipSource, /user_id NOT NULL → personal/);
  assert.doesNotMatch(ownershipSource, /row\.email/);
});

test("admin user directory surfaces the authoritative email", () => {
  const helperSource = readRepo("../frontend/src/pages/identity/adminUsersGridHelpers.js");
  const pageSource = readRepo("../frontend/src/pages/identity/AdminUsers.jsx");

  assert.match(helperSource, /user\.email/);
  assert.match(pageSource, /admin-users-col-email/);
  assert.match(pageSource, /changeAdminUserEmail/);
  assert.match(pageSource, /Does not create a new user/);
});
