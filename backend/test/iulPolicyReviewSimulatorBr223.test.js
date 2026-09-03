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
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveStagingCalendarConfig,
  STAGING_GUARD_ERROR,
  isStagingCalendarMatch
} = require("../dev/iulStagingCalendarGuard");
const {
  createIulStagingBookingGrant,
  assertIulStagingBookingGrant,
  IUL_STAGING_E2E_INVOCATION_SOURCE
} = require("../dev/iulStagingBookingGrant");
const {
  certifyIulStagingBooking,
  slotToIsoRange,
  createStagingBookingDependencies
} = require("../dev/iulStagingE2EService");
const { runIulStagingE2EScenario } = require("../dev/iulPolicyReviewScenarioRunner");
const { processRecruitAiV2Turn } = require("../core/recruitAiV2");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { runRecruitAiV2ScenarioById } = require("../dev/recruitAiV2ScenarioPack");
const { IUL_OPTION_IDS, MULTI_DAY_SLOTS } = require("../dev/iulSimulatorShared");
const { NEXT_ACTIONS } = require("../core/recruitAiV2/constants");

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

function stagingConfigFixture(overrides = {}) {
  return {
    organizationId: "org-home",
    userId: "super-admin-id",
    calendarId: "atlas-staging-cal-id",
    calendarName: "Atlas Staging",
    personalZoomUrl: "https://zoom.us/j/555111222",
    officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    environment: "test",
    titlePrefix: "[ATLAS IUL SIMULATOR]",
    ...overrides
  };
}

function makeGrant(overrides = {}) {
  return createIulStagingBookingGrant({
    stagingConfig: stagingConfigFixture(overrides),
    simulatorRunId: "iul-sim-test-1",
    scenarioId: "iul-full-staging-e2e-zoom"
  });
}

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

test("A. staging E2E invokes real IUL booking orchestration", () => {
  const runnerSrc = fs.readFileSync(
    path.join(__dirname, "../dev/iulPolicyReviewScenarioRunner.js"),
    "utf8"
  );
  assert.match(runnerSrc, /executeScheduleInterview/);
  assert.match(runnerSrc, /allowExecution:\s*true/);
  assert.match(runnerSrc, /iulStagingE2EGrant/);
  assert.match(runnerSrc, /processRecruitAiV2Turn/);
});

test("B. simulator manual calendar insertion is not the booking mechanism", () => {
  const runnerSrc = fs.readFileSync(
    path.join(__dirname, "../dev/iulPolicyReviewScenarioRunner.js"),
    "utf8"
  );
  const e2eSrc = fs.readFileSync(
    path.join(__dirname, "../dev/iulStagingE2EService.js"),
    "utf8"
  );
  assert.doesNotMatch(runnerSrc, /createStagingSimulatorEvent/);
  assert.doesNotMatch(e2eSrc, /async function createStagingSimulatorEvent/);
  assert.match(e2eSrc, /schedulingService\.scheduleAppointment|createCalendarEvent/);
});

test("C. Zoom final confirmation must include configured Zoom URL", () => {
  const zoom = "https://zoom.us/j/555111222";
  const result = certifyIulStagingBooking({
    meetingMode: "zoom",
    bookingResult: { success: true, appointmentId: "a1", meetingUrl: zoom },
    renderedText: `✅ Su revisión por Zoom quedó confirmada.\n${zoom}`,
    reasonCodes: [],
    configuredZoomUrl: zoom,
    calendarEvent: { id: "evt-1", location: zoom },
    calendarCreateCount: 1,
    replayCalendarCreateCount: 1
  });
  assert.equal(result.pass, true, JSON.stringify(result.failures));
});

test("D. calendar-only Zoom URL does not count as PASS", () => {
  const zoom = "https://zoom.us/j/555111222";
  const result = certifyIulStagingBooking({
    meetingMode: "zoom",
    bookingResult: { success: true, appointmentId: "a1", meetingUrl: zoom },
    renderedText: "Su revisión quedó confirmada para el jueves.",
    reasonCodes: [],
    configuredZoomUrl: zoom,
    calendarEvent: { id: "evt-1", location: zoom, zoomUrl: zoom },
    calendarCreateCount: 1,
    replayCalendarCreateCount: 1
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.path === "finalConfirmationZoomUrl"));
});

test("E. Office final confirmation excludes Zoom", () => {
  const office = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
  const pass = certifyIulStagingBooking({
    meetingMode: "in_person",
    bookingResult: { success: true, appointmentId: "a1" },
    renderedText: `✅ Su revisión en la oficina quedó confirmada.\n${office}`,
    reasonCodes: [],
    officeAddress: office,
    calendarEvent: { id: "evt-2", location: office },
    calendarCreateCount: 1,
    replayCalendarCreateCount: 1
  });
  assert.equal(pass.pass, true, JSON.stringify(pass.failures));

  const fail = certifyIulStagingBooking({
    meetingMode: "in_person",
    bookingResult: { success: true, appointmentId: "a1" },
    renderedText: "Confirmada. https://zoom.us/j/555111222",
    reasonCodes: [],
    officeAddress: office,
    calendarEvent: { id: "evt-2", location: office },
    calendarCreateCount: 1,
    replayCalendarCreateCount: 1
  });
  assert.equal(fail.pass, false);
});

