/**
 * BR-173 — location facts may arrive in any order.
 * Spanish/English South Carolina and common city misspellings must merge,
 * then Atlas must not re-ask city or state.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseLocationAnswer,
  normalizeStateToken
} = require("../core/recruitAiV2/locationFacts");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  asksAlreadyResolvedFact
} = require("../core/recruitAiV2/globalConversationCoherenceGuard");

const FIXED_NOW = new Date("2026-08-29T19:15:00.000-04:00");

function locationAskContext() {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado te encuentras?"
    }
  });
}

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function assertCompleteBlufftonSc(facts, label) {
  assert.equal(facts.city, "Bluffton", label);
  assert.equal(facts.state, "SC", label);
  assert.equal(facts.cityCertainty, "confirmed", label);
  assert.equal(facts.stateCertainty, "confirmed", label);
}

function assertDidNotAskState(result, label) {
  assert.notEqual(result.nextContext.conversation.lastQuestionAsked, "ask_state", label);
  assert.notEqual(result.structuredDecision.customerReplyPlan.templateKey, "ask_state", label);
  assert.doesNotMatch(
    result.rendered.text,
    /en qu[eé] estado queda esa ciudad|which state/i,
    label
  );
}

test("Sur carolina and Carolina del Sur normalize to SC, not a city", () => {
  for (const phrase of [
    "Sur carolina",
    "Sur Carolina",
    "south carolina",
    "South Carolina",
    "carolina del sur"
  ]) {
    assert.equal(normalizeStateToken(phrase), "SC", phrase);
    const parsed = parseLocationAnswer(phrase);
    assert.equal(parsed?.completeness, "state_only", phrase);
    assert.equal(parsed?.state, "SC", phrase);
    assert.equal(parsed?.city, null, phrase);
  }
});

test("Bluftton fuzzy-canonicalizes to Bluffton without inventing a state", () => {
  const typo = parseLocationAnswer("Bluftton");
  assert.equal(typo?.city, "Bluffton");
  assert.equal(typo?.completeness, "partial");
  assert.equal(typo?.state, null);

  const exact = parseLocationAnswer("Bluffton");
  assert.equal(exact?.city, "Bluffton");
  assert.equal(exact?.state, null);
});

test("Bluffton, South Carolina is complete in one turn", () => {
  const parsed = parseLocationAnswer("Bluffton, South Carolina");
  assert.equal(parsed?.city, "Bluffton");
  assert.equal(parsed?.state, "SC");
  assert.equal(parsed?.completeness, "complete");

  const r = turn("Bluffton, South Carolina", locationAskContext());
  assertCompleteBlufftonSc(r.nextContext.knownFacts, "comma form");
  assertDidNotAskState(r, "comma form");
  assert.equal(asksAlreadyResolvedFact("ask_state", r.nextContext), true);
  assert.equal(asksAlreadyResolvedFact("ask_location", r.nextContext), true);
});

test("Sur carolina → Bluftton merges state-first then city", () => {
  const first = turn("Sur carolina", locationAskContext());
  assert.equal(first.interpretation.entities.completeness, "state_only");
  assert.equal(first.nextContext.knownFacts.state, "SC");
  assert.equal(first.nextContext.knownFacts.city, null);
  assert.equal(first.nextContext.conversation.lastQuestionAsked, "ask_city");
  assertDidNotAskState(first, "state-first first turn");

  const second = turn("Bluftton", first.nextContext);
  assertCompleteBlufftonSc(second.nextContext.knownFacts, "state then city");
  assertDidNotAskState(second, "state then city");
  assert.notEqual(second.nextContext.conversation.lastQuestionAsked, "ask_city");
  assert.equal(asksAlreadyResolvedFact("ask_state", second.nextContext), true);
  assert.equal(asksAlreadyResolvedFact("ask_city", second.nextContext), true);
});

test("Bluftton → Sur Carolina merges city-first then state", () => {
  const first = turn("Bluftton", locationAskContext());
  assert.equal(first.nextContext.knownFacts.city, "Bluffton");
  assert.equal(first.nextContext.knownFacts.state, null);
  assert.equal(first.nextContext.conversation.lastQuestionAsked, "ask_state");

  const second = turn("Sur Carolina", first.nextContext);
  assertCompleteBlufftonSc(second.nextContext.knownFacts, "city then state");
  assertDidNotAskState(second, "city then state");
  assert.equal(asksAlreadyResolvedFact("ask_state", second.nextContext), true);
  assert.equal(asksAlreadyResolvedFact("ask_location", second.nextContext), true);
});

test("state-first multi-turn location (Florida then Jacksonville) still completes", () => {
  const first = turn("Florida", locationAskContext());
  assert.equal(first.nextContext.knownFacts.state, "FL");
  assert.equal(first.nextContext.knownFacts.city, null);
  assert.equal(first.nextContext.conversation.lastQuestionAsked, "ask_city");

  const second = turn("Jacksonville", first.nextContext);
  assert.equal(second.nextContext.knownFacts.city, "Jacksonville");
  assert.equal(second.nextContext.knownFacts.state, "FL");
  assert.equal(second.nextContext.knownFacts.cityCertainty, "confirmed");
  assertDidNotAskState(second, "FL then Jacksonville");
});

test("repeated state must not trigger another state question", () => {
  const first = turn("Sur carolina", locationAskContext());
  assert.equal(first.nextContext.knownFacts.state, "SC");
  assert.equal(first.nextContext.conversation.lastQuestionAsked, "ask_city");

  const repeat = turn("Sur Carolina", first.nextContext);
  assert.equal(repeat.nextContext.knownFacts.state, "SC");
  assert.equal(repeat.nextContext.knownFacts.city, null);
  assert.equal(repeat.nextContext.conversation.lastQuestionAsked, "ask_city");
  assertDidNotAskState(repeat, "repeated state");
  assert.equal(asksAlreadyResolvedFact("ask_state", repeat.nextContext), true);
  assert.equal(asksAlreadyResolvedFact("ask_city", repeat.nextContext), false);
});

test("BR-166 allows ask_state only while state is unresolved", () => {
  assert.equal(
    asksAlreadyResolvedFact("ask_state", {
      knownFacts: { city: "Sur Carolina", state: null }
    }),
    false
  );
  assert.equal(
    asksAlreadyResolvedFact("ask_state", {
      knownFacts: { city: "Bluffton", state: "SC" }
    }),
    true
  );
});
