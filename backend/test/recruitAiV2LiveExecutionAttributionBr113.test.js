/**
 * BR-113 — live execution attribution telemetry (no behavior change).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const attribution = require("../core/recruitAiV2/liveExecutionAttribution");
const {
  STAGES,
  EXECUTION_SOURCE,
  OUTCOME,
  classifyFromStages
} = attribution;

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function canaryEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP,
    ...overrides
  };
}

function baseProspect() {
  return {
    phone: "+17865550001",
    organization_id: TEAM_VISION_ORG,
    owner_user_id: PRIMARY_RVP,
    appointment_date: "2026-08-11T23:00:00.000Z",
    interview_time: "Monday at 7:00 PM",
    interview_type: "Zoom",
    notes: JSON.stringify({
      scheduling: { phase: "confirmed", dateKey: "2026-08-11", timeKey: "19:00" }
    })
  };
}

function baseProfile() {
  return {
    interviewType: "Zoom",
    preferredTime: "Monday at 7:00 PM",
    email: null
  };
}

async function runCompleteInterview({
  env = {},
  stages,
  executeScheduleInterview,
  processTurn,
  resolveAgentId = PRIMARY_RVP
} = {}) {
  const semantic = require("../core/semanticConversationEngine");
  const orgResolver = require("../core/autonomousScheduleAgentResolver");
  const mission = require("../application/missionExecutionApplicationService");
  const capacityEngine = require("../core/capacityEngine");
  const workflowStateStore = require("../core/workflowStateStore");

  const originalResolve = orgResolver.resolveAutonomousScheduleAgentId;
  const originalExecute = mission.executeScheduleInterview;
  const originalRelease = capacityEngine.releaseSlotByIso;
  const originalSave = workflowStateStore.savePersistedWorkflowState;

  orgResolver.resolveAutonomousScheduleAgentId = async () => ({
    agentId: resolveAgentId,
    source: "organization_rvp",
    repId: "4TJLK"
  });
  capacityEngine.releaseSlotByIso = () => {};
  workflowStateStore.savePersistedWorkflowState = () => {};

  let legacyCalls = 0;
  mission.executeScheduleInterview =
    executeScheduleInterview ||
    (async () => {
      legacyCalls += 1;
      return {
        success: true,
        appointmentId: "legacy-appt-1",
        appointment: {
          id: "legacy-appt-1",
          startDateTime: "2026-08-11T23:00:00.000Z",
          timezone: "America/New_York",
          meetingType: "virtual"
        },
        booking: { startTimeISO: "2026-08-11T23:00:00.000Z" }
      };
    });

  try {
    const result = await semantic.completeInterview(
      baseProspect(),
      baseProfile(),
      "en",
      {
        env,
        messageText: "si",
        inboundMessageId: "msg-attr-1",
        logStage: (stage, details) => {
          stages.push({ stage, details });
        },
        processTurn,
        dependencies: {
          getAppointmentProfile: async () => ({ profileConfigured: true }),
          findActiveAppointmentForProspect: async () => null,
          getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "19:00" }],
          executeScheduleInterview: async () => ({
            success: true,
            appointmentId: "v2-appt-1",
            appointment: {
              id: "v2-appt-1",
              startDateTime: "2026-08-11T23:00:00.000Z",
              timezone: "America/New_York",
              meetingType: "virtual"
            },
            booking: { startTimeISO: "2026-08-11T23:00:00.000Z" }
          })
        }
      }
    );
    return { result, legacyCalls };
  } finally {
    orgResolver.resolveAutonomousScheduleAgentId = originalResolve;
    mission.executeScheduleInterview = originalExecute;
    capacityEngine.releaseSlotByIso = originalRelease;
    workflowStateStore.savePersistedWorkflowState = originalSave;
  }
}

test("1. live path OFF + CE booking → NOT_ATTEMPTED", async () => {
  const stages = [];
  const { result, legacyCalls } = await runCompleteInterview({
    env: {},
    stages
  });
  assert.equal(result.success, true);
  assert.equal(legacyCalls, 1);
  assert.ok(stages.some((s) => s.stage === STAGES.NOT_ATTEMPTED));
  const notAttempted = stages.find((s) => s.stage === STAGES.NOT_ATTEMPTED);
  assert.equal(notAttempted.details.reason, "LIVE_PATH_DISABLED");
  assert.equal(notAttempted.details.outcome, OUTCOME.V2_EXECUTION_NOT_ATTEMPTED);
  assert.equal(
    notAttempted.details.executionSource,
    EXECUTION_SOURCE.LEGACY_NO_V2_ATTEMPT
  );
  assert.equal(stages.some((s) => s.stage === STAGES.LEGACY_FALLBACK), false);
  assert.equal(stages.some((s) => s.stage === STAGES.USED), false);
  assert.equal(
    classifyFromStages(stages.map((s) => s.stage)),
    EXECUTION_SOURCE.LEGACY_NO_V2_ATTEMPT
  );
});

test("2. live path ON + BR-111 authorized + v2 success → USED", async () => {
  const stages = [];
  const { result, legacyCalls } = await runCompleteInterview({
    env: canaryEnv(),
    stages
  });
  assert.equal(result.success, true);
  assert.equal(legacyCalls, 0);
  const used = stages.find((s) => s.stage === STAGES.USED);
  assert.ok(used);
  assert.equal(used.details.executionSource, EXECUTION_SOURCE.V2);
  assert.equal(used.details.outcome, OUTCOME.V2_EXECUTION_PERFORMED);
  assert.equal(used.details.appointmentId, "v2-appt-1");
  assert.equal(stages.some((s) => s.stage === STAGES.LEGACY_FALLBACK), false);
  assert.equal(stages.some((s) => s.stage === STAGES.NOT_ATTEMPTED), false);
  assert.equal(classifyFromStages(stages.map((s) => s.stage)), EXECUTION_SOURCE.V2);
});

test("3. live path ON + BR-111 denied + legacy CE books → LEGACY_FALLBACK", async () => {
  const stages = [];
  const { result, legacyCalls } = await runCompleteInterview({
    env: {
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true"
      // BR-111 gates closed
    },
    stages
  });
  assert.equal(result.success, true);
  assert.equal(legacyCalls, 1);
  assert.ok(stages.some((s) => s.stage === STAGES.NOT_USED));
  const fallback = stages.find((s) => s.stage === STAGES.LEGACY_FALLBACK);
  assert.ok(fallback);
  assert.equal(fallback.details.executionSource, EXECUTION_SOURCE.LEGACY_FALLBACK);
  assert.equal(
    fallback.details.outcome,
    OUTCOME.V2_EXECUTION_DENIED_LEGACY_FALLBACK_PERFORMED
  );
  assert.ok(fallback.details.priorReason);
  assert.equal(stages.some((s) => s.stage === STAGES.NOT_ATTEMPTED), false);
  assert.equal(
    classifyFromStages(stages.map((s) => s.stage)),
    EXECUTION_SOURCE.LEGACY_FALLBACK
  );
});

test("4. v2 not-used but legacy CE does not book → no fallback-performed", async () => {
  const stages = [];
  // Force v2 attempt that fails authorization, then legacy throws → no booking.
  const { result } = await runCompleteInterview({
    env: { RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true" },
    stages,
    executeScheduleInterview: async () => {
      throw new Error("legacy boom");
    }
  });
  assert.equal(result.success, false);
  assert.ok(stages.some((s) => s.stage === STAGES.NOT_USED));
  assert.equal(stages.some((s) => s.stage === STAGES.LEGACY_FALLBACK), false);
});

test("5. shadow produces none of these live attribution events", () => {
  const shadow = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/shadowEvaluationService.js"),
    "utf8"
  );
  for (const stage of Object.values(STAGES)) {
    assert.doesNotMatch(shadow, new RegExp(stage));
  }
  assert.doesNotMatch(shadow, /liveExecutionAttribution/);
});

test("6. advisory produces none", () => {
  const advisory = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/advisoryTurnRunner.js"),
    "utf8"
  );
  for (const stage of Object.values(STAGES)) {
    assert.doesNotMatch(advisory, new RegExp(stage));
  }
  assert.doesNotMatch(advisory, /liveExecutionAttribution|attemptLiveV2AppointmentExecution/);
});

test("7. no duplicate WhatsApp send", () => {
  const ce = fs.readFileSync(
    path.join(__dirname, "../core/semanticConversationEngine.js"),
    "utf8"
  );
  const attr = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveExecutionAttribution.js"),
    "utf8"
  );
  assert.doesNotMatch(attr, /sendAndPersistWhatsAppMessage|sendTextMessage/);
  assert.match(ce, /buildPersistedAppointmentConfirmation/);
  assert.match(ce, /liveExecutionAttribution/);
});

test("8. no change to appointment/calendar/prospect mutation behavior (source)", () => {
  const attr = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveExecutionAttribution.js"),
    "utf8"
  );
  assert.doesNotMatch(
    attr,
    /executeScheduleInterview|createAppointment|createCalendarEvent|updateProspect/
  );
  assert.match(attr, /Telemetry only/);
});

test("9. BR-111 preserved", () => {
  const authorizer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/sideEffectAuthorizer.js"),
    "utf8"
  );
  assert.match(authorizer, /profileConfigured/);
  assert.match(authorizer, /EXECUTION_ORGANIZATION_IDS|organizationIds/);
  assert.ok(
    fs.existsSync(
      path.join(__dirname, "recruitAiV2ExecutionCanaryBr111.test.js")
    )
  );
});

test("10. BR-112 preserved", () => {
  const bridge = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveExecutionBridge.js"),
    "utf8"
  );
  assert.match(bridge, /resolveAllowExecutionForLiveTurn/);
  assert.match(bridge, /attemptLiveV2AppointmentExecution/);
  assert.ok(
    fs.existsSync(
      path.join(__dirname, "recruitAiV2LiveExecutionPathBr112.test.js")
    )
  );
});

test("helper payloads and classification", () => {
  const used = attribution.buildUsedDetails({
    phone: "+1",
    organizationId: "o",
    agentId: "a",
    appointmentId: "x"
  });
  assert.equal(used.executionSource, "V2");
  assert.equal(used.outcome, "V2_EXECUTION_PERFORMED");

  const notAttempted = attribution.buildNotAttemptedDetails({
    reason: "LIVE_PATH_DISABLED"
  });
  assert.equal(notAttempted.outcome, "V2_EXECUTION_NOT_ATTEMPTED");

  const fallback = attribution.buildLegacyFallbackDetails({
    priorReason: "BR111_DENIED_OR_NOT_PROPOSED",
    authorized: false
  });
  assert.equal(fallback.executionSource, "LEGACY_FALLBACK");
  assert.equal(
    classifyFromStages([STAGES.USED, STAGES.NOT_USED]),
    EXECUTION_SOURCE.V2
  );
});

test("docs mention BR-113 attribution", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-113/);
});
