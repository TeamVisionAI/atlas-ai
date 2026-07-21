/**
 * Journey #1 — Onboarding backend verification (direct service calls).
 * Run: node backend/dev/verifyJourney1.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  signupWithPassword,
  loginWithPassword,
  createSessionForUser
} = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  saveMeetingPreferences,
  activateOrganization,
  getOrganizationForUser,
  resolveOnboardingRoute
} = require("../services/organizationService");
const { getOnboardingStatus, getHomeDashboardSummary } = require("../services/onboardingService");

const USERS_FILE = path.join(__dirname, "../data/atlasUsers.json");
const ORGS_FILE = path.join(__dirname, "../data/organizations.json");
const SESSIONS_FILE = path.join(__dirname, "../data/atlasSessions.json");

function resetLocalStores() {
  for (const file of [USERS_FILE, ORGS_FILE, SESSIONS_FILE]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

async function run() {
  console.log("Journey #1 — Onboarding backend verification\n");

  resetLocalStores();

  const email = `journey1.${Date.now()}@example.com`;
  const password = "AtlasTest123";

  const user = await signupWithPassword({ email, password });
  assert.ok(user.id);
  console.log("✓ Signup creates user");

  const session = await createSessionForUser(user.id);
  assert.ok(session.token);
  console.log("✓ Session created");

  let status = await getOnboardingStatus(user);
  assert.strictEqual(status.nextRoute, "/onboarding/organization");
  console.log("✓ New user routed to organization step");

  const organization = await createOrganizationForUser(user.id, "Team Vision");
  assert.strictEqual(organization.name, "Team Vision");
  console.log("✓ Organization created");

  status = await getOnboardingStatus(user);
  assert.strictEqual(status.nextRoute, "/onboarding/meta");
  console.log("✓ Organization step advances onboarding");

  await saveMeetingPreferences(organization.id, {
    office: true,
    zoom: true,
    officeAddress: "123 Main St, Tampa, FL"
  });
  console.log("✓ Meeting preferences saved");

  const activated = await activateOrganization(organization.id);
  assert.ok(activated.activated_at);
  console.log("✓ Atlas activation completes onboarding");

  status = await getOnboardingStatus(user);
  assert.strictEqual(status.nextRoute, "/app");
  console.log("✓ Activated user routed to dashboard");

  const summary = await getHomeDashboardSummary(user);
  assert.ok(summary.organization);
  console.log("✓ Home dashboard summary available");

  const loggedIn = await loginWithPassword(email, password);
  assert.strictEqual(loggedIn.email, email);
  console.log("✓ Login works for onboarded user");

  const persisted = await getOrganizationForUser(user.id);
  assert.strictEqual(persisted.name, "Team Vision");
  assert.strictEqual(resolveOnboardingRoute(persisted), "/app");
  console.log("✓ Organization persisted in local store");

  console.log("\nAll Journey #1 backend checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
