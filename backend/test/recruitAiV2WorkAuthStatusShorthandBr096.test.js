/**
 * Recruit AI v2 — pending work-auth status shorthand (BR-096)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
const {
  resolveContextCaptureConfig
} = require("../core/recruitAiV2/contextCaptureConfig");
const { runRecruitAiV2ScenarioById } = require("../dev/recruitAiV2ScenarioPack");

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

const SHORTHANDS = [
  "residente",
  "ciudadano",
  "ciudadana",
  "residente permanente",
  "ciudadano americano",
  "ciudadana americana",
  "RESIDENTE",
  "Ciudadano!",
  "soy residente",
  "soy ciudadana",
  "nací aquí",
  "naci aqui",
  "yo nací aquí",
  "yo naci aqui",
  "nací en Estados Unidos",
  "naci en Estados Unidos",
  "nací en USA",
  "born here",
  "I was born here",
  "I was born in the US"
];

for (const text of SHORTHANDS) {
  test(`pending auth: "${text}" satisfies work authorization`, () => {
    assert.equal(
      parseWorkAuthorizationAnswer(text, {
        conversation: { lastQuestionAsked: "ask_authorization" }
      }),
      WORK_AUTHORIZATION.AUTHORIZED
    );
    const r = turn(text, authPendingContext());
    assert.equal(r.interpretation.intent, "provide_authorization");
    assert.equal(r.nextContext.knownFacts.workAuthorization, true);
    assert.equal(r.nextContext.knownFacts.workAuthorizationStatus, "authorized");
    assert.notEqual(r.interpretation.intent, "provide_location");
    assert.notEqual(r.interpretation.intent, "correct_location");
    assert.doesNotMatch(
      r.rendered.text,
      /permiso de trabajo|documentaci[oó]n legal|ciudad y estado|which city/i
    );
  });
}

test("outside pending auth, bare born-here does not invent authorization", () => {
  assert.equal(
    parseWorkAuthorizationAnswer("nací aquí", {
      conversation: { lastQuestionAsked: "ask_day_part" }
    }),
    null
  );
});

test("outside pending auth, bare residente does not invent authorization", () => {
  assert.equal(
    parseWorkAuthorizationAnswer("residente", {
      conversation: { lastQuestionAsked: "ask_location" }
    }),
    null
  );
  const r = turn(
    "residente",
    authPendingContext({
      conversation: {
        lastQuestionAsked: "ask_location",
        lastAtlasOutboundText: "¿En qué ciudad y estado vives?"
      }
    })
  );
  assert.notEqual(r.interpretation.intent, "provide_authorization");
  assert.notEqual(r.nextContext.knownFacts.workAuthorization, true);
});

test("license-only still does not satisfy work auth", () => {
  assert.equal(
    parseWorkAuthorizationAnswer("tengo licencia", {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    null
  );
});

test("side effects denied; posture defaults fail-closed", () => {
  const r = turn("residente", authPendingContext());
  const auth = authorizeSideEffects({
    interpretation: r.interpretation,
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
  assert.equal(isExecutionEnabled({}), false);
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
});

test("BR-090 / BR-091 / BR-094 regressions", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("puerto-rico-fixed-employment-real-world").pass,
    true
  );
  assert.equal(runRecruitAiV2ScenarioById("direct-no-interest-withdrawal").pass, true);
  assert.equal(
    runRecruitAiV2ScenarioById("city-state-abbreviation-normalization").pass,
    true
  );
});

test("docs exist", () => {
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/24_WORK_AUTH_STATUS_SHORTHAND.md"
  );
  assert.equal(fs.existsSync(doc), true);
});
