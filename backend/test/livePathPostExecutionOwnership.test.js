/**
 * Live-path post-execution ownership regression (canary FAIL: durable stayed proposed + CE confirmation).
 * Ensures V2 create success owns durable confirmed + appointment_confirmed reply.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  processRecruitAiV2Turn,
  applyExecutionOutcomeToReply,
  applyExecutionToContext
} = require("../core/recruitAiV2/orchestrator");
const {
  attemptLiveV2Authoring,
  extractAuthoredReplyText
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  attemptLiveV2AppointmentExecution,
  buildLiveConfirmContext
} = require("../core/recruitAiV2/liveExecutionBridge");
const {
  createContextPersistenceService,
  protectConfirmedAppointmentFromDowngrade
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const { createConversationContext, APPOINTMENT_STATUS, STAGES } = require("../core/recruitAiV2/conversationContext");
const { REASON_CODES, V2_EXECUTABLE_ACTIONS } = require("../core/recruitAiV2/constants");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const CORE = "a257b152-43ea-401f-8de3-783b997013ff";
const LEGACY = "83167302-cd24-4708-b11d-95815aa43568";
const PHONE = "+17867527481";
const DATE = "2026-08-10";
const TIME = "19:30";
const APPT_ID = "11dcc2bd-5958-430d-942a-097be4e58e9c";

function execEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: AGENT,
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: AGENT,
    ...overrides
  };
}

function confirmableContext(overrides = {}) {
  return createConversationContext({
    organizationId: ORG,
    prospectId: CORE,
    prospectPhone: PHONE,
    legacyProspectId: LEGACY,
    agentId: AGENT,
    prospectOwnerUserId: AGENT,
    preferredLanguage: "spanish",
    currentStage: "proposed",
    timezone: "America/New_York",
    knownFacts: {
      name: "Anthony Perez",
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "in_person",
      currentOccupation: null
    },
    appointment: {
      status: "proposed",
      proposedDate: DATE,
      proposedTime: TIME,
      previouslyOfferedSlots: [{ date: DATE, time: TIME, timezone: "America/New_York" }]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText:
        "Gracias. Antes de confirmar, responde SI para confirmar esa hora, o sugiere otra hora."
    },
    ...overrides
  });
}

function memoryPersistence() {
  return createContextPersistenceService({
    repository: createMemoryContextRepository(),
    resolveIdentity: async () => ({
      ok: true,
      coreProspectId: CORE,
      legacyProspectId: LEGACY,
      reasonCode: "OK",
      alternateProspectIds: [LEGACY]
    })
  });
}

function successfulScheduleDeps(appointmentId = APPT_ID) {
  return {
    findActiveAppointmentForProspect: async () => null,
    getSlots: async () => [{ dateKey: DATE, timeKey: TIME }],
    executeScheduleInterview: async () => ({
      success: true,
      appointmentId,
      appointment: {
        id: appointmentId,
        status: "scheduled",
        prospectId: CORE,
        startDateTime: "2026-08-10T23:30:00.000Z",
        timezone: "America/New_York"
      },
      booking: { startTimeISO: "2026-08-10T23:30:00.000Z", dateKey: DATE, timeKey: TIME }
    })
  };
}

test("1–8. live authoring + execution success → durable confirmed + appointment_confirmed + no CE fallthrough", async () => {
  const persistence = memoryPersistence();
  const outbound = [];

  const authoring = await attemptLiveV2Authoring({
    normalized: {
      phone: PHONE,
      text: "Si",
      channel: "whatsapp",
      providerMessageId: "wa-si-1",
      messageType: "text"
    },
    prospect: {
      id: LEGACY,
      phone: PHONE,
      name: "Anthony Perez",
      organization_id: ORG,
      owner_user_id: AGENT
    },
    env: execEnv(),
    persistenceService: persistence,
    processTurn: async (args) =>
      processRecruitAiV2Turn({
        ...args,
        context: confirmableContext(),
        options: {
          ...args.options,
          profileConfigured: true,
          dependencies: successfulScheduleDeps()
        }
      })
  });

  assert.equal(authoring.authored, true);
  assert.equal(authoring.fallThrough, false);
  assert.ok(authoring.v2Result?.execution?.success);
  assert.equal(authoring.v2Result.execution.appointmentId, APPT_ID);
  assert.equal(authoring.v2Result.responsePlan?.templateKey, "appointment_confirmed");
  assert.match(authoring.replyText || "", /confirmada|confirmed/i);
  assert.doesNotMatch(
    authoring.replyText || "",
    /ya está confirmada\. Un agente de Team Vision|already confirmed\. A Team Vision agent/i
  );

  outbound.push(authoring.replyText);
  assert.equal(outbound.length, 1);

  const loaded = await persistence.loadContext({
    organizationId: ORG,
    prospectId: CORE,
    channel: "whatsapp",
    legacyProspectId: LEGACY,
    prospectPhone: PHONE
  });
  assert.ok(loaded);
  assert.equal(loaded.appointment?.status, APPOINTMENT_STATUS.CONFIRMED);
  assert.equal(loaded.appointment?.appointmentId, APPT_ID);
  assert.equal(loaded.appointment?.confirmedDate, DATE);
  assert.equal(loaded.appointment?.confirmedTime, TIME);
  assert.equal(loaded.appointment?.proposedDate, DATE);
  assert.equal(loaded.appointment?.proposedTime, TIME);
  assert.ok(
    loaded.currentStage === STAGES.CONFIRMED ||
      loaded.appointment.status === APPOINTMENT_STATUS.CONFIRMED
  );

  // Later advisory-style save must not downgrade confirmed → proposed.
  const protectedNext = protectConfirmedAppointmentFromDowngrade(loaded, {
    ...loaded,
    appointment: {
      status: "proposed",
      proposedDate: DATE,
      proposedTime: TIME,
      appointmentId: null,
      confirmedDate: null,
      confirmedTime: null
    }
  });
  assert.equal(protectedNext.appointment.status, "confirmed");
  assert.equal(protectedNext.appointment.appointmentId, APPT_ID);

  await persistence.compareAndSaveContext({
    organizationId: ORG,
    prospectId: CORE,
    channel: "whatsapp",
    expectedVersion: loaded._persistence.contextVersion,
    nextContext: {
      ...loaded,
      appointment: {
        status: "proposed",
        proposedDate: DATE,
        proposedTime: TIME,
        appointmentId: null
      }
    },
    inboundMessageId: "advisory-overlap-1",
    decisionCode: "offer_available_slots",
    prospectPhone: PHONE,
    legacyProspectId: LEGACY
  });

  const after = await persistence.loadContext({
    organizationId: ORG,
    prospectId: CORE,
    channel: "whatsapp",
    legacyProspectId: LEGACY,
    prospectPhone: PHONE
  });
  assert.equal(after.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
  assert.equal(after.appointment.appointmentId, APPT_ID);
});

test("9. clean create failure still yields appointment_create_failed", () => {
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: { customerReplyPlan: { templateKey: "ask_explicit_confirmation" } },
    responsePlan: { templateKey: "ask_explicit_confirmation", entities: {} },
    rendered: { text: "confirm?" },
    execution: {
      attempted: true,
      success: false,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED
    }
  });
  assert.equal(applied.responsePlan.templateKey, "appointment_create_failed");
  assert.notEqual(applied.responsePlan.templateKey, "appointment_confirmed");
});

test("10. BR-122 reconciled success persists confirmed + appointment_confirmed", () => {
  const executed = {
    attempted: true,
    success: true,
    appointmentId: APPT_ID,
    reason: REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT,
    reconciledFromCanonicalFailure: true,
    performed: [
      {
        type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
        appointmentId: APPT_ID,
        dateKey: DATE,
        timeKey: TIME,
        timezone: "America/New_York",
        reconciled: true
      }
    ]
  };
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: { customerReplyPlan: {} },
    responsePlan: { templateKey: "ask_explicit_confirmation", entities: {}, language: "spanish" },
    rendered: { text: "x" },
    execution: executed
  });
  assert.equal(applied.responsePlan.templateKey, "appointment_confirmed");

  const next = applyExecutionToContext(confirmableContext(), executed);
  assert.equal(next.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
  assert.equal(next.appointment.appointmentId, APPT_ID);
  assert.equal(next.appointment.confirmedDate, DATE);
  assert.equal(next.appointment.confirmedTime, TIME);
});

test("11. exact-slot idempotent replay retains confirmed", async () => {
  const persistence = memoryPersistence();
  await persistence.createContext({
    organizationId: ORG,
    prospectId: CORE,
    channel: "whatsapp",
    context: applyExecutionToContext(confirmableContext(), {
      success: true,
      appointmentId: APPT_ID,
      performed: [{ dateKey: DATE, timeKey: TIME, timezone: "America/New_York" }]
    }),
    prospectPhone: PHONE,
    legacyProspectId: LEGACY
  });

  const seeded = await persistence.loadContext({
    organizationId: ORG,
    prospectId: CORE,
    channel: "whatsapp",
    legacyProspectId: LEGACY,
    prospectPhone: PHONE
  });
  assert.ok(seeded?._persistence?.contextVersion);

  const result = await processRecruitAiV2Turn({
    message: { text: "Si", id: "wa-si-replay" },
    context: seeded,
    persistenceService: persistence,
    options: {
      channel: "whatsapp",
      allowExecution: true,
      persistContext: true,
      profileConfigured: true,
      env: execEnv(),
      actingUserId: AGENT,
      agentId: AGENT,
      organizationId: ORG,
      prospectPhone: PHONE,
      legacyProspectId: LEGACY,
      inboundMessageId: "wa-si-replay",
      dependencies: {
        findActiveAppointmentForProspect: async () => ({
          id: APPT_ID,
          status: "scheduled",
          organizationId: ORG,
          agentId: AGENT,
          prospectId: CORE,
          startDateTime: "2026-08-10T23:30:00.000Z"
        }),
        getSlots: async () => [{ dateKey: DATE, timeKey: TIME }],
        executeScheduleInterview: async () => {
          throw new Error("must-not-create-again");
        }
      }
    }
  });

  assert.equal(result.execution.success, true);
  assert.equal(result.execution.idempotent, true);
  assert.equal(result.responsePlan.templateKey, "appointment_confirmed");
  assert.equal(result.nextContext.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
  assert.equal(result.nextContext.appointment.appointmentId, APPT_ID);
});

test("12. execution OFF preserves speak-only / no create", async () => {
  const result = await processRecruitAiV2Turn({
    message: { text: "Si", id: "wa-si-off" },
    context: confirmableContext(),
    options: {
      channel: "whatsapp",
      allowExecution: false,
      persistContext: false,
      profileConfigured: true,
      env: execEnv({
        RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
        RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
      }),
      actingUserId: AGENT,
      organizationId: ORG,
      dependencies: {
        executeScheduleInterview: async () => {
          throw new Error("must-not-execute");
        }
      }
    }
  });
  assert.equal(result.execution.attempted, false);
  assert.notEqual(result.responsePlan.templateKey, "appointment_confirmed");
});

test("bridge: successful CE live execution persists confirmed and returns V2 confirmation text", async () => {
  const persistence = memoryPersistence();
  const bridge = await attemptLiveV2AppointmentExecution({
    prospect: {
      id: LEGACY,
      phone: PHONE,
      name: "Anthony",
      organization_id: ORG,
      owner_user_id: AGENT
    },
    profile: { interviewType: "In Person", timezone: "America/New_York" },
    schedulePayload: { dateKey: DATE, timeKey: TIME, interviewType: "In Person" },
    organizationId: ORG,
    agentId: AGENT,
    language: "es",
    messageText: "Si",
    inboundMessageId: "wa-bridge-1",
    env: execEnv(),
    persistenceService: persistence,
    processTurn: async (args) =>
      processRecruitAiV2Turn({
        ...args,
        options: {
          ...args.options,
          profileConfigured: true,
          dependencies: successfulScheduleDeps()
        }
      })
  });

  assert.equal(bridge.usedV2Execution, true);
  assert.equal(bridge.scheduleResult.appointmentId, APPT_ID);
  assert.ok(bridge.confirmationReplyText);
  assert.match(bridge.confirmationReplyText, /confirmada|confirmed/i);
  assert.equal(bridge.v2Result.responsePlan.templateKey, "appointment_confirmed");

  const loaded = await persistence.loadContext({
    organizationId: ORG,
    prospectId: CORE,
    channel: "whatsapp",
    legacyProspectId: LEGACY,
    prospectPhone: PHONE
  });
  assert.equal(loaded.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
  assert.equal(loaded.appointment.appointmentId, APPT_ID);
});

test("helpers: empty CE copy rejected vs V2 confirmation", () => {
  const ceCopy =
    "✅ Tu entrevista ya está confirmada. Un agente de Team Vision se comunicará contigo si es necesario realizar algún ajuste.";
  const v2Copy = renderCustomerReply({
    templateKey: "appointment_confirmed",
    language: "spanish",
    entities: { dateLabel: DATE, requestedTime: TIME }
  }).text;
  assert.notEqual(v2Copy, ceCopy);
  assert.equal(extractAuthoredReplyText({ rendered: { text: v2Copy } }), v2Copy);
  assert.ok(buildLiveConfirmContext({
    prospect: { id: LEGACY, phone: PHONE },
    schedulePayload: { dateKey: DATE, timeKey: TIME, interviewType: "In Person" },
    organizationId: ORG,
    agentId: AGENT,
    language: "es"
  }).appointment.status === "proposed");
});
