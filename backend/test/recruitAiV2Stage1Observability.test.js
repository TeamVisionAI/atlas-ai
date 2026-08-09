/**
 * Stage-1 Recruit AI v2 observability — telemetry only.
 * Asserts event emission; does not exercise live WhatsApp/Calendar mutations.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EVENTS,
  emitRecruitAiV2Signal,
  buildEnvelope
} = require("../core/recruitAiV2/stage1Observability");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { V2_EXECUTABLE_ACTIONS, REASON_CODES } = require("../core/recruitAiV2/constants");
const {
  reclaimOwnershipAfterAuthoringLoss
} = require("../core/recruitAiV2/liveAuthoringBridge");
const { APPOINTMENT_STATUS } = require("../core/recruitAiV2/conversationContext");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const CORE = "3a017152-2799-4f53-b0e8-cb3fd2992ea7";
const PHONE = "+17867198753";

function captureLogger() {
  const stages = [];
  return {
    stages,
    logStage(stage, details = {}) {
      stages.push({ stage, details: { ...details } });
    }
  };
}

function authCreate() {
  return {
    authorized: true,
    organizationId: ORG,
    actingUserId: AGENT,
    denyReasons: [],
    proposals: [
      {
        type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
        authorized: true,
        reason: REASON_CODES.EXECUTION_AUTHORIZED
      }
    ]
  };
}

function baseContext(overrides = {}) {
  return {
    organizationId: ORG,
    prospectId: CORE,
    prospectPhone: PHONE,
    timezone: "America/New_York",
    knownFacts: { preferredMeetingType: "in_person" },
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      proposedDate: "2026-08-10",
      proposedTime: "13:00",
      ...(overrides.appointment || {})
    },
    ...overrides
  };
}

test("1. create attempted emits correct event", async () => {
  const { stages, logStage } = captureLogger();
  const orig = console.log;
  console.log = (line) => {
    try {
      const parsed = JSON.parse(line);
      stages.push({ stage: parsed.stage, details: parsed });
    } catch {
      /* ignore */
    }
  };

  await executeAuthorizedSideEffects({
    authorization: authCreate(),
    structuredDecision: {
      decision: { nextAction: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT }
    },
    context: baseContext(),
    options: { inboundMessageId: "wamid.test.1" },
    dependencies: {
      findActiveAppointmentForProspect: async () => null,
      getSlots: async () => ({
        slots: [{ date: "2026-08-10", time: "13:00" }]
      }),
      executeScheduleInterview: async () => {
        throw new Error("stop_after_attempt");
      }
    }
  });

  console.log = orig;
  const attempted = stages.find(
    (s) => s.stage === EVENTS.CREATE_ATTEMPTED
  );
  assert.ok(attempted);
  assert.equal(attempted.details.organizationId, ORG);
  assert.equal(attempted.details.agentId, AGENT);
  assert.equal(attempted.details.prospectId, CORE);
  assert.equal(attempted.details.decisionCode, "create_appointment");
});

test("2. create success emits one succeeded with appointment/core ids", async () => {
  const stages = [];
  const orig = console.log;
  console.log = (line) => {
    try {
      const parsed = JSON.parse(line);
      stages.push(parsed);
    } catch {
      /* ignore */
    }
  };

  const result = await executeAuthorizedSideEffects({
    authorization: authCreate(),
    structuredDecision: {
      decision: { nextAction: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT }
    },
    context: baseContext(),
    options: { inboundMessageId: "wamid.test.2" },
    dependencies: {
      findActiveAppointmentForProspect: async () => null,
      getSlots: async () => ({
        slots: [{ date: "2026-08-10", time: "13:00" }]
      }),
      executeScheduleInterview: async () => ({
        success: true,
        appointmentId: "appt-success-1",
        booking: { googleCalendarEventId: "cal-success-1" },
        googleCalendarEventId: "cal-success-1"
      })
    }
  });

  console.log = orig;
  assert.equal(result.success, true);
  const succeeded = stages.filter((s) => s.stage === EVENTS.CREATE_SUCCEEDED);
  assert.equal(succeeded.length, 1);
  assert.equal(succeeded[0].appointmentId, "appt-success-1");
  assert.equal(succeeded[0].prospectId, CORE);
  assert.equal(succeeded[0].calendarEventId, "cal-success-1");
});

