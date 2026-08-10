/**
 * Mid-flow pending ask_authorization + job FAQ compounds
 * (BR-088 / BR-096 / BR-097 / BR-098 family).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");

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

function authPendingContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    ...overrides,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL",
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
      ...(overrides.conversation || {})
    }
  });
}

const REAL_UTTERANCE = "Soy ciudadana dime como es el  trabajo";

test("exact real utterance: auth + job FAQ, no clarify_once, no re-ask auth", () => {
  const r = turn(REAL_UTTERANCE, authPendingContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(r.interpretation.entities.workAuthorization, true);
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.equal(r.nextContext.knownFacts.workAuthorizationStatus, "authorized");
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "answer_job_opportunity_then_resume"
  );
  assert.notEqual(r.structuredDecision.decision.nextAction, "clarify_once");
  assert.doesNotMatch(
    r.rendered.text,
    /puedes compartir el dato que te acabo de pedir|permiso de trabajo|documentaci[oó]n legal/i
  );
  assert.match(r.rendered.text, /mañana|tarde|entrevista|trabajo|oportunidad/i);
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part");
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, "ask_authorization");
});

test("citizen only still provide_authorization", () => {
  const r = turn("Soy ciudadana", authPendingContext());
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.doesNotMatch(r.rendered.text, /permiso de trabajo|documentaci[oó]n legal/i);
});

test("resident + FAQ compound", () => {
  const r = turn(
    "Soy residente y quiero saber de que se trata",
    authPendingContext()
  );
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(r.interpretation.entities.workAuthorization, true);
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.notEqual(r.structuredDecision.decision.nextAction, "clarify_once");
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part");
});

test("FAQ only while auth pending resumes authorization ask", () => {
  const r = turn("dime como es el trabajo", authPendingContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(r.interpretation.entities.workAuthorization, undefined);
  assert.notEqual(r.nextContext.knownFacts.workAuthorization, true);
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_authorization");
  assert.match(r.rendered.text, /permiso|documentaci|autoriz/i);
  assert.notEqual(r.structuredDecision.decision.nextAction, "clarify_once");
});

test("negated/ambiguous authorization remains safe in compounds", () => {
  const pending = { conversation: { lastQuestionAsked: "ask_authorization" } };
  assert.equal(
    parseWorkAuthorizationAnswer(
      "soy ciudadana pero no tengo permiso",
      pending
    ),
    WORK_AUTHORIZATION.NOT_AUTHORIZED
  );
  assert.equal(
    parseWorkAuthorizationAnswer("no soy ciudadana dime como es el trabajo", pending),
    null
  );
  assert.equal(
    parseWorkAuthorizationAnswer("tengo visa dime como es el trabajo", pending),
    null
  );
  assert.equal(
    parseWorkAuthorizationAnswer("el trabajo es para ciudadanos", pending),
    null
  );

  const r = turn(
    "soy ciudadana pero no tengo permiso dime como es el trabajo",
    authPendingContext()
  );
  assert.notEqual(r.nextContext.knownFacts.workAuthorization, true);
});

test("no duplicate reply ownership / execution stays OFF", () => {
  const r = turn(REAL_UTTERANCE, authPendingContext());
  assert.equal(isExecutionEnabled({}), false);
  assert.equal(resolveShadowConfig({}).enabled, false);
  const auth = authorizeSideEffects({
    interpretation: r.interpretation,
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "answer_job_opportunity_then_resume"
  );
  // Exactly one customer reply plan for this turn (no CE fallthrough double-speak).
  assert.equal(Boolean(r.rendered.text), true);
  assert.equal(r.structuredDecision.customerReplyPlan.templateKey.includes("job_"), true);
});

test("FAQ Spanish variants recognized", () => {
  for (const text of [
    "como es el trabajo",
    "cómo es el trabajo",
    "dime como es el trabajo",
    "dime cómo es el trabajo",
    "de que se trata el trabajo",
    "de qué se trata el trabajo",
    "como funciona el trabajo",
    "cómo funciona el trabajo"
  ]) {
    const r = turn(text, authPendingContext());
    assert.equal(
      r.interpretation.intent,
      "job_opportunity_question",
      text
    );
    assert.notEqual(r.structuredDecision.decision.nextAction, "clarify_once", text);
  }
});
