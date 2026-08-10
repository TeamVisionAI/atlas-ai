/**
 * Location order variants — state-first / city-first natural Spanish/English forms.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");

function locationAskContext() {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
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

function assertCompleteJacksonville(parsed, label) {
  assert.ok(parsed, label);
  assert.equal(parsed.city, "Jacksonville", label);
  assert.equal(parsed.state, "FL", label);
  assert.equal(parsed.completeness, "complete", label);
  assert.equal(parsed.requiresClarification, false, label);
}

test("exact real phrase Florida Jacksonville → Jacksonville, FL", () => {
  assertCompleteJacksonville(parseLocationAnswer("Florida Jacksonville"), "parse");
  const r = turn("Florida Jacksonville", locationAskContext());
  assert.equal(r.nextContext.knownFacts.city, "Jacksonville");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.doesNotMatch(
    r.rendered.text,
    /en qu[eé] estado est[aá] Florida Jacksonville|which state is Florida Jacksonville/i
  );
});

test("reversed order Jacksonville Florida", () => {
  assertCompleteJacksonville(parseLocationAnswer("Jacksonville Florida"), "parse");
});

test("Jacksonville, FL and Jacksonville, Florida", () => {
  assertCompleteJacksonville(parseLocationAnswer("Jacksonville, FL"), "abbr");
  assertCompleteJacksonville(parseLocationAnswer("Jacksonville, Florida"), "full");
});

test("Vivo en Jacksonville Florida", () => {
  assertCompleteJacksonville(parseLocationAnswer("Vivo en Jacksonville Florida"), "vivo");
});

test("existing miami fl remains complete", () => {
  const parsed = parseLocationAnswer("miami fl");
  assert.equal(parsed.city, "Miami");
  assert.equal(parsed.state, "FL");
  assert.equal(parsed.completeness, "complete");
});

test("Tarde mejor is not a location", () => {
  assert.equal(parseLocationAnswer("Tarde mejor"), null);
  assert.equal(parseLocationAnswer("Mañana mejor"), null);
});

test("no clarification when city+state confidently resolved", () => {
  const r = turn("Florida Jacksonville", locationAskContext());
  assert.notEqual(r.structuredDecision.decision.nextAction, "clarify_once");
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, "ask_state");
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, "ask_location");
});

test("execution remains OFF", () => {
  assert.equal(isExecutionEnabled({}), false);
});
