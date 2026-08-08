/**
 * BR-112 — live-path cutover capability (allowExecution derivation).
 * Does not enable Railway vars. No production writes.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveLiveExecutionPathConfig,
  isLiveExecutionPathEnabled,
  resolveAllowExecutionForLiveTurn,
  attemptLiveV2AppointmentExecution,
  buildLiveConfirmContext
} = require("../core/recruitAiV2/liveExecutionBridge");
const {
  authorizeSideEffects
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const { processRecruitAiV2Turn } = require("../core/recruitAiV2/orchestrator");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_RVP = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const WRONG_ORG = "99999999-9999-4999-8999-999999999999";

function canaryExecutionEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP,
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true",
    ...overrides
  };
}

function liveProspect(overrides = {}) {
  return {
    id: "prospect-live-1",
    phone: "+17875550999",
    organization_id: TEAM_VISION_ORG,
    owner_user_id: PRIMARY_RVP,
    name: "Canary Prospect",
    city: "Orlando",
    state: "FL",
    interview_type: "Zoom",
    appointment_date: "2026-08-11T23:00:00.000Z",
    ...overrides
  };
}

function schedulePayload() {
  return {
    dateKey: "2026-08-11",
    timeKey: "19:00",
    interviewType: "Zoom"
  };
}

function mockDeps({ scheduleCalls }) {
  return {
    executeScheduleInterview: async () => {
      scheduleCalls.count += 1;
      return {
        success: true,
        appointmentId: `appt-${scheduleCalls.count}`,
        appointment: { id: `appt-${scheduleCalls.count}` },
        booking: {
          startTimeISO: "2026-08-11T23:00:00.000Z",
          dateKey: "2026-08-11",
          timeKey: "19:00"
        }
      };
    },
    findActiveAppointmentForProspect: async () =>
      scheduleCalls.count > 0
        ? { id: "appt-1", status: "scheduled" }
        : null,
    getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "19:00" }],
    getAppointmentProfile: async () => ({ profileConfigured: true })
  };
}

test("1. live turn + allowExecution omitted → zero v2 mutations", async () => {
  const scheduleCalls = { count: 0 };
  const result = await processRecruitAiV2Turn({
    message: { text: "si", id: "m1" },
    context: buildLiveConfirmContext({
      prospect: liveProspect(),
      schedulePayload: schedulePayload(),
      organizationId: TEAM_VISION_ORG,
      agentId: PRIMARY_RVP
    }),
    options: {
      env: canaryExecutionEnv(),
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550999",
      dependencies: mockDeps({ scheduleCalls })
      // allowExecution omitted
    }
  });
  assert.equal(result.execution.attempted, false);
  assert.equal(scheduleCalls.count, 0);
});

test("2. live turn + allowExecution=false → zero v2 mutations", async () => {
  const scheduleCalls = { count: 0 };
  const result = await processRecruitAiV2Turn({
    message: { text: "si", id: "m2" },
    context: buildLiveConfirmContext({
      prospect: liveProspect(),
      schedulePayload: schedulePayload(),
      organizationId: TEAM_VISION_ORG,
      agentId: PRIMARY_RVP
    }),
    options: {
      env: canaryExecutionEnv(),
      allowExecution: false,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550999",
      dependencies: mockDeps({ scheduleCalls })
    }
  });
  assert.equal(result.execution.attempted, false);
  assert.equal(scheduleCalls.count, 0);
});

test("3. shadow turn can never set allowExecution=true", () => {
  const shadow = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/shadowEvaluationService.js"),
    "utf8"
  );
  assert.match(shadow, /allowExecution:\s*false/);
  assert.doesNotMatch(shadow, /allowExecution:\s*true/);
  assert.equal(
    resolveAllowExecutionForLiveTurn({
      env: canaryExecutionEnv(),
      invocationSource: "shadow"
    }),
    false
  );
});

test("4. advisory turn can never set allowExecution=true", () => {
  const advisory = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/advisoryTurnRunner.js"),
    "utf8"
  );
  assert.doesNotMatch(advisory, /allowExecution:\s*true/);
  assert.doesNotMatch(advisory, /attemptLiveV2AppointmentExecution/);
  assert.equal(
    resolveAllowExecutionForLiveTurn({
      env: canaryExecutionEnv(),
      invocationSource: "advisory"
    }),
    false
  );
});

test("5. wrong organization → zero mutations", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect({ organization_id: WRONG_ORG }),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: WRONG_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: canaryExecutionEnv(),
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.allowExecution, true);
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(attempt.v2Result?.authorization?.authorized, false);
  assert.equal(scheduleCalls.count, 0);
});

test("6. correct org + wrong user → zero mutations", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect({ owner_user_id: OTHER_RVP }),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: OTHER_RVP,
    messageText: "si",
    env: canaryExecutionEnv(),
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("7. same org + another RVP → zero mutations", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect({ owner_user_id: OTHER_RVP }),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: OTHER_RVP,
    messageText: "si",
    env: canaryExecutionEnv(),
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("8. exact user + env vars absent → zero mutations", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: { RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true" },
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.allowExecution, true);
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("9. exact user + profileConfigured=false → zero mutations", async () => {
  const scheduleCalls = { count: 0 };
  const deps = mockDeps({ scheduleCalls });
  deps.getAppointmentProfile = async () => ({ profileConfigured: false });
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: canaryExecutionEnv(),
    dependencies: deps
  });
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("10. exact user + unconfirmed appointment → zero mutations", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: { dateKey: null, timeKey: null, interviewType: "Zoom" },
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: canaryExecutionEnv(),
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.invoked, false);
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("11. exact user + unsupported action → zero mutations", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      intent: "cancel_request",
      decision: {
        nextAction: "acknowledge_cancel_no_write",
        mayCreateAppointment: false
      },
      entities: { cancellationKind: "cancel" }
    },
    responsePlan: { templateKey: "acknowledge_cancel_no_write" },
    env: canaryExecutionEnv(),
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG
  });
  assert.equal(auth.authorized, false);
});

test("12. exact user + confirmed create + gates CLOSED → zero mutations", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: {
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true"
      // execution gates absent
    },
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.allowExecution, true);
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("13. exact user + confirmed create + gates OPEN → canonical service once", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    inboundMessageId: "inbound-13",
    env: canaryExecutionEnv(),
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.allowExecution, true);
  assert.equal(attempt.usedV2Execution, true);
  assert.equal(scheduleCalls.count, 1);
  assert.equal(attempt.scheduleResult.appointmentId, "appt-1");
});

test("14. duplicate inbound replay → one appointment maximum", async () => {
  const scheduleCalls = { count: 0 };
  const deps = mockDeps({ scheduleCalls });
  const first = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    inboundMessageId: "inbound-14",
    env: canaryExecutionEnv(),
    dependencies: deps
  });
  const second = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    inboundMessageId: "inbound-14",
    env: canaryExecutionEnv(),
    dependencies: deps
  });
  assert.equal(first.usedV2Execution, true);
  assert.equal(second.usedV2Execution, true);
  assert.equal(second.v2Result.execution.idempotent, true);
  assert.equal(scheduleCalls.count, 1);
});

test("15. live CE WhatsApp response is not duplicated from v2", () => {
  const bridge = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveExecutionBridge.js"),
    "utf8"
  );
  const ce = fs.readFileSync(
    path.join(__dirname, "../core/semanticConversationEngine.js"),
    "utf8"
  );
  assert.doesNotMatch(bridge, /sendAndPersistWhatsAppMessage|sendTextMessage/);
  assert.match(ce, /buildPersistedAppointmentConfirmation/);
  assert.match(ce, /attemptLiveV2AppointmentExecution/);
  // After v2 success, CE still builds confirmation copy (single outbound path).
  assert.match(
    ce,
    /usedV2Execution[\s\S]*buildPersistedAppointmentConfirmation/
  );
});

test("16. Calendar write remains downstream of canonical appointment success", () => {
  const executor = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/sideEffectExecutor.js"),
    "utf8"
  );
  const mission = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(executor, /executeScheduleInterview/);
  assert.doesNotMatch(executor, /createCalendarEvent/);
  assert.match(
    mission,
    /scheduleAppointment[\s\S]*createPersistedScheduleAppointment/
  );
});

test("17–20. BR-049/050/080/111 preserved", () => {
  const bridge = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveExecutionBridge.js"),
    "utf8"
  );
  const authorizer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/sideEffectAuthorizer.js"),
    "utf8"
  );
  const ce = fs.readFileSync(
    path.join(__dirname, "../core/semanticConversationEngine.js"),
    "utf8"
  );
  assert.match(bridge, /BR-111|allowExecution/);
  assert.match(bridge, /processRecruitAiV2Turn/);
  assert.doesNotMatch(bridge, /from\("atlas_appointments"\)|claimLead\(/);
  assert.doesNotMatch(authorizer, /role\s*===|isRvp|DIVISION_LEADER/);
  assert.match(ce, /liveExecutionBridge/);
  assert.match(ce, /executeScheduleInterview/);
});

test("21. non-canary users / live path disabled behave as today (bridge skipped)", async () => {
  assert.equal(isLiveExecutionPathEnabled({}), false);
  assert.equal(
    resolveAllowExecutionForLiveTurn({
      env: {},
      invocationSource: "live_ce"
    }),
    false
  );
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: {}, // production posture: live path absent
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.invoked, false);
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("22. execution env on without live cutover eligibility → no execute", async () => {
  assert.equal(
    resolveAllowExecutionForLiveTurn({
      env: canaryExecutionEnv({
        RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
      }),
      invocationSource: "live_ce"
    }),
    false
  );
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: canaryExecutionEnv({
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: undefined
    }),
    dependencies: mockDeps({ scheduleCalls })
  });
  // Without live path flag, bridge does not invoke v2 execution.
  delete attempt.env;
  assert.equal(
    isLiveExecutionPathEnabled(
      canaryExecutionEnv({ RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "" })
    ),
    false
  );
  const closed = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: {
      RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
      RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
      RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP
      // live path absent
    },
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(closed.invoked, false);
  assert.equal(closed.allowExecution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("23. live cutover on without BR-111 env gates → no execute", async () => {
  const scheduleCalls = { count: 0 };
  const attempt = await attemptLiveV2AppointmentExecution({
    prospect: liveProspect(),
    profile: { interviewType: "Zoom" },
    schedulePayload: schedulePayload(),
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    messageText: "si",
    env: { RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true" },
    dependencies: mockDeps({ scheduleCalls })
  });
  assert.equal(attempt.allowExecution, true);
  assert.equal(attempt.invoked, true);
  assert.equal(attempt.usedV2Execution, false);
  assert.equal(scheduleCalls.count, 0);
});

test("live path flag fail-closed for malformed values", () => {
  for (const bad of ["1", "yes", "on", "enabled"]) {
    const cfg = resolveLiveExecutionPathConfig({
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: bad
    });
    assert.equal(cfg.enabled, false, bad);
    assert.equal(cfg.failClosed, true, bad);
  }
  assert.equal(
    resolveLiveExecutionPathConfig({
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true"
    }).enabled,
    true
  );
});

test("docs: BR-112 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-112/);
  assert.ok(
    fs.existsSync(
      path.join(
        __dirname,
        "../../docs/03-engineering/recruit-ai-v2/39_LIVE_EXECUTION_PATH_CUTOVER.md"
      )
    )
  );
});
