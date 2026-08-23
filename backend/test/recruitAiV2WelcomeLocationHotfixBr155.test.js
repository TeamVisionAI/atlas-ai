/**
 * BR-155 — Recruiting welcome opener + city/state clarification hotfix.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  interpretInboundMessage,
  decideConversationTurn,
  createConversationContext,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS
} = require("../core/recruitAiV2");
const {
  getAdLeadFirstTouchMessage,
  getAmbiguousCityStateQuestion
} = require("../core/teamVisionWorkflowCopy");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");

const SPANISH_FIRST_TOUCH =
  "¡Hola! Claro 😊 Vi que pediste más información sobre la oportunidad. Con mucho gusto te cuento de qué se trata. ¿En qué ciudad y estado te encuentras?";

function renderTurn(message, context) {
  const interpretation = interpretInboundMessage({
    message: { text: message },
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision: decision
  });
  return { interpretation, decision, plan, rendered, nextContext };
}

function spanishBlank() {
  return createConversationContext({ preferredLanguage: "spanish" });
}

function locationAskContext() {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: SPANISH_FIRST_TOUCH
    }
  });
}

test("BR-155 Spanish CTWA-style info request uses new opener exactly", () => {
  const { interpretation, plan, rendered } = renderTurn(
    "¡Hola! Quiero más información",
    spanishBlank()
  );
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.equal(rendered.text, SPANISH_FIRST_TOUCH);
  assert.doesNotMatch(rendered.text, /servicios financieros/i);
  assert.match(rendered.text, /ciudad y estado/i);
});

test("BR-155 getAdLeadFirstTouchMessage is Spanish-only and location-free", () => {
  assert.equal(getAdLeadFirstTouchMessage("es", {}), SPANISH_FIRST_TOUCH);
  assert.equal(getAdLeadFirstTouchMessage("en", {}), null);
  assert.equal(getAdLeadFirstTouchMessage("es", { city: "Miami" }), null);
});

test("BR-155 Miami resolves to Miami, FL silently (high-confidence Florida)", () => {
  const parsed = parseLocationAnswer("Miami");
  assert.equal(parsed.completeness, "complete");
  assert.equal(parsed.state, "FL");
  assert.equal(parsed.city, "Miami");
  assert.equal(parsed.requiresClarification, false);
  const r = renderTurn("Miami", locationAskContext());
  assert.equal(r.interpretation.intent, INTENTS.PROVIDE_LOCATION);
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.match(r.rendered.text, /permiso de trabajo|autoriz/i);
  assert.doesNotMatch(r.rendered.text, /en qué estado/i);
  assert.doesNotMatch(r.rendered.text, /Miami.*Florida\?/i);
});

test("BR-155 Miami, FL completes location without redundant state ask", () => {
  const parsed = parseLocationAnswer("Miami, FL");
  assert.equal(parsed.completeness, "complete");
  const r = renderTurn("Miami, FL", locationAskContext());
  assert.equal(r.interpretation.intent, INTENTS.PROVIDE_LOCATION);
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.match(r.rendered.text, /permiso de trabajo|autoriz/i);
  assert.doesNotMatch(r.rendered.text, /en qué estado/i);
});

test("BR-155 ambiguous city-only asks for state only (no guess)", () => {
  const parsed = parseLocationAnswer("Springfield");
  assert.equal(parsed.completeness, "partial");
  assert.equal(parsed.proposedState, null);
  const r = renderTurn("Springfield", locationAskContext());
  assert.equal(r.plan.templateKey, "ask_state");
  assert.equal(r.rendered.text, getAmbiguousCityStateQuestion("es"));
  assert.doesNotMatch(r.rendered.text, /Springfield/i);
});

test("BR-155 plain Hola does not use ad-lead recruiting opener", () => {
  const { interpretation, plan, rendered } = renderTurn("Hola", spanishBlank());
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.equal(plan.templateKey, "greeting_ask_location");
  assert.notEqual(rendered.text, SPANISH_FIRST_TOUCH);
  assert.doesNotMatch(rendered.text, /servicios financieros/i);
});

test("BR-155 English info request path unchanged", () => {
  const { plan, rendered } = renderTurn(
    "Hello! Can I get more info on this?",
    createConversationContext({ preferredLanguage: "english" })
  );
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.match(rendered.text, /financial services/i);
  assert.match(rendered.text, /city and state/i);
  assert.doesNotMatch(rendered.text, /pediste más información/i);
});
