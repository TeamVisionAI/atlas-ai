/**
 * BR-190 — exact requested time asks SI, then Si must book.
 * Production miss: miércoles 10:00 → “Responde SI” → Si → generic “Perfecto.” and no appointment.
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
const { processRecruitAiV2Turn } = require("../core/recruitAiV2/orchestrator");
const {
  hasConfirmableAppointmentProposal
} = require("../core/recruitAiV2/schedulingConfirmation");
const { READ_STATUS } = require("../core/recruitAiV2/schedulingAvailabilityReader");

const FIXED_NOW = new Date("2026-08-31T07:58:00.000-04:00");
const WEDNESDAY = "2026-09-02";
const SLOT_TIME = "10:00";
const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const CORE = "6a52ef58-511e-4a25-9f81-b5ea211a51be";
const LEGACY = "cc539cb3-1bfd-4329-8ddb-e3b74bf75c33";
const PHONE = "+17865550187";
const APPT_ID = "appt-br190-001";

const WED_SLOTS = [
  {
    date: WEDNESDAY,
    dateKey: WEDNESDAY,
    time: SLOT_TIME,
    timeKey: SLOT_TIME,
    timezone: "America/New_York"
  },
  {
    date: WEDNESDAY,
    dateKey: WEDNESDAY,
    time: "11:00",
    timeKey: "11:00",
    timezone: "America/New_York"
  }
];

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

function turn(text, context, availability = null) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  nextContext.conversation = {
    ...nextContext.conversation,
    lastOfferMade:
      structuredDecision.customerReplyPlan.templateKey ||
      nextContext.conversation.lastOfferMade,
    lastAtlasOutboundText: String(rendered.text || "").trim()
  };
  return { interpretation, structuredDecision, nextContext, rendered };
}

function qualifiedWaitingForTime() {
  const base = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    organizationId: ORG,
    prospectId: CORE,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      coverage: "LOCAL",
      preferredMeetingType: "in_person"
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "¿Prefieres en la mañana o en la tarde?"
    }
  });
  return turn("Pudiera ser el miercoles en la mañana", base);
}

function exactTimeAvailable() {
  return {
    checked: true,
    status: READ_STATUS.AVAILABLE,
    requestedSlotAvailable: true,
    providerFailure: false,
    nearestAlternatives: WED_SLOTS
  };
}

describe("BR-190 confirm-selected slot then Si books", () => {
  test("docs: BR-190 documented", () => {
    const rules = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(rules, /## BR-190/);
    assert.match(rules, /Confirm-selected slot stays confirmable/);
  });

  test("miércoles en la mañana → 10:00 am asks SI and keeps confirm_slot", () => {
    const morning = qualifiedWaitingForTime();
    assert.match(
      String(morning.rendered.text || ""),
      /miércoles|miercoles/i
    );
    assert.match(String(morning.rendered.text || ""), /hora/i);
    assert.equal(morning.nextContext.appointment.proposedDate, WEDNESDAY);

    const selected = turn(
      "A las 10:00 am",
      morning.nextContext,
      exactTimeAvailable()
    );
    assert.equal(selected.interpretation.intent, "scheduling_counteroffer");
    assert.equal(
      selected.structuredDecision.customerReplyPlan.templateKey,
      "confirm_selected_slot"
    );
    assert.equal(selected.nextContext.conversation.lastQuestionAsked, "confirm_slot");
    assert.equal(selected.nextContext.appointment.proposedDate, WEDNESDAY);
    assert.equal(selected.nextContext.appointment.proposedTime, SLOT_TIME);
    assert.match(
      String(selected.rendered.text || ""),
      /Responde SI para confirmar/i
    );
    assert.equal(hasConfirmableAppointmentProposal(selected.nextContext), true);
    assert.notEqual(
      selected.nextContext.conversation.lastQuestionAsked,
      "offer_time_choices"
    );
  });

  test("Si after that SI-ask creates exactly one Wednesday 10:00 appointment", async () => {
    const morning = qualifiedWaitingForTime();
    const selected = turn(
      "A las 10:00 am",
      morning.nextContext,
      exactTimeAvailable()
    );

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
            assert.equal(payload.dateKey, WEDNESDAY);
            assert.equal(payload.timeKey, SLOT_TIME);
            return {
              success: true,
              appointmentId: APPT_ID,
              appointment: {
                id: APPT_ID,
                status: "scheduled",
                prospectId: CORE,
                startDateTime: "2026-09-02T14:00:00.000Z",
                timezone: "America/New_York"
              },
              booking: {
                startTimeISO: "2026-09-02T14:00:00.000Z",
                dateKey: WEDNESDAY,
                timeKey: SLOT_TIME
              }
            };
          },
          findActiveAppointmentForProspect: async () => null,
          getAppointmentProfile: async () => ({ profileConfigured: true }),
          getSlots: async () => ({ slots: WED_SLOTS })
        }
      }
    });

    assert.equal(booked.interpretation.intent, "schedule_confirm");
    assert.equal(
      booked.structuredDecision.decision.nextAction,
      "create_appointment"
    );
    assert.equal(booked.structuredDecision.decision.mayCreateAppointment, true);
    assert.equal(createCalls, 1);
    assert.equal(booked.execution?.attempted, true);
    assert.equal(booked.execution?.success, true);
    assert.equal(booked.responsePlan?.templateKey, "appointment_confirmed");
    assert.match(String(booked.rendered?.text || ""), /confirmad/i);
    assert.match(String(booked.rendered?.text || ""), /10:00/i);
    assert.doesNotMatch(String(booked.rendered?.text || ""), /^Perfecto\.\s*$/);
    assert.equal(booked.nextContext.appointment.proposedDate, WEDNESDAY);
    assert.equal(
      booked.nextContext.appointment.confirmedDate ||
        booked.nextContext.appointment.proposedDate,
      WEDNESDAY
    );
    assert.equal(
      booked.nextContext.appointment.confirmedTime ||
        booked.nextContext.appointment.proposedTime,
      SLOT_TIME
    );
    assert.equal(booked.nextContext.appointment.status, "confirmed");
    assert.notEqual(
      booked.nextContext.conversation.lastQuestionAsked,
      "offer_time_choices"
    );
    assert.notEqual(
      booked.nextContext.conversation.lastOfferMade,
      "acknowledge_preference_awaiting_availability"
    );
  });

  test("production leftover offer_time_choices + SI copy is still confirmable", () => {
    const leftover = createConversationContext({
      preferredLanguage: "spanish",
      currentStage: "proposed",
      timezone: "America/New_York",
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: WEDNESDAY,
        proposedTime: SLOT_TIME,
        previouslyOfferedSlots: [WED_SLOTS[0]]
      },
      conversation: {
        lastQuestionAsked: "offer_time_choices",
        lastOfferMade: "confirm_selected_slot",
        lastAtlasOutboundText:
          "Perfecto, el miércoles a las 10:00 AM. Responde SI para confirmar esa hora."
      }
    });
    assert.equal(hasConfirmableAppointmentProposal(leftover), true);
    const si = turn("Si", leftover);
    assert.equal(si.interpretation.intent, "schedule_confirm");
    assert.equal(si.structuredDecision.decision.nextAction, "create_appointment");
    assert.notEqual(
      si.structuredDecision.customerReplyPlan.templateKey,
      "acknowledge_preference_awaiting_availability"
    );
  });
});
