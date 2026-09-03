/**
 * BR-223 — IUL Policy Review Workflow Simulator tests.
 */

"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listIulPolicyReviewScenarios,
  runIulPolicyReviewScenarioById,
  runAllIulDryRunScenarioPack,
  getIulGoldenSuiteMeta
} = require("../dev/iulPolicyReviewScenarioPack");
const {
  assertSafeIulSimulatorIdentity,
  createIulEphemeralSession,
  runIulSimulatorTurn,
  SIM_IUL_PREFIX
} = require("../dev/iulPolicyReviewScenarioRunner");
const {
  resolveStagingCalendarConfig,
  STAGING_GUARD_ERROR,
  isStagingCalendarMatch
} = require("../dev/iulStagingCalendarGuard");
const { runRecruitAiV2ScenarioById } = require("../dev/recruitAiV2ScenarioPack");
const { IUL_OPTION_IDS } = require("../dev/iulSimulatorShared");

function superAdminReq(overrides = {}) {
  return {
    atlasUser: { id: "super-admin-id", saas_role: "SUPER_ADMIN", organization_id: "org-home" },
    authContext: { saasRole: "SUPER_ADMIN", userId: "super-admin-id", organizationId: "org-home" },
    controlPlaneOnly: true,
    tenantContext: {
      organizationId: null,
      homeOrganizationId: "org-home",
      userId: "super-admin-id",
      saasRole: "SUPER_ADMIN"
    },
    ...overrides
  };
}

test("1. IUL scenario registry lists dry-run and staging scenarios", () => {
  const listed = listIulPolicyReviewScenarios();
  assert.ok(listed.length >= 15);
  assert.ok(listed.some((s) => s.id === "iul-full-golden-path"));
  assert.ok(listed.some((s) => s.id === "iul-full-staging-e2e-zoom"));
  assert.equal(getIulGoldenSuiteMeta().count, listed.filter((s) => s.mode !== "staging_e2e").length);
});

test("2. rejects non-simulator prospect ids", () => {
  assert.throws(
    () => assertSafeIulSimulatorIdentity({ prospectId: "real-prospect-id" }),
    /rejects non-simulator/
  );
});

test("3. ephemeral IUL session uses sim-iul prefix", () => {
  const session = createIulEphemeralSession({
    prospectId: `${SIM_IUL_PREFIX}unit`,
    organizationId: "00000000-0000-4000-8000-000000000001",
    campaignIntakePurpose: "IUL"
  });
  assert.equal(session.context.prospectId, `${SIM_IUL_PREFIX}unit`);
  assert.equal(session.writes.productionContextRows, 0);
});

test("4. dry-run golden path scenario passes with real engine + fixtures", async () => {
  const report = await runIulPolicyReviewScenarioById("iul-full-golden-path");
  assert.equal(report.mode, "dry_run");
  assert.equal(report.ephemeral, true);
  assert.ok(report.turns.length >= 5, "expected multi-turn golden path");
  if (!report.pass) {
    const failed = report.turns.filter((t) => !t.pass);
    assert.fail(`Golden path failed: ${JSON.stringify(failed[0]?.failures || failed[0])}`);
  }
});

test("5. research → growth → zoom offers day picker", async () => {
  const report = await runIulPolicyReviewScenarioById("iul-research-growth-zoom");
  assert.equal(report.pass, true, JSON.stringify(report.turns.at(-1)?.failures));
});

test("6. staging guard requires SUPER_ADMIN", async () => {
  await assert.rejects(
    () =>
      resolveStagingCalendarConfig(
        {
          atlasUser: { id: "user", saas_role: "ADMIN" },
          authContext: { saasRole: "ADMIN" },
          controlPlaneOnly: false,
          tenantContext: { organizationId: "org", homeOrganizationId: "org" }
        },
        { explicitStagingMode: true }
      ),
    /SUPER_ADMIN is required/
  );
});

test("7. staging guard rejects Support Mode tenant calendar path", async () => {
  await assert.rejects(
    () =>
      resolveStagingCalendarConfig(
        {
          ...superAdminReq(),
          supportContext: { organizationId: "tenant-org" },
          tenantContext: {
            organizationId: "tenant-org",
            homeOrganizationId: "org-home",
            saasRole: "SUPER_ADMIN"
          },
          controlPlaneOnly: false
        },
        { explicitStagingMode: true }
      ),
    /Support Mode tenant integrations are not allowed/
  );
});

test("8. staging calendar match requires Atlas Staging name", () => {
  assert.equal(isStagingCalendarMatch({ summary: "Atlas Staging", id: "cal-1" }, "cal-1"), true);
  assert.equal(
    isStagingCalendarMatch({ summary: "Production", id: "cal-other" }, "cal-2"),
    false
  );
});

test("9. interactive ID replay uses real IUL option ids", async () => {
  const session = createIulEphemeralSession({
    prospectId: `${SIM_IUL_PREFIX}interactive-replay`,
    organizationId: "00000000-0000-4000-8000-000000000001",
    campaignIntakePurpose: "IUL",
    campaignKind: "iul_review_ad",
    conversationGoal: "policy_review",
    preferredLanguage: "spanish",
    testNow: "2026-09-02T16:00:00.000Z",
    availabilityFixture: { slots: require("../dev/iulSimulatorShared").MULTI_DAY_SLOTS }
  });

  const turn = await runIulSimulatorTurn(session, {
    id: "zoom",
    text: "Por Zoom",
    interactiveReply: { type: "button_reply", id: IUL_OPTION_IDS.MEET_ZOOM, title: "Por Zoom" },
    setup: {
      availabilityFixture: { slots: require("../dev/iulSimulatorShared").MULTI_DAY_SLOTS },
      knownFacts: require("../dev/iulSimulatorShared").researchFacts(),
      conversation: { lastQuestionAsked: "ask_meeting_mode" }
    }
  });

  assert.ok(turn.diagnostics);
  assert.equal(turn.interactiveSelection.id, IUL_OPTION_IDS.MEET_ZOOM);
});

test("10. recruiting simulator unchanged", () => {
  const report = runRecruitAiV2ScenarioById("first-production-failure");
  assert.equal(report.recruitAiV2, true);
  assert.equal(report.pass, true);
});

test("11. golden suite runs without production writes", async () => {
  const suite = await runAllIulDryRunScenarioPack();
  assert.equal(suite.iulPolicyReview, true);
  assert.equal(suite.mode, "dry_run");
  for (const report of suite.reports) {
    assert.equal(report.summary.productionWrites.productionContextRows, 0);
    assert.equal(report.summary.sideEffectsDenied, true);
  }
});

test("12. BR-222 fresh intake reset scenario", async () => {
  const report = await runIulPolicyReviewScenarioById("iul-fresh-intake-reset");
  const resetTurn = report.turns.find((t) => t.turn === "fresh-reset");
  assert.ok(resetTurn);
  assert.equal(resetTurn.pass, true, JSON.stringify(resetTurn.failures));
});

test("13. missing staging calendar fails closed when integration disconnected", async () => {
  const original = require("../services/googleCalendarIntegrationService").getPersonalIntegrationStatus;
  require("../services/googleCalendarIntegrationService").getPersonalIntegrationStatus = async () => ({
    connected: false,
    calendarId: null
  });

  try {
    await assert.rejects(
      () => resolveStagingCalendarConfig(superAdminReq(), { explicitStagingMode: true }),
      /Connected personal Google Calendar integration is required/
    );
  } finally {
    require("../services/googleCalendarIntegrationService").getPersonalIntegrationStatus = original;
  }
});