test("3. create failure emits failed with deterministic reason", async () => {
  const stages = [];
  const orig = console.log;
  console.log = (line) => {
    try {
      stages.push(JSON.parse(line));
    } catch {
      /* ignore */
    }
  };

  const result = await executeAuthorizedSideEffects({
    authorization: authCreate(),
    structuredDecision: {
      decision: { nextAction: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT }
    },
    context: baseContext(),
    options: {},
    dependencies: {
      findActiveAppointmentForProspect: async () => null,
      getSlots: async () => ({ slots: [] }),
      executeScheduleInterview: async () => ({ success: false })
    }
  });

  console.log = orig;
  assert.equal(result.success, false);
  const failed = stages.find((s) => s.stage === EVENTS.CREATE_FAILED);
  assert.ok(failed);
  assert.ok(failed.reasonCodes.includes(REASON_CODES.EXECUTION_SLOT_STALE));
});

test("4–6. mission rollback / calendar signals emit via helper contract", () => {
  const { stages, logStage } = captureLogger();
  emitRecruitAiV2Signal(
    EVENTS.SCHEDULE_WORKFLOW_ROLLBACK,
    {
      organizationId: ORG,
      appointmentId: "a1",
      reasonCodes: ["schedule_workflow_rollback"],
      phase: "workflow_advance",
      outcome: "rollback"
    },
    { logStage }
  );
  emitRecruitAiV2Signal(
    EVENTS.CALENDAR_CREATE_FAILED,
    {
      organizationId: ORG,
      reasonCodes: ["CALENDAR_FAILED"],
      outcome: "failure"
    },
    { logStage }
  );
  emitRecruitAiV2Signal(
    EVENTS.CALENDAR_ROLLBACK_FAILED,
    {
      organizationId: ORG,
      reasonCodes: ["CALENDAR_ROLLBACK_FAILED"],
      outcome: "failure"
    },
    { logStage }
  );
  assert.deepEqual(
    stages.map((s) => s.stage),
    [
      EVENTS.SCHEDULE_WORKFLOW_ROLLBACK,
      EVENTS.CALENDAR_CREATE_FAILED,
      EVENTS.CALENDAR_ROLLBACK_FAILED
    ]
  );
});

test("7. BR-125 reclaim attempted/succeeded/failed are distinguishable", async () => {
  const { stages, logStage } = captureLogger();

  const ok = await reclaimOwnershipAfterAuthoringLoss({
    v2Result: {
      execution: {
        success: true,
        appointmentId: "appt-reclaim-1",
        performed: [{ dateKey: "2026-08-10", timeKey: "13:00" }]
      },
      nextContext: {
        prospectId: CORE,
        preferredLanguage: "spanish",
        appointment: {
          status: APPOINTMENT_STATUS.PROPOSED,
          proposedDate: "2026-08-10",
          proposedTime: "13:00"
        }
      },
      rendered: { text: "Perfecto — confirmada." }
    },
    prospect: { phone: PHONE, id: "legacy", owner_user_id: AGENT },
    normalized: { phone: PHONE, providerMessageId: "wamid.r1" },
    organizationId: ORG,
    actingUserId: AGENT,
    allowExecution: true,
    logStage
  });
  assert.equal(ok.authored, true);
  assert.ok(stages.some((s) => s.stage === EVENTS.BR125_RECLAIM_ATTEMPTED));
  assert.ok(stages.some((s) => s.stage === EVENTS.BR125_RECLAIM_SUCCEEDED));

  const stagesFail = [];
  const fail = await reclaimOwnershipAfterAuthoringLoss({
    v2Result: null,
    prospect: { phone: PHONE },
    normalized: { phone: PHONE },
    organizationId: ORG,
    actingUserId: AGENT,
    findActiveAppointment: async () => null,
    logStage(stage, details) {
      stagesFail.push({ stage, details });
    }
  });
  assert.equal(fail, null);
  assert.ok(stagesFail.some((s) => s.stage === EVENTS.BR125_RECLAIM_ATTEMPTED));
  assert.ok(stagesFail.some((s) => s.stage === EVENTS.BR125_RECLAIM_FAILED));
});

