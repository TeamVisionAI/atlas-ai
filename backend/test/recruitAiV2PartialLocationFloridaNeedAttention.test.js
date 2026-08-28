/**
 * Live recruiting regression — partial location "Florida" after city+state ask.
 * Must persist state, ask city only, stay Active / ATLAS, never Need Attention.
 * Shared Recruit AI v2 orchestration (not Team Vision-specific).
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { buildResponsePlan } = require("../core/recruitAiV2/responsePlan");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");

const LIVE_CITY_STATE_ASK =
  "¡Hola! Claro 😊 Vi que pediste más información sobre la oportunidad. Con mucho gusto te cuento de qué se trata. ¿En qué ciudad y estado te encuentras?";

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true }
  });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(structuredDecision);
  const rendered = renderCustomerReply(plan);
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  return { interpretation, structuredDecision, plan, rendered, nextContext };
}

function assertActiveAskCity(r, expectedState = "FL") {
  assert.equal(r.interpretation.intent, "provide_location");
  assert.equal(r.interpretation.entities.completeness, "state_only");
  assert.equal(r.interpretation.entities.state, expectedState);
  assert.equal(r.interpretation.entities.city, null);
  assert.equal(r.nextContext.knownFacts.state, expectedState);
  assert.equal(r.nextContext.knownFacts.city, null);
  assert.equal(r.nextContext.knownFacts.stateCertainty, "partial");
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_city");
  assert.equal(r.plan.templateKey, "ask_city");
  assert.equal(r.structuredDecision.decision.nextAction, "clarify_location");
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.equal(r.nextContext.attention.needsHumanAttention, false);
  assert.equal(r.nextContext.attention.reason, null);
  assert.notEqual(r.nextContext.currentStage, "human_required");
  assert.ok(String(r.rendered.text || "").trim(), "silent terminal without reason");
  assert.match(r.rendered.text, /ciudad de|city in/i);
  assert.doesNotMatch(r.rendered.text, /ciudad y estado|city and state/i);
}

function locationAskContext() {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: LIVE_CITY_STATE_ASK
    }
  });
}

test("asked city+state → inbound Florida → state resolves, city unresolved, ask city only, no Need Attention", () => {
  const first = turn("¡Hola! Quiero más información. TVR-0826-A7K4", createConversationContext({
    preferredLanguage: "spanish"
  }));
  assert.equal(first.plan.templateKey, "job_overview_faq_then_resume");
  assert.match(first.rendered.text, /ciudad y estado/i);
  assert.equal(first.nextContext.conversation.lastQuestionAsked, "ask_location");

  const afterAsk = createConversationContext({
    preferredLanguage: "spanish",
    conversation: {
      lastQuestionAsked: first.nextContext.conversation.lastQuestionAsked,
      lastAtlasOutboundText: first.rendered.text
    }
  });
  const r = turn("Florida", afterAsk);
  assertActiveAskCity(r);
});

test("Florida without last-ask evidence still persists FL and asks city only", () => {
  const r = turn(
    "Florida",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assertActiveAskCity(r);
});

test("Florida with stale non-location lastQ does not escalate to Need Attention", () => {
  const r = turn(
    "Florida",
    createConversationContext({
      preferredLanguage: "spanish",
      conversation: {
        lastQuestionAsked: "ask_authorization",
        clarificationCount: 1
      }
    })
  );
  assertActiveAskCity(r);
});

test("Miami after state-only completes Miami, Florida", () => {
  const afterState = turn("Florida", locationAskContext()).nextContext;
  assert.equal(afterState.knownFacts.state, "FL");
  assert.equal(afterState.knownFacts.city, null);
  const r = turn("Miami", afterState);
  assert.equal(r.interpretation.intent, "provide_location");
  assert.equal(r.interpretation.entities.completeness, "complete");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.knownFacts.cityCertainty, "confirmed");
  assert.equal(r.nextContext.knownFacts.stateCertainty, "confirmed");
  assert.equal(r.nextContext.attention.needsHumanAttention, false);
  assert.ok(String(r.rendered.text || "").trim());
  assert.match(r.rendered.text, /permiso de trabajo|autoriz/i);
});

test("Miami, Florida completes location in one turn", () => {
  const r = turn("Miami, Florida", locationAskContext());
  assert.equal(r.interpretation.intent, "provide_location");
  assert.equal(r.interpretation.entities.completeness, "complete");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.attention.needsHumanAttention, false);
  assert.ok(String(r.rendered.text || "").trim());
  assert.match(r.rendered.text, /permiso de trabajo|autoriz/i);
});

test("resolved confirmed state cannot regress on a later state-only token", () => {
  const confirmed = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText: "¿Tienes permiso de trabajo?"
    }
  });
  const r = turn("Texas", confirmed);
  assert.notEqual(r.nextContext.knownFacts.state, "TX");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.stateCertainty, "confirmed");
  assert.ok(String(r.rendered.text || "").trim(), "silent terminal without reason");
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
});

test("no silent terminal: state-only always has a customer reply and explicit reason", () => {
  const r = turn(
    "Florida",
    createConversationContext({
      preferredLanguage: "spanish",
      conversation: { lastQuestionAsked: "clarify_once", clarificationCount: 1 }
    })
  );
  assertActiveAskCity(r);
  assert.ok(r.structuredDecision.reasonCodes.includes("STATE_ONLY_LOCATION"));
  assert.ok(r.structuredDecision.reasonCodes.includes("PARTIAL_LOCATION"));
});
