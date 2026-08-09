/**
 * BR-126 — Deferred create remains confirmable; second "Si" must not CE-hijack.
 * Exact production sequence: slot confirm → Si exec OFF (deferred) → Si exec ON.
 */
"use strict";

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  processRecruitAiV2Turn
} = require("../core/recruitAiV2/orchestrator");
const {
  ownConfirmableProposalAfterAuthoringLoss,
  isConfirmableProposedDurable
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const {
  createConversationContext,
  APPOINTMENT_STATUS
} = require("../core/recruitAiV2/conversationContext");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const CORE = "6a52ef58-511e-4a25-9f81-b5ea211a51be";
const LEGACY = "cc539cb3-1bfd-4329-8ddb-e3b74bf75c33";
const PHONE = "+17863071530";
const DATE = "2026-08-10";
const TIME = "13:00";
const APPT_ID = "appt-br126-001";

function proposedAfterSlotSelect() {
  return createConversationContext({
    organizationId: ORG,
    prospectId: CORE,
    prospectPhone: PHONE,
    legacyProspectId: LEGACY,
    agentId: AGENT,
    preferredLanguage: "spanish",
    currentStage: "proposed",
    timezone: "America/New_York",
    knownFacts: {
      name: "Marielena Campo",
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredDayPart: "afternoon",
      preferredMeetingType: "in_person"
    },
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      proposedDate: DATE,
      proposedTime: TIME,
      appointmentId: null,
      previouslyOfferedSlots: [
        { date: "2026-08-09", time: "13:00", timezone: "America/New_York" },
        { date: DATE, time: TIME, timezone: "America/New_York" }
      ]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastProspectIntent: "select_offered_slot",
      lastOfferMade: "ask_confirm_slot",
      lastAtlasOutboundText:
        "Gracias. Antes de confirmar, responde SI para confirmar esa hora, o sugiere otra hora.",
      clarificationCount: 0,
      pendingClarification: null
    }
  });
}

function authoringEnv(executionOn, overrides = {}) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: AGENT,
    RECRUIT_AI_V2_EXECUTION_ENABLED: executionOn ? "true" : "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: executionOn ? "true" : "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: AGENT,
    ...overrides
  };
}