test("8. exact-slot conflict emits appointment duplicate signal", async () => {
  const stages = [];
  const orig = console.log;
  console.log = (line) => {
    try {
      stages.push(JSON.parse(line));
    } catch {
      /* ignore */
    }
  };

  await executeAuthorizedSideEffects({
    authorization: authCreate(),
    structuredDecision: {
      decision: { nextAction: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT }
    },
    context: baseContext(),
    options: {},
    dependencies: {
      findActiveAppointmentForProspect: async () => ({
        id: "other-slot-appt",
        organization_id: ORG,
        prospect_id: CORE,
        agent_id: AGENT,
        status: "scheduled",
        start_date_time: "2026-08-11T17:00:00.000Z",
        timezone: "America/New_York"
      }),
      getSlots: async () => ({ slots: [] }),
      executeScheduleInterview: async () => ({ success: false })
    }
  });

  console.log = orig;
  assert.ok(stages.some((s) => s.stage === EVENTS.DUPLICATE_APPOINTMENT));
  assert.ok(stages.some((s) => s.stage === EVENTS.CREATE_FAILED));
});

test("9. durable↔appointment mismatch signals are read-only", async () => {
  const { stages, logStage } = captureLogger();
  await reclaimOwnershipAfterAuthoringLoss({
    v2Result: {
      nextContext: {
        prospectId: CORE,
        appointment: {
          status: APPOINTMENT_STATUS.CONFIRMED,
          appointmentId: "missing-active",
          proposedDate: "2026-08-10",
          proposedTime: "13:00",
          confirmedDate: "2026-08-10",
          confirmedTime: "13:00"
        }
      }
    },
    prospect: { phone: PHONE, owner_user_id: AGENT },
    normalized: { phone: PHONE },
    organizationId: ORG,
    actingUserId: AGENT,
    findActiveAppointment: async () => null,
    logStage
  });
  assert.ok(
    stages.some((s) => s.stage === EVENTS.MISMATCH_DURABLE_CONFIRMED_NO_ACTIVE)
  );

  const stages2 = [];
  await reclaimOwnershipAfterAuthoringLoss({
    v2Result: {
      nextContext: {
        prospectId: CORE,
        appointment: {
          status: APPOINTMENT_STATUS.PROPOSED,
          proposedDate: "2026-08-10",
          proposedTime: "13:00"
        }
      }
    },
    prospect: { phone: PHONE, owner_user_id: AGENT },
    normalized: { phone: PHONE },
    organizationId: ORG,
    actingUserId: AGENT,
    findActiveAppointment: async () => ({
      id: "active-1",
      organization_id: ORG,
      prospect_id: CORE,
      interviewer_user_id: AGENT,
      status: "scheduled",
      start_date_time: "2026-08-10T17:00:00.000Z",
      timezone: "America/New_York",
      calendar_event_id: "cal-1"
    }),
    logStage(stage, details) {
      stages2.push({ stage, details });
    }
  });
  assert.ok(
    stages2.some((s) => s.stage === EVENTS.MISMATCH_ACTIVE_UNCONFIRMED_DURABLE)
  );
});

