/**
 * BR-146 — Team Vision seed tenant invariant.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TEAM_VISION_ORGANIZATION_ID,
  isTeamVisionSeedTenant,
  shouldSkipAutomaticTrialExpiry,
  assertTeamVisionNotDestructible,
  assertCannotMutateSeedFromOtherTenant
} = require("../core/teamVisionSeedTenant");
const { TENANT_STATUS, isTenantOperational } = require("../core/tenantLifecycle");
const tenantBillingService = require("../services/tenantBillingService");
const platformTenantService = require("../services/platformTenantService");

const ORG_B = "00000000-0000-4000-8000-000000000099";
const SEED = TEAM_VISION_ORGANIZATION_ID;

test("seed identity helpers", () => {
  assert.equal(isTeamVisionSeedTenant(SEED), true);
  assert.equal(isTeamVisionSeedTenant(ORG_B), false);
  assert.equal(shouldSkipAutomaticTrialExpiry(SEED), true);
  assert.equal(shouldSkipAutomaticTrialExpiry(ORG_B), false);
});

test("seed tenant remains operational even with stale trial end dates", () => {
  assert.equal(
    isTenantOperational(TENANT_STATUS.TRIAL, {
      trialEndsAt: "2020-01-01T00:00:00.000Z",
      organizationId: SEED
    }),
    true
  );
  assert.equal(
    isTenantOperational(TENANT_STATUS.SUSPENDED, { organizationId: SEED }),
    false
  );
});

test("delete/archive/reset fail closed for Team Vision and 501 for other tenants", () => {
  assert.throws(
    () => platformTenantService.deleteTenant(SEED),
    (error) => error.publicCode === "SEED_TENANT_PROTECTED"
  );
  assert.throws(
    () => platformTenantService.archiveTenant(SEED),
    (error) => error.publicCode === "SEED_TENANT_PROTECTED"
  );
  assert.throws(
    () => platformTenantService.resetTenant(SEED),
    (error) => error.publicCode === "SEED_TENANT_PROTECTED"
  );
  assert.throws(
    () => platformTenantService.deleteTenant(ORG_B),
    (error) => error.publicCode === "TENANT_DELETE_NOT_IMPLEMENTED"
  );
});

test("child tenant cannot target Team Vision for mutation", () => {
  assert.throws(
    () => assertCannotMutateSeedFromOtherTenant(SEED, ORG_B),
    (error) => error.publicCode === "SEED_TENANT_PROTECTED"
  );
  assert.doesNotThrow(() => assertCannotMutateSeedFromOtherTenant(ORG_B, ORG_B));
  assert.doesNotThrow(() => assertCannotMutateSeedFromOtherTenant(SEED, SEED));
  assert.doesNotThrow(() => assertTeamVisionNotDestructible(ORG_B, "delete"));
});

test("expired trial dates on Team Vision never auto PAST_DUE", async () => {
  const organizations = new Map([
    [
      SEED,
      {
        id: SEED,
        name: "Team Vision",
        status: "active",
        subscription_status: "active",
        subscription_plan: "professional",
        is_active: true
      }
    ]
  ]);
  const subscriptions = new Map([
    [
      SEED,
      {
        organization_id: SEED,
        plan: "professional",
        status: "active",
        currency: "USD",
        trial_starts_at: "2020-01-01T00:00:00.000Z",
        trial_ends_at: "2020-01-08T00:00:00.000Z",
        metadata: {}
      }
    ]
  ]);

  tenantBillingService.setBillingPersistenceForTests({
    async loadOrganization(organizationId) {
      return organizations.get(organizationId) || null;
    },
    async loadSubscription(organizationId) {
      return subscriptions.get(organizationId) || null;
    },
    async saveOrganization(organizationId, patch) {
      const next = { ...organizations.get(organizationId), ...patch, id: organizationId };
      organizations.set(organizationId, next);
      return next;
    },
    async saveSubscription(organizationId, patch) {
      const next = { ...subscriptions.get(organizationId), ...patch, organization_id: organizationId };
      subscriptions.set(organizationId, next);
      return next;
    }
  });

  try {
    const derived = tenantBillingService.deriveBillingLifecycle(
      organizations.get(SEED),
      subscriptions.get(SEED)
    );
    assert.equal(derived, TENANT_STATUS.ACTIVE);

    const expired = await tenantBillingService.expireTrialIfNeeded(SEED);
    assert.equal(expired.expired, false);
    assert.equal(expired.billing.lifecycleStatus, TENANT_STATUS.ACTIVE);
    assert.equal(organizations.get(SEED).status, "active");

    await assert.rejects(
      () => tenantBillingService.updateBilling(SEED, { trialEndsAt: "2026-01-01T00:00:00.000Z" }),
      (error) => error.publicCode === "SEED_TENANT_PROTECTED"
    );

    const seeded = await tenantBillingService.initializeBillingForNewTenant(
      SEED,
      TENANT_STATUS.TRIAL,
      "2026-08-01T00:00:00.000Z"
    );
    assert.equal(seeded.orgRow.status, "active");
    assert.equal(seeded.subscriptionRow.trial_starts_at, null);
    assert.equal(seeded.subscriptionRow.trial_ends_at, null);
  } finally {
    tenantBillingService.setBillingPersistenceForTests(null);
  }
});
