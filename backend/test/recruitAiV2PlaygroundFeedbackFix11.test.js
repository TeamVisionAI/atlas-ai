/**
 * Recruit AI v2 — Playground Feedback Fix #11 (BR-099)
 * Sales skill / aversion objection recognition (not location correction).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  looksLikeSalesObjection,
  classifySalesObjectionKind
} = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");
const {
  resolveContextCaptureConfig
} = require("../core/recruitAiV2/contextCaptureConfig");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");
const {
  createPlaygroundSession,
  sendPlaygroundTurn,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW, ...options }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability: options.availability || null
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function dayPartPendingContext(overrides = {}) {
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
      workAuthorization: true,
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Excelente. Estamos realizando las entrevistas en nuestras oficinas. ¿Prefieres en la mañana o en la tarde?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function assertSales(text, kind = null) {
  assert.equal(looksLikeSalesObjection(text), true, text);
  const r = turn(text, dayPartPendingContext());
  assert.equal(r.interpretation.intent, "sales_objection", text);
  if (kind) {
    assert.equal(r.interpretation.entities.salesObjectionKind, kind, text);
  }
  return r;
}

test("1. no sé vender", () => {
  const r = assertSales("no sé vender", "skill");
  assert.match(r.rendered.text, /no necesitas saber vender/i);
});

test("2. no se vender", () => {
  const r = assertSales("no se vender", "skill");
  assert.doesNotMatch(r.rendered.text, /estado está Vender|corrección/i);
});

test("3. yo no sé vender", () => {
  assertSales("yo no sé vender", "skill");
});

test("4. no soy bueno vendiendo", () => {
  assertSales("no soy bueno vendiendo", "skill");
});

test("5. no soy buena vendiendo", () => {
  assertSales("no soy buena vendiendo", "skill");
});

test("6. nunca he vendido", () => {
  assertSales("nunca he vendido", "experience");
});

test("7. no tengo experiencia vendiendo", () => {
  const r = assertSales("no tengo experiencia vendiendo", "experience");
  assert.notEqual(r.interpretation.intent, "experience_question");
});

test("8. no me gusta vender", () => {
  const r = assertSales("no me gusta vender", "aversion");
  assert.match(r.rendered.text, /Entiendo/i);
  assert.doesNotMatch(r.rendered.text, /esto no es ventas|this is not sales/i);
});

test("9. no quiero vender", () => {
  assertSales("no quiero vender", "aversion");
});

test("10. vender no es lo mío", () => {
  assertSales("vender no es lo mío", "aversion");
});

test("11. I don't know how to sell", () => {
  const r = turn(
    "I don't know how to sell",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "sales_objection");
  assert.match(r.rendered.text, /don'?t need sales experience/i);
});

test("12. I'm not good at sales", () => {
  const r = turn(
    "I'm not good at sales",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "sales_objection");
  assert.equal(r.interpretation.entities.salesObjectionKind, "skill");
});

test("13. I've never sold anything", () => {
  const r = turn(
    "I've never sold anything",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.entities.salesObjectionKind, "experience");
});

test("14. I don't have sales experience", () => {
  const r = turn(
    "I don't have sales experience",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "sales_objection");
});

test("15. I don't like selling", () => {
  const r = turn(
    "I don't like selling",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.entities.salesObjectionKind, "aversion");
});

test("16. I don't want to sell", () => {
  const r = turn(
    "I don't want to sell",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.entities.salesObjectionKind, "aversion");
});

test("17. sales objection outranks correction handling", () => {
  const r = turn("no se vender", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "sales_objection");
  assert.notEqual(r.interpretation.intent, "correct_location");
  assert.ok(
    r.structuredDecision.reasonCodes.includes(
      "SALES_OBJECTION_OUTRANKS_CORRECTION"
    )
  );
  assert.doesNotMatch(r.rendered.text, /gracias por la corrección/i);
});

test("18. sales objection outranks location", () => {
  const r = turn("no se vender", dayPartPendingContext());
  assert.notEqual(r.interpretation.intent, "provide_location");
  assert.equal(r.interpretation.entities.city, null);
  assert.ok(r.structuredDecision.reasonCodes.includes("FAQ_OUTRANKS_LOCATION"));
});

test("19. no location mutation", () => {
  const r = turn("no se vender", dayPartPendingContext());
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(parseLocationAnswer("no se vender"), null);
  assert.notEqual(r.nextContext.knownFacts.city, "Vender");
});

test("20. pending workflow resumes", () => {
  const r = turn("no se vender", dayPartPendingContext());
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part");
  assert.match(r.rendered.text, /mañana o en la tarde/i);
  assert.doesNotMatch(r.rendered.text, /Continuemos\.?$/i);
});

test("21. no false this-is-not-sales claim", () => {
  for (const text of ["no me gusta vender", "no quiero vender", "I don't like selling"]) {
    const r = turn(
      text,
      dayPartPendingContext({
        preferredLanguage: /I don't/.test(text) ? "english" : "spanish"
      })
    );
    assert.doesNotMatch(
      r.rendered.text,
      /esto no es ventas|this is not sales|no involucra ventas|not involve selling/i
    );
  }
});

test("22. no income guarantee", () => {
  const r = turn("no se vender", dayPartPendingContext());
  assert.doesNotMatch(
    r.rendered.text,
    /garantiz|guarantee|ingreso asegurado|guaranteed income|\$\d/i
  );
});

test("23. BR-098 FAQ priority preserved", () => {
  const r = turn("¿Necesito experiencia?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "experience_question");
  const ins = turn("es de seguros", dayPartPendingContext());
  assert.equal(ins.interpretation.intent, "insurance_question");
});

test("24. BR-097 concise overview preserved", () => {
  const r = turn("de que se trata", dayPartPendingContext());
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "overview");
  assert.doesNotMatch(r.rendered.text, /asalariado|no se requiere experiencia/i);
});

test("25. BR-096 work-auth preserved", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
    }
  });
  const r = turn("residente", ctx);
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
});

test("26. BR-095 normalization preserved", () => {
  for (const text of [
    "no sé vender",
    "no se vender",
    "NO SE VENDER",
    "¡No sé vender!"
  ]) {
    const r = turn(text, dayPartPendingContext());
    assert.equal(r.interpretation.intent, "sales_objection", text);
    assert.equal(r.interpretation.entities.rawText, text);
    assert.equal(classifySalesObjectionKind(text), "skill");
  }
});

test("27. BR-094 location behavior preserved", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
    }
  });
  const r = turn("miami fl", ctx);
  assert.equal(r.interpretation.intent, "provide_location");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
});

test("28. simulator/playground regressions", () => {
  const report = runRecruitAiV2ScenarioById("sales-objection-not-location");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
  assert.equal(
    runRecruitAiV2ScenarioById("faq-priority-experience-insurance").pass,
    true
  );
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  const p = sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  assert.equal(p.turn.diagnostics.authorizationResult, "denied");
});

test("29-32. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById("sales-objection-not-location");
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
});

test("33. execution OFF", () => {
  assert.equal(isExecutionEnabled({}), false);
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  const r = turn("no se vender", dayPartPendingContext());
  const auth = authorizeSideEffects({ structuredDecision: r.structuredDecision });
  assert.equal(auth.authorized, false);
});

test("docs exist", () => {
  const root = path.join(__dirname, "../../docs");
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "03-engineering/recruit-ai-v2/27_SALES_OBJECTION_RECOGNITION.md"
      )
    )
  );
  const rules = fs.readFileSync(
    path.join(root, "06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-099/);
});
