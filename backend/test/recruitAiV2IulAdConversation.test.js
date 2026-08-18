/**
 * BR-143 — Spanish IUL-review ad conversation.
 * Does not change BR-142 eligibility. Does not book appointments.
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
  const interpretation = interpretInboundMessage({
    message: { text: message },
    context
  });
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

test("BR-142 eligibility module is unchanged by this track", () => {
  const eligibility = fs.readFileSync(
    path.join(__dirname, "../core/atlasInboundAutomationEligibility.js"),
    "utf8"
  );
  assert.match(eligibility, /BR-142/);
  assert.doesNotMatch(eligibility, /IUL_AD|iul_review_ad|BR-143/);
  const referral = extractClickToWhatsAppReferral({
    referral: {
      source_type: "ad",
      ctwa_clid: "clid-iul",
      headline: "Revisa tu póliza IUL",
      body: "Revisión sin compromiso"
    }
  });
  assert.equal(hasPositiveCtwaReferral(referral), true);
  assert.equal(looksLikeIulReferral(referral), true);
  assert.match(referral.headline, /IUL/);
});

test("recruiting greeting is unchanged without IUL-ad context", () => {
  const { interpretation, rendered, decision } = renderTurn(
    "Hola",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.match(rendered.text, /ciudad/i);
  assert.equal(isIulReviewAdContext(createConversationContext()), false);
  assert.equal(decision.decision.mayCreateAppointment, false);
});

test("IUL ad greeting uses the policy-active opener, not recruiting location", () => {
  const { interpretation, rendered, decision, plan } = renderTurn("Hola", iulContext());
  assert.equal(interpretation.intent, INTENTS.IUL_GREETING);
  assert.equal(plan.templateKey, "iul_ad_opener");
  assert.match(rendered.text, /póliza IUL/i);
  assert.match(rendered.text, /activa/i);
  assert.doesNotMatch(rendered.text, /ciudad/i);
  assert.doesNotMatch(rendered.text, /oportunidad en servicios financieros/i);
  assert.equal(decision.decision.mayCreateAppointment, false);
  assert.equal(decision.contextPatch.conversationGoal, CONVERSATION_GOAL);
  assertSafety(rendered.text);
});

test("CTWA IUL headline on unknown language defaults Spanish-first", () => {
  const ctx = createConversationContext({
    preferredLanguage: "unknown",
    ctwaReferral: { sourceType: "ad", headline: "Revisa tu póliza IUL" }
  });
  const { rendered, interpretation } = renderTurn("Hola", ctx);
  assert.equal(interpretation.preferredLanguage, "spanish");
  assert.match(rendered.text, /Gracias por escribirnos/);
});

test("YES on active policy asks the four review topics", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.POLICY_ACTIVE }
  });
  const { interpretation, rendered, decision } = renderTurn("Sí, la tengo activa", ctx);
  assert.equal(interpretation.intent, INTENTS.IUL_POLICY_ACTIVE_YES);
  assert.match(rendered.text, /valor acumulado/i);
  assert.match(rendered.text, /costos/i);
  assert.match(rendered.text, /proyectada a futuro/i);
  assert.match(rendered.text, /otra estrategia/i);
  assert.equal(decision.contextPatch.knownFacts.iulPolicyActive, true);
  assert.equal(decision.decision.mayCreateAppointment, false);
  assertSafety(rendered.text);
});

test("policy not active still educates without attacking IUL", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.POLICY_ACTIVE }
  });
  const { rendered, interpretation } = renderTurn("No, no la tengo", ctx);
  assert.equal(interpretation.intent, INTENTS.IUL_POLICY_ACTIVE_NO);
  assert.match(rendered.text, /entender mejor/i);
  assertSafety(rendered.text);
});

test("costs / projection / alternative topics stay educational then invite review", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.REVIEW_TOPIC },
    knownFacts: { iulPolicyActive: true }
  });
  const costs = renderTurn("los costos de la póliza", ctx);
  assert.match(costs.rendered.text, /costos/i);
  assert.match(costs.rendered.text, /tarde\/noche/i);
  assertSafety(costs.rendered.text);

  const projection = renderTurn("cómo está proyectada a futuro", ctx);
  assert.match(projection.rendered.text, /ilustraciones|proyecciones/i);
  assertSafety(projection.rendered.text);

  const alternative = renderTurn("si existe otra estrategia", ctx);
  assert.match(alternative.rendered.text, /estrategia/i);
  assert.doesNotMatch(alternative.rendered.text, /tu IUL es mala/i);
  assertSafety(alternative.rendered.text);
});

test("cash-value topic educates then soft-asks day vs evening", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.REVIEW_TOPIC },
    knownFacts: { iulPolicyActive: true }
  });
  const { rendered, decision } = renderTurn("cómo está creciendo el valor acumulado", ctx);
  assert.match(rendered.text, /seguro de vida/i);
  assert.match(rendered.text, /valor/i);
  assert.match(rendered.text, /día o en la tarde\/noche/i);
  assert.equal(decision.decision.mayCreateAppointment, false);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.REVIEW_DAY_PART);
  assertSafety(rendered.text);
});

test("solo quiero información answers briefly then offers the review", () => {
  const { rendered, interpretation } = renderTurn("solo quiero información", iulContext());
  assert.equal(interpretation.intent, INTENTS.IUL_INFO_ONLY);
  assert.match(rendered.text, /seguro de vida/i);
  assert.match(rendered.text, /revisión/i);
  assert.doesNotMatch(rendered.text, /oportunidad en servicios financieros/i);
  assertSafety(rendered.text);
});

test("no quiero cambiar mi póliza is informational, not a replacement pitch", () => {
  const { rendered, interpretation } = renderTurn(
    "no quiero cambiar mi póliza",
    iulContext()
  );
  assert.equal(interpretation.intent, INTENTS.IUL_NO_REPLACE);
  assert.match(rendered.text, /informativa/i);
  assert.match(rendered.text, /no te obliga/i);
  assertSafety(rendered.text);
});

test("agent said it is an investment: no confrontation, life insurance + cash value", () => {
  const { rendered, interpretation, decision } = renderTurn(
    "mi agente me dijo que es una inversión",
    iulContext()
  );
  assert.equal(interpretation.intent, INTENTS.IUL_AGENT_SAID_INVESTMENT);
  assert.match(rendered.text, /seguro de vida/i);
  assert.match(rendered.text, /valor en efectivo/i);
  assert.doesNotMatch(rendered.text, /equivoc/i);
  assert.match(rendered.text, /No discutimos con tu agente/i);
  assert.equal(decision.reasonCodes.includes("IUL_NO_AGENT_ARGUMENT"), true);
  assertSafety(rendered.text);
});

test("mándame la información por aquí explains basics without a personalized rec", () => {
  const { rendered, interpretation } = renderTurn(
    "mándame la información por aquí",
    iulContext()
  );
  assert.equal(interpretation.intent, INTENTS.IUL_SEND_INFO_HERE);
  assert.match(rendered.text, /WhatsApp/i);
  assert.match(rendered.text, /no hacemos una recomendación personalizada/i);
  assertSafety(rendered.text);
});

test("¿esto es Primerica? answers clearly", () => {
  const { rendered, interpretation } = renderTurn("¿esto es Primerica?", iulContext());
  assert.equal(interpretation.intent, INTENTS.IUL_PRIMERICA_QUESTION);
  assert.match(rendered.text, /Primerica/i);
  assert.match(rendered.text, /Sí/i);
  assertSafety(rendered.text);
});

test("¿cuánto cuesta? states the review is free", () => {
  const { rendered, interpretation } = renderTurn("¿cuánto cuesta?", iulContext());
  assert.equal(interpretation.intent, INTENTS.IUL_REVIEW_COST_QUESTION);
  assert.match(rendered.text, /gratis/i);
  assert.match(rendered.text, /necesidades|situación/i);
  assertSafety(rendered.text);
});

test("day-part answer captures window and does not book", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.REVIEW_DAY_PART }
  });
  const { rendered, decision, interpretation } = renderTurn("en la tarde/noche", ctx);
  assert.equal(interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY_PART);
  assert.match(rendered.text, /sin compromiso/i);
  assert.equal(decision.decision.mayCreateAppointment, false);
  assert.equal(decision.contextPatch.knownFacts.iulReviewDayPart, "evening");
  assert.equal(decision.reasonCodes.includes("PREMATURE_BOOKING_BLOCKED"), true);
});

test("English inbound on IUL ad switches copy", () => {
  const { rendered, interpretation } = renderTurn(
    "Is this Primerica?",
    iulContext({ preferredLanguage: "spanish" })
  );
  assert.equal(interpretation.intent, INTENTS.IUL_PRIMERICA_QUESTION);
  assert.equal(interpretation.preferredLanguage, "english");
  assert.match(rendered.text, /Primerica/i);
  assert.match(rendered.text, /Yes/i);
  assert.doesNotMatch(rendered.text, /Sí:/);
});

test("opt-out still wins over the IUL track", () => {
  const { interpretation, decision } = renderTurn("stop", iulContext());
  assert.equal(interpretation.intent, INTENTS.OPT_OUT_REQUEST);
  assert.notEqual(decision.customerReplyPlan.templateKey, "iul_ad_opener");
});
