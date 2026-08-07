/**
 * Recruit AI v2 — playground feedback fix (fact correction, questions, continuity).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack,
  listRecruitAiV2Scenarios
} = require("../dev/recruitAiV2ScenarioPack");
const {
  createPlaygroundSession,
  sendPlaygroundTurn,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, ...options }
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

test("1. Digo vivo en Doral corrects Miami and keeps FL", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("Digo, vivo en Doral", context);
  assert.equal(result.interpretation.intent, "correct_location");
  assert.equal(result.nextContext.knownFacts.city, "Doral");
  assert.equal(result.nextContext.knownFacts.state, "FL");
  assert.notEqual(result.nextContext.knownFacts.city, "Miami");
  assert.match(result.rendered.text, /Doral/i);
  assert.match(result.rendered.text, /permiso/i);
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("2. Actually I live in Tampa corrects city", () => {
  const context = createConversationContext({
    preferredLanguage: "english",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("Actually I live in Tampa", context);
  assert.equal(result.interpretation.intent, "correct_location");
  assert.equal(result.nextContext.knownFacts.city, "Tampa");
  assert.equal(result.nextContext.knownFacts.state, "FL");
});

test("3. No, Doral correction", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("No, Doral", context);
  assert.equal(result.interpretation.intent, "correct_location");
  assert.equal(result.nextContext.knownFacts.city, "Doral");
});

test("4. Me equivoqué, Orlando correction", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("Me equivoqué, Orlando", context);
  assert.equal(result.interpretation.intent, "correct_location");
  assert.equal(result.nextContext.knownFacts.city, "Orlando");
});

test("5. correction during pending unrelated question still updates fact", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("Digo, vivo en Doral", context);
  assert.equal(result.nextContext.conversation.lastQuestionAsked, "ask_authorization");
  assert.equal(result.structuredDecision.decision.nextAction, "acknowledge_correction_then_resume");
});

test("6. Si tengo permiso continues with next canonical question", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Doral",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("Si tengo permiso", context);
  assert.equal(result.interpretation.intent, "provide_authorization");
  assert.equal(result.nextContext.knownFacts.workAuthorization, true);
  assert.match(result.rendered.text, /mañana|tarde/i);
  assert.doesNotMatch(result.rendered.text, /Continuemos\.?$/);
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("7. What is this about answers and does not hand off", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation", spanishEvidenceCount: 2 },
    knownFacts: {
      city: "Doral",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true
    },
    conversation: { lastQuestionAsked: "ask_day_part", clarificationCount: 1 }
  });
  const result = turn("What is this about?", context);
  assert.equal(result.interpretation.intent, "job_opportunity_question");
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
  assert.match(result.rendered.text, /servicios financieros/i);
  assert.doesNotMatch(result.rendered.text, /compañero de Team Vision te contactará/);
  assert.equal(result.nextContext.preferredLanguage, "spanish");
});

test("8. direct question during scheduling does not escalate", () => {
  const context = createConversationContext({
    preferredLanguage: "english",
    currentStage: "proposed",
    appointment: { status: "proposed" },
    conversation: { lastQuestionAsked: "confirm_slot" }
  });
  const result = turn("Is this insurance?", context);
  // BR-083: insurance has its own FAQ intent (still no handoff).
  assert.equal(result.interpretation.intent, "insurance_question");
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("9. question answered then pending flow resumed", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    knownFacts: {
      city: "Doral",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true
    },
    conversation: { lastQuestionAsked: "ask_day_part" }
  });
  const result = turn("¿De qué se trata?", context);
  assert.match(result.rendered.text, /mañana|tarde/i);
  assert.equal(result.nextContext.conversation.lastQuestionAsked, "ask_day_part");
});

test("10. handoff only when explicit human_required path", () => {
  const context = createConversationContext({
    preferredLanguage: "english",
    conversation: {
      clarificationCount: 2,
      pendingClarification: "clarify_once"
    }
  });
  const result = turn("asdfgh", context);
  // Low-confidence repeated ambiguity may escalate; first-class FAQ must not.
  const faq = turn("What is this about?", {
    ...context,
    conversation: { clarificationCount: 0, lastQuestionAsked: "ask_location" }
  });
  assert.equal(faq.structuredDecision.decision.shouldEscalate, false);
  assert.ok(result.structuredDecision.decision.nextAction);
});

test("11. single English question does not flip Spanish conversation", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation", spanishEvidenceCount: 2 }
  });
  const result = turn("What is this about?", context);
  assert.equal(result.nextContext.preferredLanguage, "spanish");
});

test("12. explicit language-switch request does flip language", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    knownFacts: {
      city: "Doral",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("Can we continue in English?", context);
  assert.equal(result.interpretation.intent, "request_language_switch");
  assert.equal(result.nextContext.preferredLanguage, "english");
});

test("13. regression scenario Fact Correction + Mid-Flow Question", () => {
  const report = runRecruitAiV2ScenarioById("fact-correction-mid-flow-question");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.map((t) => t.failures)));
  assert.equal(report.turns[2].actual.city, "Doral");
  assert.equal(report.turns[3].actual.workAuthorization, true);
  assert.equal(report.turns[4].actual.shouldEscalate, false);
  assert.equal(report.turns[4].preferredLanguage, "spanish");
});

test("14. full playground reproduction has no handoff", () => {
  _resetPlaygroundStoreForTests();
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  const turns = [];
  for (const text of [
    "Hola",
    "Miami, florida",
    "Digo, vivo en Doral",
    "Si tengo permiso",
    "What is this about?"
  ]) {
    turns.push(sendPlaygroundTurn(session.sessionId, { text }));
  }
  assert.equal(turns[2].context.knownFacts.city, "Doral");
  assert.equal(turns[3].context.knownFacts.workAuthorization, true);
  assert.equal(turns[4].turn.diagnostics.humanEscalationState, false);
  assert.equal(turns[4].turn.diagnostics.preferredConversationLanguage, "spanish");
  assert.match(turns[4].turn.atlasProposedReply, /servicios financieros/i);
  assert.doesNotMatch(
    turns[4].turn.atlasProposedReply,
    /compañero de Team Vision te contactará para el siguiente paso/
  );
});

test("15. existing scenario pack still green including new scenario", async () => {
  const listed = listRecruitAiV2Scenarios();
  assert.ok(listed.some((s) => s.id === "fact-correction-mid-flow-question"));
  assert.ok(listed.length >= 17);
  const suite = await runAllRecruitAiV2ScenarioPack();
  assert.equal(suite.failed, 0, JSON.stringify(suite.reports?.filter((r) => !r.pass).map((r) => r.scenarioId)));
});