test("10–12. V2 reply metadata owner=v2; CE distinguishable; intent may remain CE", async () => {
  const stages = [];
  const hub = require("../core/communicationHub");
  const pipeline = require("../core/whatsappOutboundPipeline");
  const origSend = pipeline.sendAndPersistWhatsAppMessage;
  pipeline.sendAndPersistWhatsAppMessage = async () => ({
    success: true,
    simulated: true,
    providerMessageId: "out-1"
  });
  const origConsole = console.log;
  console.log = (line) => {
    try {
      stages.push(JSON.parse(line));
    } catch {
      /* ignore */
    }
  };

  // Use a phone absent from local workflow state so delivery is not suppressed.
  const testPhone = "+19995550123";

  const v2 = await hub.deliverWhatsAppReply({
    normalized: { phone: testPhone, providerMessageId: "in-1" },
    prospect: {
      organization_id: ORG,
      owner_user_id: AGENT,
      phone: testPhone,
      current_step: "SCHEDULE"
    },
    replyText:
      "Perfecto — tu entrevista quedó confirmada para el 2026-08-10 a las 1:00 PM.",
    engineResult: {
      source: "recruit_ai_v2_live_authoring",
      owner: "v2",
      nextAction: "create_appointment",
      v2Result: {
        execution: { appointmentId: "appt-1", success: true },
        responsePlan: { templateKey: "appointment_confirmed" },
        nextContext: { prospectId: CORE }
      }
    },
    outboundIntent: "CONVERSATION_ENGINE_REPLY"
  });
  assert.equal(v2.replied, true);

  await hub.deliverWhatsAppReply({
    normalized: { phone: testPhone },
    prospect: {
      organization_id: ORG,
      phone: testPhone,
      current_step: "SCHEDULE"
    },
    replyText: "Hola",
    engineResult: { source: "legacy_ce" },
    outboundIntent: "CONVERSATION_ENGINE_REPLY"
  });

  console.log = origConsole;
  pipeline.sendAndPersistWhatsAppMessage = origSend;

  const sent = stages.filter((s) => s.stage === "conversation_engine_reply_sent");
  assert.ok(sent.length >= 2);
  assert.equal(sent[0].owner, "v2");
  assert.equal(sent[0].intent, "CONVERSATION_ENGINE_REPLY");
  assert.equal(sent[0].replyType, "appointment_confirmed");
  assert.equal(sent[1].owner, "ce");

  const delivered = stages.filter((s) => s.stage === EVENTS.REPLY_DELIVERED);
  assert.equal(delivered[0].owner, "v2");
  assert.equal(delivered[0].appointmentId, "appt-1");
  assert.equal(delivered[1].owner, "ce");
});

test("13–15. authz denied / gate disabled / unsupported mutation events", () => {
  const { stages, logStage } = captureLogger();
  emitRecruitAiV2Signal(
    EVENTS.EXECUTION_AUTHZ_DENIED,
    {
      organizationId: ORG,
      agentId: AGENT,
      reasonCodes: ["EXECUTION_USER_NOT_ALLOWLISTED"],
      outcome: "authz_denied"
    },
    { logStage }
  );
  emitRecruitAiV2Signal(
    EVENTS.EXECUTION_GATE_DISABLED,
    {
      organizationId: ORG,
      agentId: AGENT,
      reasonCodes: ["ALLOW_EXECUTION_FALSE_OR_LIVE_PATH_OFF"],
      outcome: "gate_disabled"
    },
    { logStage }
  );
  emitRecruitAiV2Signal(
    EVENTS.EXECUTION_UNSUPPORTED_MUTATION,
    {
      organizationId: ORG,
      action: "send_whatsapp_reply",
      reasonCodes: ["EXECUTION_UNSUPPORTED_ACTION"],
      outcome: "unsupported"
    },
    { logStage }
  );
  assert.equal(stages[0].stage, EVENTS.EXECUTION_AUTHZ_DENIED);
  assert.equal(stages[1].stage, EVENTS.EXECUTION_GATE_DISABLED);
  assert.notEqual(stages[0].stage, stages[1].stage);
  assert.equal(stages[2].details.action, "send_whatsapp_reply");
});

test("16. telemetry helper exceptions do not affect runtime", () => {
  const ok = emitRecruitAiV2Signal(EVENTS.CREATE_ATTEMPTED, {}, {
    logStage() {
      throw new Error("logger_boom");
    }
  });
  assert.equal(ok, false);
  assert.equal(emitRecruitAiV2Signal(null, {}), false);
});

test("17. envelope always includes required keys", () => {
  const env = buildEnvelope({
    event: EVENTS.CREATE_SUCCEEDED,
    organizationId: ORG,
    appointmentId: "a"
  });
  for (const key of [
    "organizationId",
    "agentId",
    "prospectId",
    "phone",
    "decisionCode",
    "reasonCodes",
    "appointmentId",
    "calendarEventId",
    "correlationId",
    "outcome"
  ]) {
    assert.ok(key in env);
  }
  assert.deepEqual(env.reasonCodes, []);
});

test("18. calendar duplicate event is intentionally omitted from EVENTS export surface check", () => {
  assert.equal(
    Object.values(EVENTS).includes("recruit_ai_v2.duplicate.calendar_detected"),
    false
  );
});
