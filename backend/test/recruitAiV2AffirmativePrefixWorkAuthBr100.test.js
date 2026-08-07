/**
 * Recruit AI v2 — affirmative-prefix work authorization (BR-100)
 * "si soy ciudadano" must authorize, never schedule_confirm/handoff.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");
const AUTH_CTX = { conversation: { lastQuestionAsked: "ask_authorization" } };

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
    },
    ...overrides
  });
}

const AFFIRMATIVE_PREFIX_AUTH = [
  "si soy ciudadano",
  "sí soy ciudadano",
  "sí, soy ciudadano",
  "claro, soy ciudadano",
  "si soy ciudadana",
  "si soy residente",
  "sí, soy residente permanente",
  "yes I'm a citizen",
  "yes, I'm a citizen",
  "yes I am a resident"
];

for (const [i, text] of AFFIRMATIVE_PREFIX_AUTH.entries()) {
  test(`${i + 1}. ${text}`, () => {
    assert.equal(
      parseWorkAuthorizationAnswer(text, AUTH_CTX),
      WORK_AUTHORIZATION.AUTHORIZED
    );
    const r = turn(text, authPendingContext({
      preferredLanguage: /yes/i.test(text) ? "english" : "spanish"
    }));
    assert.equal(r.interpretation.intent, "provide_authorization");
    assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  });
}

test("11. affirmative-prefix status → auth satisfied", () => {
  const r = turn("si soy ciudadano", authPendingContext());
  assert.equal(r.nextContext.knownFacts.workAuthorizationStatus, "authorized");
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "capture_authorization_continue"
  );
});

test("12. no handoff", () => {
  const r = turn("si soy ciudadano", authPendingContext());
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.doesNotMatch(
    r.rendered.text,
    /compa[nñ]ero|human|finalizará los detalles|contactar[aá]/i
  );
});

test("13. no terminal state", () => {
  const r = turn("si soy ciudadano", authPendingContext());
  assert.notEqual(r.structuredDecision.decision.nextAction, "create_appointment");
  assert.notEqual(r.interpretation.intent, "schedule_confirm");
  assert.notEqual(r.nextContext.currentStage, "completed");
});

test("14. pending workflow continues", () => {
  const r = turn("si soy ciudadano", authPendingContext());
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part");
  assert.match(r.rendered.text, /mañana o en la tarde|morning or afternoon/i);
});

test("15. negative mixed phrase does not authorize", () => {
  for (const text of [
    "si, pero no tengo permiso",
    "sí, estoy esperando el permiso",
    "yes, but I'm not authorized yet"
  ]) {
    assert.equal(
      parseWorkAuthorizationAnswer(text, AUTH_CTX),
      WORK_AUTHORIZATION.NOT_AUTHORIZED,
      text
    );
  }
});

test("16. ambiguous visa still clarifies", () => {
  assert.equal(parseWorkAuthorizationAnswer("si tengo visa", AUTH_CTX), null);
  assert.equal(parseWorkAuthorizationAnswer("tengo visa", AUTH_CTX), null);
});

test("17. BR-096 base forms preserved", () => {
  for (const text of [
    "ciudadano",
    "ciudadana",
    "soy ciudadano",
    "residente",
    "soy residente",
    "residente permanente",
    "nací aquí",
    "soy de PR",
    "born here",
    "US citizen"
  ]) {
    assert.equal(
      parseWorkAuthorizationAnswer(text, AUTH_CTX),
      WORK_AUTHORIZATION.AUTHORIZED,
      text
    );
  }
});

test("18. BR-095 normalization preserved", () => {
  for (const text of [
    "SI SOY CIUDADANO",
    "Sí, Soy Ciudadano!",
    "si soy ciudadano"
  ]) {
    assert.equal(
      parseWorkAuthorizationAnswer(text, AUTH_CTX),
      WORK_AUTHORIZATION.AUTHORIZED,
      text
    );
    const r = turn(text, authPendingContext());
    assert.equal(r.interpretation.entities.rawText, text);
  }
});

test("19. BR-099 preserved", () => {
  const dayPart = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
    }
  });
  const r = turn("no se vender", dayPart);
  assert.equal(r.interpretation.intent, "sales_objection");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
});

test("20. full cross-BR suite + regression conversations", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW
  });
  for (const text of ["Hola", "Miami", "si", "si soy ciudadano"]) {
    const r = turn(text, ctx);
    ctx = r.nextContext;
  }
  assert.equal(ctx.knownFacts.city, "Miami");
  assert.equal(ctx.knownFacts.state, "FL");
  assert.equal(ctx.knownFacts.workAuthorization, true);
  assert.equal(ctx.conversation.lastQuestionAsked, "ask_day_part");

  let ctx2 = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW
  });
  for (const text of ["Hola", "Miami FL", "sí, soy residente"]) {
    const r = turn(text, ctx2);
    ctx2 = r.nextContext;
  }
  assert.equal(ctx2.knownFacts.workAuthorization, true);
  assert.equal(ctx2.conversation.lastQuestionAsked, "ask_day_part");

  assert.equal(
    runRecruitAiV2ScenarioById("sales-objection-not-location").pass,
    true
  );
  assert.equal(
    runRecruitAiV2ScenarioById("faq-priority-experience-insurance").pass,
    true
  );
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));

  const auth = authorizeSideEffects({
    structuredDecision: turn("si soy ciudadano", authPendingContext())
      .structuredDecision
  });
  assert.equal(auth.authorized, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("docs exist", () => {
  const root = path.join(__dirname, "../../docs");
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "03-engineering/recruit-ai-v2/28_AFFIRMATIVE_PREFIX_WORK_AUTH.md"
      )
    )
  );
  const rules = fs.readFileSync(
    path.join(root, "06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-100/);
});
