/**
 * BR-169 — durable V2 certification grants + env-allowlist coexistence.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  isEligibleForLiveAuthoring
} = require("../core/recruitAiV2/liveAuthoringConfig");
const { isEligibleForExecution } = require("../core/recruitAiV2/executionConfig");
const {
  emptyGrant,
  grantAuthorizesAuthoring,
  grantAuthorizesExecution
} = require("../core/recruitAiV2/v2CertificationGrants");
const {
  evaluateLegacyCeAppointmentMutation
} = require("../core/recruitAiV2/legacyCeAppointmentMutationGate");

const TV = "00000000-0000-4000-8000-000000000001";
const TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const MIS = "d8d75c0e-d93e-42c9-950e-004fbfabdc8d";
const OTHER = "00000000-0000-4000-8000-000000000004";

function envAllowlist() {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: TV,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: NIOVEL,
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TV,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: NIOVEL
  };
}

function certifiedGrant(overrides = {}) {
  return emptyGrant({
    tenantCertified: true,
    tenantEnabled: true,
    tenantSuspended: false,
    authoringEnabled: false,
    executionEnabled: false,
    source: "durable",
    ...overrides
  });
}

test("production Misleisys rollout env keeps other TV users and Team Legacy off", () => {
  const prod = {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: TV,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: `${NIOVEL},${MIS}`,
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TV,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: `${NIOVEL},${MIS}`
  };
  for (const userId of [NIOVEL, MIS]) {
    const authoring = isEligibleForLiveAuthoring({
      organizationId: TV,
      actingUserId: userId,
      env: prod,
      invocationSource: "live_whatsapp"
    });
    const execution = isEligibleForExecution({
      organizationId: TV,
      actingUserId: userId,
      env: prod
    });
    assert.equal(authoring.eligible, true);
    assert.equal(execution.eligible, true);
  }
  const other = isEligibleForLiveAuthoring({
    organizationId: TV,
    actingUserId: OTHER,
    env: prod,
    invocationSource: "live_whatsapp"
  });
  const legacy = isEligibleForExecution({
    organizationId: TL,
    actingUserId: MIS,
    env: prod
  });
  assert.equal(other.eligible, false);
  assert.equal(legacy.eligible, false);
});

test("env allowlist still authorizes Niovel without a durable grant", () => {
  const authoring = isEligibleForLiveAuthoring({
    organizationId: TV,
    actingUserId: NIOVEL,
    env: envAllowlist(),
    invocationSource: "live_whatsapp"
  });
  const execution = isEligibleForExecution({
    organizationId: TV,
    actingUserId: NIOVEL,
    env: envAllowlist()
  });
  assert.equal(authoring.eligible, true);
  assert.equal(execution.eligible, true);
});

test("other Team Vision user stays off without grant", () => {
  const authoring = isEligibleForLiveAuthoring({
    organizationId: TV,
    actingUserId: OTHER,
    env: envAllowlist(),
    invocationSource: "live_whatsapp"
  });
  assert.equal(authoring.eligible, false);
  assert.equal(authoring.reason, "USER_NOT_ALLOWLISTED");
});

test("Team Legacy stays off without org allowlist or grant", () => {
  const authoring = isEligibleForLiveAuthoring({
    organizationId: TL,
    actingUserId: NIOVEL,
    env: envAllowlist(),
    invocationSource: "live_whatsapp"
  });
  assert.equal(authoring.eligible, false);
  assert.equal(authoring.reason, "ORG_NOT_ALLOWLISTED");
});

test("durable grant authorizes Misleisys authoring without env user id", () => {
  const grant = certifiedGrant({ authoringEnabled: true });
  const authoring = isEligibleForLiveAuthoring({
    organizationId: TV,
    actingUserId: MIS,
    env: envAllowlist(),
    invocationSource: "live_whatsapp",
    grant
  });
  const execution = isEligibleForExecution({
    organizationId: TV,
    actingUserId: MIS,
    env: envAllowlist(),
    grant
  });
  assert.equal(authoring.eligible, true);
  assert.equal(authoring.source, "durable_grant");
  assert.equal(execution.eligible, false);
  assert.equal(execution.reason, "USER_NOT_ALLOWLISTED");
});

test("execution is never implied by authoring grant", () => {
  const grant = certifiedGrant({ authoringEnabled: true, executionEnabled: false });
  assert.equal(grantAuthorizesAuthoring(grant), true);
  assert.equal(grantAuthorizesExecution(grant), false);
});

test("execution grant is independent of authoring grant", () => {
  const grant = certifiedGrant({ authoringEnabled: false, executionEnabled: true });
  assert.equal(grantAuthorizesAuthoring(grant), false);
  assert.equal(grantAuthorizesExecution(grant), true);
  const execution = isEligibleForExecution({
    organizationId: TL,
    actingUserId: OTHER,
    env: envAllowlist(),
    grant
  });
  assert.equal(execution.eligible, true);
  assert.equal(execution.source, "durable_grant");
});

test("uncertified or disabled tenant grant does not authorize", () => {
  const uncertified = certifiedGrant({
    tenantCertified: false,
    tenantEnabled: false,
    authoringEnabled: true,
    executionEnabled: true
  });
  assert.equal(grantAuthorizesAuthoring(uncertified), false);
  const disabled = certifiedGrant({
    tenantEnabled: false,
    authoringEnabled: true
  });
  assert.equal(grantAuthorizesAuthoring(disabled), false);
});

test("suspended tenant fails closed even with env allowlist", () => {
  const grant = emptyGrant({ tenantSuspended: true });
  const authoring = isEligibleForLiveAuthoring({
    organizationId: TV,
    actingUserId: NIOVEL,
    env: envAllowlist(),
    invocationSource: "live_whatsapp",
    grant
  });
  const execution = isEligibleForExecution({
    organizationId: TV,
    actingUserId: NIOVEL,
    env: envAllowlist(),
    grant
  });
  assert.equal(authoring.eligible, false);
  assert.equal(authoring.reason, "TENANT_SUSPENDED");
  assert.equal(execution.eligible, false);
  assert.equal(execution.reason, "TENANT_SUSPENDED");
});

test("master kill switch still denies certified grants", () => {
  const grant = certifiedGrant({ authoringEnabled: true, executionEnabled: true });
  const authoring = isEligibleForLiveAuthoring({
    organizationId: TV,
    actingUserId: MIS,
    env: { ...envAllowlist(), RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false" },
    invocationSource: "live_whatsapp",
    grant
  });
  const execution = isEligibleForExecution({
    organizationId: TV,
    actingUserId: MIS,
    env: { ...envAllowlist(), RECRUIT_AI_V2_EXECUTION_ENABLED: "false" },
    grant
  });
  assert.equal(authoring.eligible, false);
  assert.equal(authoring.reason, "LIVE_AUTHORING_DISABLED");
  assert.equal(execution.eligible, false);
  assert.equal(execution.reason, "EXECUTION_DISABLED");
});

test("CE mutation gate uses durable authoring without implying execution", () => {
  const grant = certifiedGrant({ authoringEnabled: true, executionEnabled: false });
  const result = evaluateLegacyCeAppointmentMutation({
    organizationId: TV,
    actingUserId: MIS,
    env: envAllowlist(),
    grant
  });
  assert.equal(result.authoringEligible, true);
  assert.equal(result.executionEligible, false);
  assert.equal(result.allowed, false);
});

test("migration and Super Admin/Admin routes exist", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/058_br169_recruit_ai_v2_grants.sql"),
    "utf8"
  );
  const platform = fs.readFileSync(
    path.join(__dirname, "../routes/platform.js"),
    "utf8"
  );
  const admin = fs.readFileSync(path.join(__dirname, "../routes/adminUsers.js"), "utf8");
  assert.match(migration, /recruit_ai_v2_tenant_grants/);
  assert.match(migration, /recruit_ai_v2_user_grants/);
  assert.match(migration, /enabled_requires_certified/);
  assert.match(platform, /tenants\/:id\/recruit-ai-v2/);
  assert.match(admin, /users\/:id\/recruit-ai-v2/);
  assert.doesNotMatch(admin, /role === ["']rvp["']/);
});