test("F/G. same slot-selection replay creates one calendar event total via booking path", async () => {
  const grant = makeGrant();
  let scheduleCalls = 0;
  const deps = createStagingBookingDependencies({
    grant,
    prospectId: "sim-iul-replay",
    phone: "sim-iul-phone",
    getSlotsImpl: async () => ({ slots: MULTI_DAY_SLOTS }),
    resolveCanonicalVirtualMeetingUrl: async () => ({
      url: grant.personalZoomUrl,
      status: "configured"
    }),
    scheduleAppointmentImpl: async (input) => {
      scheduleCalls += 1;
      assert.equal(input.metadata.stagingCalendarTarget.calendarId, grant.calendarId);
      return {
        success: true,
        googleCalendarEventId: "evt-replay-1",
        startTimeISO: "2026-09-03T13:00:00.000Z",
        meetingUrl: grant.personalZoomUrl,
        zoomLink: grant.personalZoomUrl
      };
    }
  });

  const first = await deps.executeScheduleInterview(
    "sim-iul-phone",
    { dateKey: "2026-09-03", timeKey: "09:00", interviewType: "Zoom", purpose: "policy_review" },
    {
      organizationId: grant.organizationId,
      agentId: grant.userId,
      userId: grant.userId,
      inboundMessageId: "sim-wamid.replay.slot",
      recruitAiV2CoreProspectId: "sim-iul-replay",
      iulStagingE2EGrant: grant
    }
  );
  assert.equal(first.success, true, JSON.stringify(first));
  assert.equal(scheduleCalls, 1);
  assert.equal(deps.store.calendarCreateCount, 1);

  const existing = await deps.findActiveAppointmentForProspect();
  assert.ok(existing?.id);

  const { executeAuthorizedSideEffects } = require("../core/recruitAiV2/sideEffectExecutor");
  const replay = await executeAuthorizedSideEffects({
    authorization: {
      authorized: true,
      organizationId: grant.organizationId,
      actingUserId: grant.userId,
      proposals: [{ type: "create_appointment", authorized: true }]
    },
    structuredDecision: {
      decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT || "create_appointment" },
      entities: { requestedDate: "2026-09-03", requestedTime: "09:00" }
    },
    context: {
      prospectId: "sim-iul-replay",
      prospectPhone: "sim-iul-phone",
      organizationId: grant.organizationId,
      timezone: "America/New_York",
      campaignKind: "iul_review_ad",
      appointment: { proposedDate: "2026-09-03", proposedTime: "09:00" },
      knownFacts: { meetingMode: "zoom", reviewProposedDate: "2026-09-03", reviewProposedTime: "09:00" }
    },
    options: {
      inboundMessageId: "sim-wamid.replay.slot",
      iulStagingE2EGrant: grant,
      dependencies: {
        findActiveAppointmentForProspect: deps.findActiveAppointmentForProspect,
        getSlots: deps.getSlots,
        executeScheduleInterview: deps.executeScheduleInterview
      }
    },
    dependencies: {
      findActiveAppointmentForProspect: deps.findActiveAppointmentForProspect,
      getSlots: deps.getSlots,
      executeScheduleInterview: deps.executeScheduleInterview
    }
  });

  assert.equal(replay.success, true);
  assert.equal(replay.idempotent, true);
  assert.equal(deps.store.calendarCreateCount, 1);
  assert.equal(scheduleCalls, 1);
});

test("H. staging availability uses real provider path", async () => {
  const grant = makeGrant();
  const deps = createStagingBookingDependencies({
    grant,
    prospectId: "sim-iul-avail",
    phone: "sim-iul-phone",
    getSlotsImpl: async () => ({ slots: MULTI_DAY_SLOTS })
  });
  const slots = await deps.getSlots({ date: "2026-09-03" });
  assert.equal(deps.evidence.provider, "appointmentApplicationService.getSlots");
  assert.equal(deps.evidence.calendarId, grant.calendarId);
  assert.ok(slots.slots.length > 0);
});