describe("BR-126 deferred confirm resumability", () => {
  test("docs: BR-126 documented", () => {
    const rules = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(rules, /## BR-126/);
    assert.match(rules, /Deferred Create Remains Confirmable/);
  });

  test("bare Si is not a city token", () => {
    assert.equal(parseLocationAnswer("Si"), null);
    assert.equal(parseLocationAnswer("Yes"), null);
  });

  test("Turn2: Si execution OFF → deferred, no mutation, durable resumable", async () => {
    const persistence = createContextPersistenceService({
      repository: createMemoryContextRepository()
    });
    await persistence.compareAndSaveContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      nextContext: proposedAfterSlotSelect(),
      decisionCode: "propose_slot"
    });

    let createCalls = 0;
    const result = await processRecruitAiV2Turn({
      message: { text: "Si" },
      contextInput: {
        organizationId: ORG,
        prospectId: CORE,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY
      },
      persistenceService: persistence,
      options: {
        channel: "whatsapp",
        allowExecution: false,
        persistContext: true,
        env: authoringEnv(false),
        actingUserId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY,
        dependencies: {
          executeScheduleInterview: async () => {
            createCalls += 1;
            throw new Error("must not mutate");
          }
        }
      }
    });

    assert.equal(createCalls, 0);
    assert.equal(
      result.structuredDecision?.decision?.nextAction,
      "create_appointment"
    );
    assert.equal(result.responsePlan?.templateKey, "appointment_confirm_deferred");
    assert.match(String(result.rendered?.text || ""), /anoté tu confirmación|noted your confirmation/i);
    assert.equal(result.nextContext.appointment.status, APPOINTMENT_STATUS.PROPOSED);
    assert.equal(result.nextContext.appointment.proposedDate, DATE);
    assert.equal(result.nextContext.appointment.proposedTime, TIME);
    assert.equal(result.nextContext.appointment.appointmentId, null);
    assert.equal(result.nextContext.conversation.lastQuestionAsked, "confirm_slot");
    assert.equal(result.nextContext.conversation.lastProspectIntent, "schedule_confirm");
    assert.equal(
      result.nextContext.conversation.lastOfferMade,
      "appointment_confirm_deferred"
    );
    assert.ok(result.nextContext.conversation.lastAtlasOutboundText);
    assert.equal(isConfirmableProposedDurable(result.nextContext), true);
  });

  test("after deferred, Si classifies schedule_confirm not provide_location", () => {
    const deferred = proposedAfterSlotSelect();
    deferred.conversation.lastOfferMade = "appointment_confirm_deferred";
    deferred.conversation.lastProspectIntent = "schedule_confirm";
    deferred.conversation.lastAtlasOutboundText =
      "Gracias — anoté tu confirmación. Un compañero finalizará los detalles en breve.";
    const interpretation = interpretInboundMessage({
      message: { text: "Si" },
      context: deferred
    });
    assert.equal(interpretation.intent, "schedule_confirm");
    assert.notEqual(interpretation.intent, "provide_location");
    assert.equal(interpretation.entities?.city || null, null);
  });

  test("Turn3: Si execution ON → create + confirmed + V2 appointment_confirmed", async () => {
    const deferredCtx = proposedAfterSlotSelect();
    deferredCtx.conversation.lastOfferMade = "appointment_confirm_deferred";
    deferredCtx.conversation.lastProspectIntent = "schedule_confirm";
    deferredCtx.conversation.lastAtlasOutboundText =
      "Gracias — anoté tu confirmación. Un compañero finalizará los detalles en breve.";

    let createCalls = 0;
    const result = await processRecruitAiV2Turn({
      message: { text: "Si" },
      context: deferredCtx,
      options: {
        channel: "whatsapp",
        allowExecution: true,
        persistContext: false,
        profileConfigured: true,
        env: authoringEnv(true),
        actingUserId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY,
        dependencies: {
          executeScheduleInterview: async () => {
            createCalls += 1;
            return {
              success: true,
              appointmentId: APPT_ID,
              appointment: {
                id: APPT_ID,
                status: "scheduled",
                prospectId: CORE,
                startDateTime: "2026-08-10T17:00:00.000Z",
                timezone: "America/New_York"
              },
              booking: {
                startTimeISO: "2026-08-10T17:00:00.000Z",
                dateKey: DATE,
                timeKey: TIME
              }
            };
          },
          findActiveAppointmentForProspect: async () => null,
          getAppointmentProfile: async () => ({ profileConfigured: true })
        }
      }
    });

    assert.equal(createCalls, 1);
    assert.equal(result.execution?.success, true);
    assert.equal(result.execution?.appointmentId, APPT_ID);
    assert.equal(result.responsePlan?.templateKey, "appointment_confirmed");
    assert.match(String(result.rendered?.text || ""), /confirmad/i);
    assert.equal(result.nextContext.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
    assert.equal(result.nextContext.appointment.appointmentId, APPT_ID);
    assert.equal(result.nextContext.appointment.confirmedDate, DATE);
    assert.equal(result.nextContext.appointment.confirmedTime, TIME);
  });

  test("cancelled-create authoring loss owns soft failure — never CE state ask", async () => {
    const persistence = createContextPersistenceService({
      repository: createMemoryContextRepository()
    });
    const deferredCtx = proposedAfterSlotSelect();
    deferredCtx.conversation.lastOfferMade = "appointment_confirm_deferred";
    deferredCtx.conversation.lastProspectIntent = "schedule_confirm";
    await persistence.compareAndSaveContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      nextContext: deferredCtx,
      decisionCode: "create_appointment"
    });

    const protected_ = await ownConfirmableProposalAfterAuthoringLoss({
      v2Result: {
        execution: {
          attempted: true,
          success: false,
          appointmentId: null,
          failed: [{ reason: "schedule_workflow_rollback" }]
        },
        nextContext: deferredCtx,
        rendered: {
          text:
            "Gracias — quiero asegurarme de manejar esto correctamente. Un compañero de Team Vision te contactará en breve."
        },
        responsePlan: { templateKey: "appointment_create_failed" }
      },
      prospect: {
        id: LEGACY,
        phone: PHONE,
        organization_id: ORG,
        owner_user_id: AGENT
      },
      normalized: { phone: PHONE, text: "Si", channel: "whatsapp" },
      organizationId: ORG,
      actingUserId: AGENT,
      allowExecution: true,
      persistence
    });

    assert.ok(protected_);
    assert.equal(protected_.authored, true);
    assert.equal(protected_.fallThrough, false);
    assert.doesNotMatch(String(protected_.replyText || ""), /estado está Si/i);
    assert.match(
      String(protected_.replyText || ""),
      /compañero|teammate|correctamente|correctly/i
    );

    const loaded = await persistence.loadContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp"
    });
    assert.equal(loaded.appointment.status, APPOINTMENT_STATUS.PROPOSED);
    assert.equal(loaded.appointment.proposedDate, DATE);
    assert.equal(loaded.appointment.proposedTime, TIME);
    assert.equal(loaded.conversation.lastQuestionAsked, "confirm_slot");
    assert.notEqual(loaded.knownFacts?.city, "Si");
  });
});
