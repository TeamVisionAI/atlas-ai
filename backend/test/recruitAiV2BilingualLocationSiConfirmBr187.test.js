/**
 * BR-187 — bilingual/language-ability must not corrupt confirmed location;
 * final Si books when the slot is confirmable and create succeeds.
 */

"use strict";

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const {
  createConversationContext,
  APPOINTMENT_STATUS
} = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { parseLanguageAbilityStatement } = require("../core/recruitAiV2/qualificationFacts");
const { processRecruitAiV2Turn } = require("../core/recruitAiV2/orchestrator");
const {
  ownConfirmableProposalAfterAuthoringLoss
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");

const FIXED_NOW = new Date("2026-08-30T10:00:00.000-04:00");
const TOMORROW = "2026-08-31";
const SLOT_TIME = "12:30";
const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const CORE = "6a52ef58-511e-4a25-9f81-b5ea211a51be";
const LEGACY = "cc539cb3-1bfd-4329-8ddb-e3b74bf75c33";
const PHONE = "+17865550187";
const APPT_ID = "appt-br187-001";

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW, ...options }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability: options.availability || null
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function authoringEnv(executionOn = true) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: AGENT,
    RECRUIT_AI_V2_EXECUTION_ENABLED: executionOn ? "true" : "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: executionOn ? "true" : "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: AGENT
  };
}

function runQualificationThroughAfternoon() {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado vives?"
    }
  });

  const location = turn("Tampa, FL", ctx);
  ctx = location.nextContext;
  const auth = turn("soy ciudadana", ctx);
  ctx = auth.nextContext;
  const afternoon = turn("Tarde", ctx);
  ctx = afternoon.nextContext;
  return { location, auth, afternoon, ctx };
}

