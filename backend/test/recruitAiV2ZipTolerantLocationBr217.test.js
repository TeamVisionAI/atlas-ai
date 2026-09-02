/**
 * BR-217 — trailing US ZIP must not break city/state location parse.
 * City + state remain sufficient. ZIP is optional knownFacts.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseLocationAnswer,
  extractTrailingUsZip
} = require("../core/recruitAiV2/locationFacts");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");

const FIXED_NOW = new Date("2026-09-02T16:33:00.000-04:00");

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

function assertHialeahFl(parsed, label, zip = null) {
  assert.equal(parsed?.city, "Hialeah", label);
  assert.equal(parsed?.state, "FL", label);
  assert.equal(parsed?.completeness, "complete", label);
  if (zip) {
    assert.equal(parsed?.zip, zip, label);
  }
}

test("A) City State ZIP", () => {
  const parsed = parseLocationAnswer("Hialeah FL 33010");
  assertHialeahFl(parsed, "Hialeah FL 33010", "33010");
});

test("B) City full-state ZIP", () => {
  const parsed = parseLocationAnswer("Hialeah florida 33010");
  assertHialeahFl(parsed, "Hialeah florida 33010", "33010");
});

test("C) comma city/state ZIP", () => {
  const parsed = parseLocationAnswer("Hialeah, FL 33010");
  assertHialeahFl(parsed, "Hialeah, FL 33010", "33010");
});

test("D) ZIP+4", () => {
  const parsed = parseLocationAnswer("Hialeah, FL 33010-1234");
  assertHialeahFl(parsed, "ZIP+4", "33010-1234");
});

test("E) typo city + state + ZIP", () => {
  const parsed = parseLocationAnswer("Hialiah florida 33010");
  assertHialeahFl(parsed, "Perssy inbound", "33010");
});

test("F) city/state without ZIP still works", () => {
  assertHialeahFl(parseLocationAnswer("Hialeah FL"), "Hialeah FL");
  assertHialeahFl(parseLocationAnswer("Hialiah florida"), "Hialiah florida");
  assert.equal(parseLocationAnswer("Hialeah FL")?.zip, undefined);
});

test("G) invalid ZIP alone does not become location", () => {
  assert.equal(parseLocationAnswer("33010"), null);
  assert.equal(parseLocationAnswer("33010-1234"), null);
  assert.deepEqual(extractTrailingUsZip("33010"), { text: "", zip: "33010" });
});

test("H) arbitrary numeric text does not become location", () => {
  assert.equal(parseLocationAnswer("3057633125"), null);
  assert.equal(parseLocationAnswer("123"), null);
  assert.equal(parseLocationAnswer("call 5551212"), null);
});

test("I) work-auth follows successful location", () => {
  const r = turn("Hialiah florida 33010", locationAskContext());
  assert.equal(r.interpretation.intent, "provide_location");
  assert.equal(r.interpretation.entities.city, "Hialeah");
  assert.equal(r.interpretation.entities.state, "FL");
  assert.equal(r.interpretation.entities.zip, "33010");
  assert.equal(r.nextContext.knownFacts.city, "Hialeah");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.knownFacts.zip, "33010");
  assert.equal(r.nextContext.knownFacts.cityCertainty, "confirmed");
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_authorization");
  assert.equal(
    r.structuredDecision.customerReplyPlan.templateKey,
    "continue_qualification_after_location"
  );
  assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
  assert.match(r.rendered.text, /permiso de trabajo|documentaci[oó]n legal/i);
});

test("J) clarify_once only when location truly unresolved", () => {
  const miss = turn("33010", locationAskContext());
  assert.equal(miss.interpretation.entities?.city, null);
  assert.notEqual(miss.interpretation.entities?.completeness, "complete");
  assert.equal(miss.nextContext.knownFacts.city, null);
  assert.equal(miss.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
  assert.match(miss.rendered.text, /dato que te acabo de pedir/i);

  const hit = turn("Hialeah, FL 33010", locationAskContext());
  assert.equal(hit.structuredDecision.customerReplyPlan.templateKey, "continue_qualification_after_location");
  assert.doesNotMatch(hit.rendered.text, /dato que te acabo de pedir/i);
});

test("Perssy inbound normalizes to Hialeah, FL, 33010", () => {
  const parsed = parseLocationAnswer("Hialiah florida 33010");
  assert.deepEqual(
    {
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip
    },
    { city: "Hialeah", state: "FL", zip: "33010" }
  );
});
