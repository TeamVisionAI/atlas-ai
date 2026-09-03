/**
 * BR-221 — IUL scheduling ownership, day-picker delivery, information-seeker integrity.
 * Does not change BR-219 timeout/deferred booking or BR-220 compact-slot behavior.
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
  createConversationContext,
  interpretInboundMessage,
  decideConversationTurn,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS
} = require("../core/recruitAiV2");
const { REASON_CODES } = require("../core/recruitAiV2/constants");
const {
  ASK,
  CONVERSATION_GOAL,
  CAMPAIGN_KIND,
  meetingModeFacts
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const {
  parseIulDayFromText,
  formatIulDayTitle,
  iulDaySelectionId
} = require("../core/recruitAiV2/iulDayFirstScheduling");
const {
  isIulSchedulingOwnedState,
  isIulInformationSeeker,
  isIulReviewReadyForScheduling,
  shouldBlockIulDiscovery,
  buildIulDeferredAcknowledgement
} = require("../core/recruitAiV2/iulSchedulingOwnership");
const { shouldAttemptAvailabilityOffer } = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { collectInteractiveOptionParts } = require("../core/whatsappInteractiveMessage");
const { resolveDeliverableReplyText } = require("../core/communicationHub");

const NOW = "2026-09-02T16:00:00.000Z";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

const MULTI_DAY_SLOTS = [
  slot("2026-09-03", "09:00"),
  slot("2026-09-03", "12:00"),
  slot("2026-09-04", "09:00"),
  slot("2026-09-04", "12:00"),
  slot("2026-09-05", "10:00"),
  slot("2026-09-06", "11:00"),
  slot("2026-09-07", "09:00")
];

function researchFacts(mode = null) {
  return {
    name: "Eladio",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_RESEARCH,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_GROWTH,
    reviewReason: IUL_OPTION_IDS.REVIEW_GROWTH,
    ...(mode
      ? meetingModeFacts(mode, {
          organizationId: TEAM_VISION_ORG,
          knownFacts: { reviewOfficeAddress: OFFICE },
          _officeLocation: { fullAddress: OFFICE }
        })
      : {})
  };
}

function activeFacts(mode = "zoom") {
  return {
    name: "Ana",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_UNDERSTAND,
    iulPolicyActive: true,
    policyType: "IUL",
    ...meetingModeFacts(mode, {
      organizationId: TEAM_VISION_ORG,
      knownFacts: { reviewOfficeAddress: OFFICE },
      _officeLocation: { fullAddress: OFFICE }
    }),
    reviewOfficeAddress: OFFICE
  };
}

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: TEAM_VISION_ORG,
    agentId: AGENT_ID,
    timezone: "America/New_York",
    _testNow: NOW,
    _officeLocation: { fullAddress: OFFICE },
    _availabilityFixture: { slots: MULTI_DAY_SLOTS },
    knownFacts: { name: "Eladio" },
    conversation: { lastQuestionAsked: ASK.MEETING_MODE },
    ...overrides
  });
}

function turn(message, context) {
  const interpretation = interpretInboundMessage({
    message: typeof message === "string" ? { text: message } : message,
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function zoomTap() {
  return {
    text: "Por Zoom",
    interactiveReply: { type: "button_reply", id: IUL_OPTION_IDS.MEET_ZOOM, title: "Por Zoom" }
  };
}

function officeTap() {
  return {
    text: "En la oficina",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.MEET_OFFICE,
      title: "En la oficina"
    }
  };
}

function optionIds(decision) {
  const payload = decision.customerReplyPlan?.entities?.whatsappInteractive;
  if (!payload) return [];
  return collectInteractiveOptionParts(payload).map((row) => row.id);
}

function afterResearchZoom() {
  const chosen = turn(
    zoomTap(),
    iulContext({
      knownFacts: researchFacts(),
      conversation: { lastQuestionAsked: ASK.MEETING_MODE }
    })
  );
  return {
    chosen,
    context: iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: chosen.decision.contextPatch.knownFacts,
      appointment: chosen.decision.contextPatch.appointment
    })
  };
}

test("A) Busco información → Crecimiento → Zoom enters scheduling ownership", () => {
  const { chosen, context } = afterResearchZoom();
  assert.equal(chosen.interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.equal(chosen.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.equal(context.knownFacts.meetingMode, "zoom");
  assert.equal(isIulReviewReadyForScheduling(context), true);
  assert.equal(isIulSchedulingOwnedState(context), true);
  assert.equal(shouldBlockIulDiscovery(context), true);
  assert.equal(isIulInformationSeeker(context), true);
});

test("B) Zoom outbound includes day interactive", () => {
  const { chosen } = afterResearchZoom();
  const ids = optionIds(chosen.decision);
  assert.ok(ids.includes("IUL_DAY_2026-09-03"));
  assert.ok(ids.includes("IUL_DAY_2026-09-04"));
  assert.match(chosen.rendered.text, /Perfecto\. ¿Qué día le funciona mejor\?/);
  assert.ok(chosen.decision.customerReplyPlan.entities.interactiveFallbackText);
});

test("C) if interactive unavailable, numbered day fallback is sent", () => {
  const { chosen } = afterResearchZoom();
  const fallback = chosen.decision.customerReplyPlan.entities.interactiveFallbackText;
  assert.match(fallback, /1\.\s+Jue 3/);
  assert.match(fallback, /2\.\s+Vie 4/);
  const delivered = resolveDeliverableReplyText("Perfecto. ¿Qué día le funciona mejor?", {
    v2Result: {
      structuredDecision: {
        customerReplyPlan: {
          entities: {
            interactiveFallbackText: fallback
          }
        }
      }
    }
  });
  assert.match(delivered, /1\.\s+Jue 3/);
});

test("D) Viernes resolves only against the currently offered day page", () => {
  const { context } = afterResearchZoom();
  const friday = turn("Viernes", context);
  assert.equal(friday.interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY);
  assert.equal(friday.interpretation.entities.iulSelectedDate, "2026-09-04");
  assert.notEqual(friday.decision.contextPatch.conversation.lastQuestionAsked, ASK.POLICY_TYPE);
});

test("E) ambiguous free text re-offers day options", () => {
  const { context } = afterResearchZoom();
  const retry = turn("cuando puedas", context);
  assert.equal(retry.interpretation.intent, INTENTS.IUL_REOFFER_REVIEW_DAYS);
  assert.equal(retry.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.ok(optionIds(retry.decision).includes("IUL_DAY_2026-09-04"));
  assert.ok(retry.decision.reasonCodes.includes(REASON_CODES.IUL_DAY_OPTIONS_REOFFERED));
});

test("F) day selection never triggers policy-type discovery", () => {
  const { context } = afterResearchZoom();
  const retry = turn("pasado mañana", context);
  assert.notEqual(retry.decision.contextPatch.conversation.lastQuestionAsked, ASK.POLICY_TYPE);
  assert.notEqual(retry.decision.customerReplyPlan.templateKey, "iul_ask_policy_type");
  assert.equal(retry.decision.contextPatch.knownFacts.policyType, null);
});

test("G) after invalid day response, Office switch returns to day selection", () => {
  const { context } = afterResearchZoom();
  const invalid = turn("cuando puedas", context);
  const afterInvalid = iulContext({
    conversation: {
      lastQuestionAsked: invalid.decision.contextPatch.conversation.lastQuestionAsked
    },
    knownFacts: invalid.decision.contextPatch.knownFacts
  });
  const office = turn(officeTap(), afterInvalid);
  assert.equal(office.interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.equal(office.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.equal(office.decision.contextPatch.knownFacts.meetingMode, "in_person");
  assert.notEqual(office.decision.customerReplyPlan.templateKey, "iul_ask_carrier");
});

test("H) information seeker does not gain policy-owner facts", () => {
  const { chosen, context } = afterResearchZoom();
  assert.equal(chosen.decision.contextPatch.knownFacts.iulQualificationStatus, IUL_OPTION_IDS.STATUS_RESEARCH);
  assert.equal(chosen.decision.contextPatch.knownFacts.policyType == null, true);
  assert.equal(chosen.decision.contextPatch.knownFacts.iulPolicyActive == null, true);
  const friday = turn("Viernes", context);
  assert.equal(friday.decision.contextPatch.knownFacts.policyType == null, true);
  assert.equal(friday.decision.contextPatch.knownFacts.carrier == null, true);
});

test("I) active-policy path still retains policy facts", () => {
  const chosen = turn(
    zoomTap(),
    iulContext({
      knownFacts: activeFacts(),
      conversation: { lastQuestionAsked: ASK.MEETING_MODE }
    })
  );
  assert.equal(chosen.decision.contextPatch.knownFacts.policyType, "IUL");
  assert.equal(chosen.decision.contextPatch.knownFacts.iulPolicyActive, true);
  assert.equal(chosen.decision.contextPatch.knownFacts.iulQualificationStatus, IUL_OPTION_IDS.STATUS_ACTIVE);
  assert.equal(chosen.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
});

test("J) BR-219 booking/deferred unchanged", () => {
  const deferred = buildIulDeferredAcknowledgement({
    language: "es",
    slot: { date: "2026-09-04", time: "12:00", dateKey: "2026-09-04", timeKey: "12:00" },
    meetingMode: "zoom"
  });
  assert.match(deferred, /Estoy reservando/);
  assert.doesNotMatch(deferred, /zoom\.us/i);
});

test("K) BR-220 compact-slot behavior unchanged", () => {
  const { context } = afterResearchZoom();
  const friday = turn(
    {
      text: "Vie 4",
      interactiveReply: {
        type: "list_reply",
        id: iulDaySelectionId("2026-09-04"),
        title: formatIulDayTitle("2026-09-04", "es")
      }
    },
    context
  );
  assert.ok(
    friday.decision.contextPatch.conversation.lastQuestionAsked === ASK.SCHEDULING_DAY_PART ||
      friday.decision.contextPatch.conversation.lastQuestionAsked === ASK.OFFER_SLOTS
  );
});

test("L) live Zoom/Office turns request calendar availability", () => {
  assert.equal(
    shouldAttemptAvailabilityOffer({
      context: iulContext({
        knownFacts: researchFacts(),
        conversation: { lastQuestionAsked: ASK.MEETING_MODE }
      }),
      interpretation: { intent: INTENTS.IUL_CHOOSE_MEETING_MODE, entities: { meetingMode: "zoom" } }
    }),
    true
  );
});

test("weekday match is unique to the displayed page", () => {
  const oneFriday = parseIulDayFromText("viernes", [
    { dateKey: "2026-09-03", selectionId: "IUL_DAY_2026-09-03" },
    { dateKey: "2026-09-04", selectionId: "IUL_DAY_2026-09-04" }
  ]);
  assert.equal(oneFriday.dateKey, "2026-09-04");
  const twoFridays = parseIulDayFromText("viernes", [
    { dateKey: "2026-09-04", selectionId: "IUL_DAY_2026-09-04" },
    { dateKey: "2026-09-11", selectionId: "IUL_DAY_2026-09-11" }
  ]);
  assert.equal(twoFridays, null);
});