describe("BR-187 bilingual location + final Si confirm", () => {
  test("docs: BR-187 documented", () => {
    const rules = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(rules, /## BR-187/);
    assert.match(rules, /Confirmed Fact Stability/);
  });

  test("parser: Soy bilingüe is not a city", () => {
    assert.equal(parseLocationAnswer("Soy bilingüe"), null);
    assert.equal(parseLocationAnswer("Soy bilingue"), null);
    assert.equal(parseLocationAnswer("I am bilingual"), null);
    assert.equal(parseLocationAnswer("soy ciudadana"), null);
    assert.equal(parseLanguageAbilityStatement("Soy bilingüe"), "bilingual");
    assert.equal(parseLanguageAbilityStatement("hablo inglés y español"), "bilingual");
  });

  test("Tampa stays confirmed after soy ciudadana + afternoon + Soy bilingüe", () => {
    const seq = runQualificationThroughAfternoon();
    assert.equal(seq.location.nextContext.knownFacts.city, "Tampa");
    assert.equal(seq.location.nextContext.knownFacts.state, "FL");
    assert.equal(seq.auth.interpretation.intent, "provide_authorization");
    assert.equal(seq.auth.nextContext.knownFacts.workAuthorization, true);
    assert.equal(seq.afternoon.nextContext.knownFacts.preferredDayPart, "afternoon");

    const bilingual = turn("Soy bilingüe", seq.ctx);
    assert.equal(bilingual.interpretation.intent, "provide_language_ability");
    assert.equal(bilingual.interpretation.entities.city, null);
    assert.equal(bilingual.interpretation.entities.languageAbility, "bilingual");
    assert.equal(bilingual.nextContext.knownFacts.city, "Tampa");
    assert.equal(bilingual.nextContext.knownFacts.state, "FL");
    assert.equal(bilingual.nextContext.knownFacts.cityCertainty, "confirmed");
    assert.equal(bilingual.nextContext.knownFacts.languageAbility, "bilingual");
    assert.doesNotMatch(String(bilingual.rendered.text || ""), /Soy Bilingue/i);
    assert.doesNotMatch(String(bilingual.rendered.text || ""), /ciudad y estado/i);
    assert.doesNotMatch(
      bilingual.structuredDecision.reasonCodes.join(","),
      /LOCATION_OVERWRITE/
    );
  });

  test("confirmed Tampa is not completed onto an unrelated partial city", () => {
    const seq = runQualificationThroughAfternoon();
    const r = turn("Nueva Oportunidad", seq.ctx);
    assert.notEqual(r.interpretation.intent, "provide_location");
    assert.notEqual(r.interpretation.entities?.city, "Nueva Oportunidad");
    assert.equal(r.nextContext.knownFacts.city, "Tampa");
    assert.equal(r.nextContext.knownFacts.state, "FL");
  });

  test("overwrite-blocked reply still speaks Tampa, not this-turn city", () => {
    const ctx = createConversationContext({
      preferredLanguage: "spanish",
      currentStage: "qualification",
      timezone: "America/New_York",
      knownFacts: {
        city: "Tampa",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        coverage: "OUTSIDE",
        preferredMeetingType: "zoom"
      },
      conversation: {
        lastQuestionAsked: "ask_day_part"
      }
    });
    const interpretation = {
      intent: "provide_location",
      confidence: 0.9,
      preferredLanguage: "spanish",
      entities: {
        city: "Soy Bilingue",
        state: "FL",
        completeness: "complete"
      }
    };
    const decision = decideConversationTurn({ context: ctx, interpretation });
    assert.ok(decision.reasonCodes.includes("LOCATION_OVERWRITE_BLOCKED"));
    const rendered = renderCustomerReply(decision.customerReplyPlan);
    assert.match(String(rendered.text || ""), /Tampa/);
    assert.doesNotMatch(String(rendered.text || ""), /Soy Bilingue/i);
    const next = buildNextContextFromInterpretation({
      loaded: ctx,
      interpretation,
      structuredDecision: decision
    });
    assert.equal(next.knownFacts.city, "Tampa");
  });

  test("regression: Tarde → 12:30 → Si books and does not hand off", async () => {
    const seq = runQualificationThroughAfternoon();
    const bilingual = turn("Soy bilingüe", seq.ctx);
    const lateAfternoon = turn("Tarde", bilingual.nextContext);
    assert.equal(lateAfternoon.nextContext.knownFacts.city, "Tampa");
    assert.equal(lateAfternoon.nextContext.knownFacts.languageAbility, "bilingual");

    const offered = [
      { date: TOMORROW, dateKey: TOMORROW, time: SLOT_TIME, timeKey: SLOT_TIME },
      { date: TOMORROW, dateKey: TOMORROW, time: "14:00", timeKey: "14:00" }
    ];
    const schedulingCtx = {
      ...lateAfternoon.nextContext,
      currentStage: "scheduling",
      appointment: {
        ...lateAfternoon.nextContext.appointment,
        status: APPOINTMENT_STATUS.PROPOSED,
        previouslyOfferedSlots: offered
      },
      conversation: {
        ...lateAfternoon.nextContext.conversation,
        lastQuestionAsked: "offer_time_choices",
        lastAtlasOutboundText:
          "Tengo disponible mañana a las 12:30 PM y a las 2:00 PM. ¿Cuál te funciona mejor?"
      }
    };

    const selected = turn("12:30 PM", schedulingCtx);
    assert.match(
      String(selected.interpretation.intent),
      /select_option|scheduling_counteroffer/
    );
    assert.equal(selected.nextContext.appointment.proposedTime, SLOT_TIME);
    assert.equal(selected.nextContext.appointment.proposedDate, TOMORROW);
    assert.equal(
      selected.structuredDecision.customerReplyPlan.templateKey,
      "confirm_selected_slot"
    );
    assert.match(String(selected.rendered.text || ""), /SI|YES/i);
    assert.doesNotMatch(String(selected.rendered.text || ""), /Soy Bilingue/i);

    let createCalls = 0;
    const booked = await processRecruitAiV2Turn({
      message: { text: "Si" },
      context: selected.nextContext,
      options: {
        channel: "whatsapp",
        allowExecution: true,
        persistContext: false,
        profileConfigured: true,
        now: FIXED_NOW,
        env: authoringEnv(true),
        actingUserId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY,
        dependencies: {
          executeScheduleInterview: async (_phone, payload) => {
            createCalls += 1;
            assert.equal(payload.dateKey, TOMORROW);
            assert.equal(payload.timeKey, SLOT_TIME);
            return {
              success: true,
              appointmentId: APPT_ID,
              appointment: {
                id: APPT_ID,
                status: "scheduled",
                prospectId: CORE,
                startDateTime: "2026-08-31T16:30:00.000Z",
                timezone: "America/New_York"
              },
              booking: {
                startTimeISO: "2026-08-31T16:30:00.000Z",
                dateKey: TOMORROW,
                timeKey: SLOT_TIME
              }
            };
          },
          findActiveAppointmentForProspect: async () => null,
          getAppointmentProfile: async () => ({ profileConfigured: true }),
          getSlots: async () => ({
            slots: offered
          })
        }
      }
    });

    assert.equal(booked.interpretation.intent, "schedule_confirm");
    assert.equal(createCalls, 1);
    assert.equal(booked.execution?.attempted, true);
    assert.equal(booked.execution?.success, true);
    assert.equal(booked.responsePlan?.templateKey, "appointment_confirmed");
    assert.match(String(booked.rendered?.text || ""), /confirmad/i);
    assert.doesNotMatch(
      String(booked.rendered?.text || ""),
      /manejar esto correctamente/i
    );
    assert.equal(booked.nextContext.knownFacts.city, "Tampa");
    assert.equal(booked.nextContext.appointment.confirmedTime, SLOT_TIME);
  });

  test("authoring loss without a failed create keeps deferred copy, not create-failed", async () => {
    const persistence = createContextPersistenceService({
      repository: createMemoryContextRepository()
    });
    const proposed = createConversationContext({
      organizationId: ORG,
      prospectId: CORE,
      prospectPhone: PHONE,
      preferredLanguage: "spanish",
      currentStage: "proposed",
      timezone: "America/New_York",
      knownFacts: {
        city: "Tampa",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true
      },
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: TOMORROW,
        proposedTime: SLOT_TIME,
        previouslyOfferedSlots: [
          { date: TOMORROW, time: SLOT_TIME, dateKey: TOMORROW, timeKey: SLOT_TIME }
        ]
      },
      conversation: {
        lastQuestionAsked: "confirm_slot",
        lastProspectIntent: "schedule_confirm",
        lastOfferMade: "confirm_selected_slot",
        lastAtlasOutboundText:
          "Perfecto, mañana a las 12:30 PM. Responde SI para confirmar esa hora."
      }
    });
    await persistence.compareAndSaveContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      nextContext: proposed,
      decisionCode: "create_appointment"
    });

    const owned = await ownConfirmableProposalAfterAuthoringLoss({
      v2Result: {
        execution: { attempted: false, success: false },
        nextContext: proposed
      },
      prospect: { id: LEGACY, phone: PHONE, organization_id: ORG, owner_user_id: AGENT },
      normalized: { phone: PHONE, text: "Si", channel: "whatsapp" },
      organizationId: ORG,
      actingUserId: AGENT,
      allowExecution: true,
      persistence
    });

    assert.ok(owned);
    assert.equal(owned.authored, true);
    assert.match(String(owned.replyText || ""), /finalizará|finalizara|details/i);
    assert.doesNotMatch(
      String(owned.replyText || ""),
      /manejar esto correctamente/i
    );
  });
});
