/**
 * Recruit AI v2 — dead-end acknowledgment fix (Claudia / Fort Myers production stall).
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
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const {
  enforceQualificationNoDeadEnd,
  isAcknowledgmentOnlyReply
} = require("../core/recruitAiV2/qualificationProgressGuard");
const { INTENTS } = require("../core/recruitAiV2/constants");

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true }
  });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  const responsePlan = structuredDecision.customerReplyPlan;
  let rendered = renderCustomerReply(responsePlan);
  const guarded = enforceQualificationNoDeadEnd({
    rendered,
    responsePlan,
    structuredDecision,
    context
  });
  rendered = guarded.rendered;
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision: guarded.structuredDecision
  });
  return {
    interpretation,
    structuredDecision: guarded.structuredDecision,
    nextContext,
    rendered
  };
}

test("production: En Fort Myers is location, not name", () => {
  const parsed = parseLocationAnswer("En Fort Myers");
  assert.equal(parsed?.completeness, "complete");
  assert.equal(parsed?.city, "Fort Myers");
  assert.equal(parsed?.state, "FL");

  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    conversation: { lastQuestionAsked: "ask_location" }
  });
  const result = turn("En Fort Myers", ctx);
  assert.equal(result.interpretation.intent, INTENTS.PROVIDE_LOCATION);
  assert.notEqual(result.interpretation.intent, INTENTS.PROVIDE_NAME);
  assert.match(result.rendered.text, /permiso de trabajo|documentación legal/i);
  assert.doesNotMatch(result.rendered.text, /Continuemos\.?\s*$/i);
  assert.equal(result.nextContext.knownFacts.city, "Fort Myers");
  assert.equal(result.nextContext.knownFacts.state, "FL");
  assert.equal(result.nextContext.conversation.lastQuestionAsked, "ask_authorization");
});

for (const [input, expectedCity] of [
  ["Miami", "Miami"],
  ["Fort Myers", "Fort Myers"],
  ["Kendall", "Kendall"],
  ["WPB", "West Palm Beach"]
]) {
  test(`location ${input} → next qualification question`, () => {
    let ctx = createConversationContext({
      preferredLanguage: "spanish",
      currentStage: "qualification"
    });
    ctx = turn("Hola", ctx).nextContext;
    const result = turn(input, ctx);
    assert.equal(result.nextContext.knownFacts.state, "FL");
    assert.equal(result.nextContext.knownFacts.city, expectedCity);
    assert.match(result.rendered.text, /permiso de trabajo|documentación legal/i);
    assert.doesNotMatch(result.rendered.text, /Continuemos\.?\s*$/i);
  });
}

test("Springfield remains ambiguous (asks state)", () => {
  const parsed = parseLocationAnswer("Springfield");
  assert.equal(parsed?.completeness, "partial");
  assert.equal(parsed?.proposedState, null);
});

test("known location + work authorization known → day-part", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Fort Myers",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    },
    conversation: { lastQuestionAsked: "ask_day_part" }
  });
  const result = turn("Sí", ctx);
  assert.match(result.rendered.text, /mañana|tarde|morning|afternoon/i);
  assert.doesNotMatch(result.rendered.text, /Continuemos\.?\s*$/i);
});

test("acknowledgment-only renderer blocked by invariant", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    conversation: { lastQuestionAsked: "ask_location" }
  });
  const structuredDecision = {
    decision: { nextAction: "continue_qualification", shouldEscalate: false },
    customerReplyPlan: {
      templateKey: "continue_qualification",
      language: "spanish",
      entities: {}
    },
    reasonCodes: []
  };
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  assert.ok(isAcknowledgmentOnlyReply("Gracias — eso ayuda. Continuemos."));
  const repaired = enforceQualificationNoDeadEnd({
    rendered,
    responsePlan: structuredDecision.customerReplyPlan,
    structuredDecision,
    context: ctx
  });
  assert.match(repaired.rendered.text, /ciudad y estado|permiso de trabajo/i);
  assert.doesNotMatch(repaired.rendered.text, /Continuemos\.?\s*$/i);
});

test("Claudia ad-lead sequence reproduces fix after En Fort Myers", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification"
  });
  ctx = turn("¡Hola! Quiero más información. TVR-0826-A7K4", ctx).nextContext;
  const fortMyers = turn("En Fort Myers", ctx);
  assert.match(fortMyers.rendered.text, /permiso de trabajo|documentación legal/i);
  assert.equal(fortMyers.nextContext.knownFacts.city, "Fort Myers");
  assert.equal(fortMyers.nextContext.knownFacts.state, "FL");
});