test("I. timezone conversion handles EST and EDT", () => {
  const edt = slotToIsoRange({ dateKey: "2026-09-03", timeKey: "09:00" }, "America/New_York");
  const est = slotToIsoRange({ dateKey: "2026-01-15", timeKey: "09:00" }, "America/New_York");
  const dstSpring = slotToIsoRange({ dateKey: "2026-03-08", timeKey: "03:30" }, "America/New_York");
  assert.equal(edt.startTimeISO, "2026-09-03T13:00:00.000Z");
  assert.equal(est.startTimeISO, "2026-01-15T14:00:00.000Z");
  assert.equal(dstSpring.startTimeISO, "2026-03-08T07:30:00.000Z");
  assert.notEqual(edt.startTimeISO, est.startTimeISO);
});

test("J. production inbound cannot activate staging injection", async () => {
  const grant = makeGrant();
  const result = await processRecruitAiV2Turn({
    message: { id: "wamid.live", text: "Hola" },
    context: {
      prospectId: "sim-iul-live-block",
      organizationId: grant.organizationId,
      preferredLanguage: "spanish"
    },
    options: {
      invocationSource: "live_whatsapp",
      iulStagingE2EGrant: grant,
      allowExecution: true,
      env: {
        RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
        RECRUIT_AI_V2_SHADOW_ENABLED: "false"
      }
    }
  });
  assert.equal(result.execution.attempted, false);
  assert.equal(result.authorization.authorized, false);

  assert.throws(
    () =>
      assertIulStagingBookingGrant({
        ...grant,
        invocationSource: "live_whatsapp"
      }),
    /not valid for this invocation source/
  );

  const denied = authorizeSideEffects({
    structuredDecision: {
      decision: { nextAction: "create_appointment", mayCreateAppointment: true }
    },
    responsePlan: { templateKey: "iul_confirm_review_deferred" },
    env: { RECRUIT_AI_V2_EXECUTION_ENABLED: "false" },
    profileConfigured: true,
    actingUserId: grant.userId,
    organizationId: grant.organizationId,
    options: {
      invocationSource: "live_whatsapp",
      iulStagingE2EGrant: grant
    }
  });
  assert.equal(denied.authorized, false);
});

test("K. dry-run remains side-effect free", async () => {
  const report = await runIulPolicyReviewScenarioById("iul-full-golden-path");
  assert.equal(report.summary.sideEffectsDenied, true);
  for (const turn of report.turns) {
    assert.equal(turn.execution.whatsapp, false);
    assert.equal(turn.execution.calendar, false);
    assert.equal(turn.persistence.attempted, false);
  }
});

test("L. recruiting simulator unchanged after staging booking seam", () => {
  const report = runRecruitAiV2ScenarioById("first-production-failure");
  assert.equal(report.recruitAiV2, true);
  assert.equal(report.pass, true);
  assert.equal(report.summary.sideEffectsDenied, true);
});

test("N. invalid staging calendar target fails closed in grant", () => {
  assert.throws(
    () =>
      assertIulStagingBookingGrant({
        kind: "IUL_STAGING_E2E",
        explicitStagingMode: true,
        invocationSource: IUL_STAGING_E2E_INVOCATION_SOURCE,
        calendarName: "Production",
        calendarId: "primary",
        organizationId: "org",
        userId: "user",
        simulatorRunId: "x"
      }),
    /Atlas Staging|primary|exactly/
  );
});

test("O. harnessed staging E2E uses injected scheduleAppointment not manual insert", async () => {
  let scheduled = 0;
  const zoom = "https://zoom.us/j/555111222";
  const report = await runIulStagingE2EScenario(
    {
      id: "iul-full-staging-e2e-zoom",
      name: "P. Full IUL Staging E2E (Zoom)",
      meetingMode: "zoom"
    },
    superAdminReq(),
    {
      stagingConfig: stagingConfigFixture(),
      simulatorRunId: "iul-sim-harness-1",
      testNow: "2026-09-02T16:00:00.000Z",
      getSlots: async () => ({ slots: MULTI_DAY_SLOTS }),
      resolveCanonicalVirtualMeetingUrl: async () => ({
        url: zoom,
        status: "configured"
      }),
      scheduleAppointment: async (input) => {
        scheduled += 1;
        assert.ok(input.metadata.stagingCalendarTarget);
        assert.equal(input.metadata.stagingCalendarTarget.calendarName, "Atlas Staging");
        return {
          success: true,
          googleCalendarEventId: "evt-harness-1",
          startTimeISO: "2026-09-03T13:00:00.000Z",
          meetingUrl: zoom,
          zoomLink: zoom
        };
      },
      findCreatedEvent: async () => ({
        id: "evt-harness-1",
        location: zoom
      })
    }
  );

  assert.ok(scheduled >= 1, "real scheduleAppointment must be invoked");
  assert.equal(report.bookingPath, "executeScheduleInterview");
  if (!report.pass) {
    assert.fail(JSON.stringify({
      failures: report.certification?.failures,
      last: report.turns?.at(-1)?.failures,
      replay: report.replay,
      assertions: report.assertions
    }));
  }
});
