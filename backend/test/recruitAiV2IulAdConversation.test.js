/**
 * BR-143 — Spanish IUL-review ad conversation (V1 discovery A→G).
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  interpretInboundMessage,
  decideConversationTurn,
  createConversationContext,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS,
  isExecutionEnabled
} = require("../core/recruitAiV2");
const { isLiveExecutionPathEnabled } = require("../core/recruitAiV2/liveExecutionPathConfig");
const {
  CAMPAIGN_KIND,
  CONVERSATION_GOAL,
  ASK,
  isIulReviewAdContext,
  looksLikeIulReferral
} = require("../core/recruitAiV2/iulAdConversation");
const { extractClickToWhatsAppReferral } = require("../services/whatsappWebhookParser");
const { hasPositiveCtwaReferral } = require("../core/atlasInboundAutomationEligibility");

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    ctwaReferral: {
      sourceType: "ad",
      headline: "Revisa tu póliza IUL",
      body: "Entiende cómo está tu IUL"
    },
    ...overrides
  });
}

function renderTurn(message, context) {
  const interpretation = interpretInboundMessage({ message: { text: message }, context });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function assertSafety(text) {
  assert.doesNotMatch(text, /estafa|scam|mala poliza|bad (iul|policy)/i);
  assert.doesNotMatch(text, /tu agente (se )?equivoc|agent is wrong|don'?t listen to your agent/i);
  assert.doesNotMatch(text, /simplemente una inversion|just an investment|only an investment/i);
  assert.doesNotMatch(text, /ciudad y estado|city and state/i);
}

test("execution and live booking gates remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
});

test("IUL ad greeting asks qualification status, not recruiting location", () => {
  const { interpretation, rendered, decision } = renderTurn("Hola", iulContext());
  assert.equal(interpretation.intent, INTENTS.IUL_GREETING);
  assert.match(rendered.text, /orientarle/i);
  assert.doesNotMatch(rendered.text, /ciudad/i);
  assert.doesNotMatch(rendered.text, /Zoom/i);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assertSafety(rendered.text);
});

test("policy type IUL advances to carrier ask", () => {
  const ctx = iulContext({ conversation: { lastQuestionAsked: ASK.POLICY_TYPE } });
  const { decision, rendered } = renderTurn("es una IUL", ctx);
  assert.equal(decision.contextPatch.knownFacts.policyType, "IUL");
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.CARRIER);
  assert.match(rendered.text, /compañía|aseguradora/i);
});

test("original purpose ask follows carrier capture", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.CARRIER },
    knownFacts: { policyType: "IUL", carrierResolved: false }
  });
  const { decision, rendered } = renderTurn("Primerica", ctx);
  assert.equal(decision.contextPatch.knownFacts.carrier, "Primerica");
  assert.match(rendered.text, /razón principal/i);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.ORIGINAL_PURPOSE);
});

test("solo quiero información after the qualification ask advances to research intent, not Zoom", () => {
  const { rendered, interpretation, decision } = renderTurn(
    "solo quiero información",
    iulContext({ conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS } })
  );
  assert.equal(interpretation.intent, INTENTS.IUL_STATUS_RESEARCH);
  assert.match(rendered.text, /entender mejor/i);
  assert.doesNotMatch(rendered.text, /Zoom/i);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.RESEARCH_INTENT);
  assertSafety(rendered.text);
});

test("day-part answer captures window and proposes review scheduling", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY_PART },
    knownFacts: {
      policyType: "IUL",
      carrierResolved: true,
      originalPurposeAsked: true,
      originalPolicyPurpose: "RETIREMENT",
      policyAgeRange: "ONE_TO_THREE_YEARS",
      reviewReason: "CASH_VALUE",
      documentsAvailable: "NO",
      reviewMeetingType: "ZOOM"
    },
    _availabilityFixture: {
      slots: [
        { dateKey: "2099-08-25", timeKey: "10:00", timezone: "America/New_York" },
        { dateKey: "2099-08-25", timeKey: "18:00", timezone: "America/New_York" }
      ]
    },
    _testNow: "2099-08-20T12:00:00.000Z"
  });
  const { decision, interpretation } = renderTurn("en la tarde/noche", ctx);
  assert.equal(interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY_PART);
  assert.equal(decision.contextPatch.knownFacts.reviewPreferredDayPart, "afternoon");
  assert.equal(decision.decision.nextAction, "iul_offer_review_slots");
});

test("opt-out still wins over the IUL track", () => {
  const { interpretation, decision } = renderTurn("stop", iulContext());
  assert.equal(interpretation.intent, INTENTS.OPT_OUT_REQUEST);
  assert.notEqual(decision.customerReplyPlan.templateKey, "iul_ad_opener");
});
