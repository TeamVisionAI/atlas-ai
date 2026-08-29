/**
 * BR-171 — WhatsApp natural-language appointment rescheduling.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  looksLikeRescheduleRequest,
  looksLikeHumanOwnedRescheduleAttention,
  HUMAN_ATTENTION_RESCHEDULE_REASON
} = require("../core/recruitAiV2/rescheduleRequestFacts");
const {
  decideConversationTurn,
  isExistingAppointmentReschedule
} = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const {
  shouldAttemptAvailabilityOffer
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { executeAuthorizedSideEffects } = require("../core/recruitAiV2/sideEffectExecutor");
const { applyExecutionOutcomeToReply } = require("../core/recruitAiV2/orchestrator");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { computeAllowHandoffAck } = require("../core/communicationHub");
const { applyInboundAttentionUpdate } = require("../core/whatsappInboundPipeline");
const newLeadAttentionEngine = require("../core/newLeadAttentionEngine");
const { INTENTS, NEXT_ACTIONS, V2_EXECUTABLE_ACTIONS } = require("../core/recruitAiV2/constants");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const EXISTING_APPOINTMENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const PROSPECT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const FIXED_NOW = new Date("2026-08-29T16:20:00.000-04:00");
const MONDAY_ISO = "2026-08-31";

const PHRASES = [
  "Se podría reprogramar para el lunes",
  "Necesito reprogramarla",
  "No podré asistir, podemos cambiarla para el lunes?",
  "Can we move my interview to Monday?"
];

function scheduledContext(overrides = {}) {
  return createConversationContext({
    organizationId: TEAM_VISION_ORG,
    prospectId: PROSPECT_ID,
    agentId: PRIMARY_RVP,
    prospectPhone: "+17855551234",
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "confirmed",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredMeetingType: "zoom",
      coverage: "LOCAL"
    },
    appointment: {
      status: "scheduled",
      appointmentId: EXISTING_APPOINTMENT_ID,
      proposedDate: "2026-08-29",
      proposedTime: "17:00",
      confirmedDate: "2026-08-29",
      confirmedTime: "17:00",
      meetingType: "zoom",
      previouslyOfferedSlots: []
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText: "Tu entrevista quedó confirmada para el sábado a las 5:00 PM."
    },
    ...overrides
  });
}

function interpret(text, context = scheduledContext()) {
  return interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
}

function mondaySlots() {
  return [
    { date: MONDAY_ISO, dateKey: MONDAY_ISO, time: "10:00", timeKey: "10:00", timezone: "America/New_York" },
    { date: MONDAY_ISO, dateKey: MONDAY_ISO, time: "14:00", timeKey: "14:00", timezone: "America/New_York" }
  ];
}

function canaryEnv() {
  return {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP
  };
}

test("BR-171 phrases classify as reschedule_request, not create/date-only booking", () => {
  for (const phrase of PHRASES) {
    const interpretation = interpret(phrase);
    assert.equal(
      interpretation.intent,
      INTENTS.RESCHEDULE_REQUEST,
      phrase
    );
    assert.equal(looksLikeRescheduleRequest(phrase, scheduledContext()), true, phrase);
  }
});

test("BR-171 date-bearing phrases keep a concrete Monday resolution", () => {
  for (const phrase of [
    "Se podría reprogramar para el lunes",
    "No podré asistir, podemos cambiarla para el lunes?",
    "Can we move my interview to Monday?"
  ]) {
    const interpretation = interpret(phrase);
    assert.equal(interpretation.entities?.resolvedDate?.isoDate, MONDAY_ISO, phrase);
  }
  const noDate = interpret("Necesito reprogramarla");
  assert.equal(noDate.intent, INTENTS.RESCHEDULE_REQUEST);
  assert.equal(noDate.entities?.resolvedDate?.isoDate || null, null);
});

test("BR-171 date-only reschedule loads availability instead of creating", () => {
  const interpretation = interpret("Se podría reprogramar para el lunes");
  const context = scheduledContext();
  assert.equal(
    shouldAttemptAvailabilityOffer({ context, interpretation }),
    true
  );

  const structured = decideConversationTurn({
    context,
    interpretation,
    availability: {
      checked: true,
      status: "available",
      requestedSlotAvailable: false,
      nearestAlternatives: mondaySlots(),
      providerFailure: false
    }
  });

  assert.equal(structured.decision.nextAction, NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS);
  assert.equal(structured.decision.mayCreateAppointment, false);
  assert.equal(structured.decision.mayRescheduleAppointment, false);
  assert.equal(
    structured.contextPatch.appointment.status,
    "reschedule_requested"
  );
  assert.equal(
    structured.contextPatch.appointment.appointmentId,
    EXISTING_APPOINTMENT_ID
  );
  assert.equal(structured.customerReplyPlan.templateKey, "offer_available_slots");
});

test("BR-171 date-less reprogramarla asks for a day instead of booking", () => {
  const structured = decideConversationTurn({
    context: scheduledContext(),
    interpretation: interpret("Necesito reprogramarla")
  });
  assert.equal(structured.decision.nextAction, NEXT_ACTIONS.OFFER_RESCHEDULE_FLOW);
  assert.equal(structured.decision.mayCreateAppointment, false);
  assert.equal(structured.contextPatch.appointment.appointmentId, EXISTING_APPOINTMENT_ID);
});

test("BR-171 confirmed slot selection proposes canonical reschedule of the same id", () => {
  const context = scheduledContext({
    currentStage: "rescheduling",
    appointment: {
      status: "reschedule_requested",
      appointmentId: EXISTING_APPOINTMENT_ID,
      proposedDate: MONDAY_ISO,
      proposedTime: "10:00",
      previouslyOfferedSlots: mondaySlots()
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText: "Tengo disponible el lunes a las 10:00 AM. ¿Te funciona?"
    }
  });
  assert.equal(isExistingAppointmentReschedule(context), true);

  const interpretation = interpretInboundMessage({
    message: { text: "Sí" },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structured = decideConversationTurn({ context, interpretation });
  assert.equal(structured.decision.nextAction, NEXT_ACTIONS.RESCHEDULE_APPOINTMENT);
  assert.equal(structured.decision.mayCreateAppointment, false);
  assert.equal(structured.decision.mayRescheduleAppointment, true);
  assert.equal(
    structured.contextPatch.appointment.appointmentId,
    EXISTING_APPOINTMENT_ID
  );
  assert.ok(structured.reasonCodes.includes("APPOINTMENT_RESCHEDULE_PROPOSED"));
  assert.ok(!structured.reasonCodes.includes("APPOINTMENT_CREATE_PROPOSED"));
});

test("BR-171 authorizer allows reschedule only with explicit mayReschedule", () => {
  const allowed = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT,
        mayCreateAppointment: false,
        mayRescheduleAppointment: true
      }
    },
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: canaryEnv(),
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG,
    context: scheduledContext()
  });
  assert.equal(allowed.authorized, true);
  assert.ok(
    allowed.proposals.some(
      (p) => p.type === V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT && p.authorized
    )
  );

  const blocked = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT,
        mayCreateAppointment: false,
        mayRescheduleAppointment: false
      }
    },
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: canaryEnv(),
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG,
    context: scheduledContext()
  });
  assert.equal(blocked.authorized, false);
});

test("BR-171 executor updates the same appointment and never creates a duplicate", async () => {
  const createCalls = [];
  const rescheduleCalls = [];
  const existing = {
    id: EXISTING_APPOINTMENT_ID,
    organizationId: TEAM_VISION_ORG,
    organization_id: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    status: "scheduled",
    confirmationStatus: "missing_email",
    reminderStatus: "pending",
    startDateTime: "2026-08-29T21:00:00.000Z",
    calendarEventId: "cal-existing-1",
    prospectId: PROSPECT_ID
  };

  const result = await executeAuthorizedSideEffects({
    authorization: {
      authorized: true,
      organizationId: TEAM_VISION_ORG,
      actingUserId: PRIMARY_RVP,
      proposals: [
        { type: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT, authorized: true }
      ]
    },
    structuredDecision: {
      decision: {
        nextAction: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT,
        mayRescheduleAppointment: true,
        mayCreateAppointment: false
      },
      customerReplyPlan: {
        entities: { requestedDate: MONDAY_ISO, requestedTime: "10:00" }
      }
    },
    context: scheduledContext({
      appointment: {
        status: "reschedule_requested",
        appointmentId: EXISTING_APPOINTMENT_ID,
        proposedDate: MONDAY_ISO,
        proposedTime: "10:00",
        previouslyOfferedSlots: mondaySlots()
      }
    }),
    options: { prospectId: PROSPECT_ID },
    dependencies: {
      findAppointmentById: async () => existing,
      executeScheduleInterview: async (...args) => {
        createCalls.push(args);
        throw new Error("must_not_create");
      },
      rescheduleAppointment: async (id, input, ctx) => {
        rescheduleCalls.push({ id, input, ctx });
        return {
          id,
          calendarEventId: "cal-existing-1",
          confirmationStatus: "missing_email",
          reminderStatus: "scheduled"
        };
      }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.appointmentId, EXISTING_APPOINTMENT_ID);
  assert.equal(createCalls.length, 0);
  assert.equal(rescheduleCalls.length, 1);
  assert.equal(rescheduleCalls[0].id, EXISTING_APPOINTMENT_ID);
  assert.equal(rescheduleCalls[0].input.dateKey, MONDAY_ISO);
  assert.equal(rescheduleCalls[0].input.timeKey, "10:00");
  assert.equal(rescheduleCalls[0].input.reason, "prospect_requested");
  assert.equal(rescheduleCalls[0].ctx.organizationId, TEAM_VISION_ORG);
  assert.equal(result.performed[0].calendarEventId, "cal-existing-1");

  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: { nextAction: "reschedule_appointment" },
      customerReplyPlan: { language: "spanish", entities: {} }
    },
    responsePlan: { language: "spanish", entities: {} },
    rendered: { text: "" },
    execution: result
  });
  assert.equal(applied.responsePlan.templateKey, "appointment_rescheduled");
  assert.match(applied.rendered.text, /reprogramada/);
});

test("BR-171 fail closed on ambiguous active appointment match", async () => {
  const result = await executeAuthorizedSideEffects({
    authorization: {
      authorized: true,
      organizationId: TEAM_VISION_ORG,
      actingUserId: PRIMARY_RVP,
      proposals: [
        { type: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT, authorized: true }
      ]
    },
    structuredDecision: {
      decision: {
        nextAction: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT,
        mayRescheduleAppointment: true
      },
      customerReplyPlan: {
        entities: { requestedDate: MONDAY_ISO, requestedTime: "10:00" }
      }
    },
    context: scheduledContext({
      appointment: {
        status: "reschedule_requested",
        appointmentId: null,
        proposedDate: MONDAY_ISO,
        proposedTime: "10:00"
      }
    }),
    dependencies: {
      listActiveAppointmentsForProspect: async () => [
        { id: "appt-a", status: "scheduled", organizationId: TEAM_VISION_ORG },
        { id: "appt-b", status: "scheduled", organizationId: TEAM_VISION_ORG }
      ],
      rescheduleAppointment: async () => {
        throw new Error("must_not_reschedule_ambiguous");
      }
    }
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "EXECUTION_AMBIGUOUS_APPOINTMENT");
});

test("BR-171 fail closed when canonical reschedule throws", async () => {
  const result = await executeAuthorizedSideEffects({
    authorization: {
      authorized: true,
      organizationId: TEAM_VISION_ORG,
      actingUserId: PRIMARY_RVP,
      proposals: [
        { type: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT, authorized: true }
      ]
    },
    structuredDecision: {
      decision: {
        nextAction: V2_EXECUTABLE_ACTIONS.RESCHEDULE_APPOINTMENT,
        mayRescheduleAppointment: true
      },
      customerReplyPlan: {
        entities: { requestedDate: MONDAY_ISO, requestedTime: "10:00" }
      }
    },
    context: scheduledContext({
      appointment: {
        status: "reschedule_requested",
        appointmentId: EXISTING_APPOINTMENT_ID,
        proposedDate: MONDAY_ISO,
        proposedTime: "10:00"
      }
    }),
    dependencies: {
      findAppointmentById: async () => ({
        id: EXISTING_APPOINTMENT_ID,
        organizationId: TEAM_VISION_ORG,
        prospectId: PROSPECT_ID,
        status: "scheduled",
        startDateTime: "2026-08-29T21:00:00.000Z"
      }),
      rescheduleAppointment: async () => {
        const error = new Error("Selected slot is no longer available.");
        error.code = "UNAVAILABLE";
        throw error;
      }
    }
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "EXECUTION_CANONICAL_FAILED");
});

test("BR-171 TAKE OVER stays silent and does not auto-return, but surfaces human attention", async () => {
  assert.equal(
    computeAllowHandoffAck({
      source: "recruit_ai_v2_live_authoring",
      nextAction: NEXT_ACTIONS.RESCHEDULE_APPOINTMENT
    }),
    false
  );
  assert.equal(
    computeAllowHandoffAck({
      source: "recruit_ai_v2_live_authoring",
      nextAction: NEXT_ACTIONS.OFFER_RESCHEDULE_FLOW
    }),
    false
  );

  for (const phrase of PHRASES) {
    assert.equal(looksLikeHumanOwnedRescheduleAttention(phrase), true, phrase);
  }
  assert.equal(
    looksLikeHumanOwnedRescheduleAttention("Perdón tengo un compromiso y no podré asistir"),
    true
  );

  const marked = [];
  const original = newLeadAttentionEngine.markHumanAttentionRequired;
  newLeadAttentionEngine.markHumanAttentionRequired = async (prospect, reason) => {
    marked.push({ prospectId: prospect.id, reason });
    return {
      ...prospect,
      attention_status: "human_required",
      human_attention_reason: reason
    };
  };
  try {
    await applyInboundAttentionUpdate(
      {
        id: PROSPECT_ID,
        phone: "+17855551234",
        organization_id: TEAM_VISION_ORG
      },
      { success: true, replied: false, reason: "REPLY_SUPPRESSED" },
      "Hola necesito reprogramarla"
    );
  } finally {
    newLeadAttentionEngine.markHumanAttentionRequired = original;
  }

  assert.equal(marked.length, 1);
  assert.equal(marked[0].reason, HUMAN_ATTENTION_RESCHEDULE_REASON);
  assert.equal(HUMAN_ATTENTION_RESCHEDULE_REASON, "appointment_reschedule_requested");
});

test("BR-171 Return to Atlas continues the reschedule offer flow", () => {
  const interpretation = interpret("Se podría reprogramar para el lunes");
  const structured = decideConversationTurn({
    context: scheduledContext(),
    interpretation,
    availability: {
      checked: true,
      status: "available",
      nearestAlternatives: mondaySlots(),
      providerFailure: false
    }
  });
  assert.notEqual(structured.decision.nextAction, NEXT_ACTIONS.CREATE_APPOINTMENT);
  assert.equal(structured.decision.mayCreateAppointment, false);
  const rendered = renderCustomerReply(structured.customerReplyPlan);
  assert.ok(rendered.text);
  assert.doesNotMatch(rendered.text, /confirmada para el sábado/i);
});

test("BR-171 does not special-case a production phone or appointment id", () => {
  const files = [
    "backend/core/recruitAiV2/rescheduleRequestFacts.js",
    "backend/core/recruitAiV2/interpreter.js",
    "backend/core/recruitAiV2/decisionEngine.js",
    "backend/core/recruitAiV2/sideEffectExecutor.js",
    "backend/core/whatsappInboundPipeline.js"
  ];
  const root = path.join(__dirname, "../..");
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.doesNotMatch(src, /2689|Montilla|e48b9c1b|7720c40c/i, rel);
  }
});
