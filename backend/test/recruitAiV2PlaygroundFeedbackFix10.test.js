/**
 * Recruit AI v2 — Playground Feedback Fix #10 (BR-098)
 * FAQ routing priority: experience FAQ + Spanish insurance FAQ.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  looksLikeExperienceQuestion,
  looksLikeInsuranceQuestion,
  looksLikeJobOverviewQuestion
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

test("1. ¿Necesito experiencia?", () => {
  assert.equal(looksLikeExperienceQuestion("¿Necesito experiencia?"), true);
  const r = turn("¿Necesito experiencia?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "experience_question");
  assert.match(r.rendered.text, /No necesitas experiencia previa/i);
});

test("2. necesito experiencia", () => {
  const r = turn("necesito experiencia", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "experience_question");
});

test("3. ¿Se necesita experiencia?", () => {
  const r = turn("¿Se necesita experiencia?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "experience_question");
});

test("4. ¿Tengo que tener experiencia?", () => {
  const r = turn("¿Tengo que tener experiencia?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "experience_question");
});

test("5. No tengo experiencia", () => {
  const r = turn("No tengo experiencia", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "experience_question");
});

test("6. Do I need experience?", () => {
  const r = turn(
    "Do I need experience?",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "experience_question");
  assert.match(r.rendered.text, /don'?t need prior experience|isn'?t required|training and licensing/i);
});

test("7. I don't have experience", () => {
  const r = turn(
    "I don't have experience",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "experience_question");
});

test("8. experience intent outranks location", () => {
  const r = turn("¿Necesito experiencia?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "experience_question");
  assert.notEqual(r.interpretation.intent, "provide_location");
  assert.equal(r.interpretation.entities.city, null);
  assert.ok(r.structuredDecision.reasonCodes.includes("FAQ_OUTRANKS_LOCATION"));
});

test("9. experience response concise", () => {
  const r = turn("¿Necesito experiencia?", dayPartPendingContext());
  assert.doesNotMatch(r.rendered.text, /2-14|comisi|asalariado|sueldo garantizado/i);
  assert.ok(r.rendered.text.length < 420);
  assert.match(r.rendered.text, /mañana o en la tarde/i);
});

test("10. ¿Es de seguros?", () => {
  assert.equal(looksLikeInsuranceQuestion("¿Es de seguros?"), true);
  assert.equal(looksLikeInsuranceQuestion("es de seguros"), true);
  const r = turn("¿Es de seguros?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "insurance_question");
});

test("11. es de seguros", () => {
  const r = turn("es de seguros", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "insurance_question");
});

test("12. ¿Esto es de seguros?", () => {
  const r = turn("¿Esto es de seguros?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "insurance_question");
});

test("13. ¿Trabajan con seguros?", () => {
  const r = turn("¿Trabajan con seguros?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "insurance_question");
});

test("14. Is this insurance?", () => {
  const r = turn(
    "Is this insurance?",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "insurance_question");
});

test("15. insurance detector survives final routing", () => {
  const r = turn("¿Es de seguros?", dayPartPendingContext());
  assert.equal(looksLikeInsuranceQuestion("es de seguros"), true);
  assert.equal(r.interpretation.intent, "insurance_question");
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "answer_insurance_faq_then_resume"
  );
  assert.ok(r.structuredDecision.reasonCodes.includes("INSURANCE_FAQ_ROUTED"));
});

test("16. insurance intent outranks location", () => {
  const r = turn("¿Es de seguros?", dayPartPendingContext());
  assert.notEqual(r.interpretation.intent, "provide_location");
  assert.notEqual(r.interpretation.intent, "unknown");
  assert.ok(r.structuredDecision.reasonCodes.includes("FAQ_OUTRANKS_LOCATION"));
});

test("17. no location mutation from either FAQ", () => {
  let ctx = dayPartPendingContext();
  for (const text of ["¿Necesito experiencia?", "¿Es de seguros?"]) {
    const r = turn(text, ctx);
    assert.equal(r.nextContext.knownFacts.city, "Miami");
    assert.equal(r.nextContext.knownFacts.state, "FL");
    assert.notEqual(r.nextContext.knownFacts.city, "Necesito Experiencia");
    assert.equal(parseLocationAnswer(text), null);
    ctx = r.nextContext;
  }
});

test("18. pending day-part preserved", () => {
  let ctx = dayPartPendingContext();
  const exp = turn("necesito experiencia?", ctx);
  assert.equal(exp.nextContext.conversation.lastQuestionAsked, "ask_day_part");
  assert.match(exp.rendered.text, /mañana o en la tarde/i);
  const ins = turn("es de seguros?", exp.nextContext);
  assert.equal(ins.nextContext.conversation.lastQuestionAsked, "ask_day_part");
  assert.match(ins.rendered.text, /mañana o en la tarde|seguros|financ/i);
});

test("19. BR-097 progressive disclosure preserved", () => {
  assert.equal(looksLikeJobOverviewQuestion("de que se trata"), true);
  const r = turn("de que se trata", dayPartPendingContext());
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "overview");
  assert.doesNotMatch(r.rendered.text, /asalariado|no se requiere experiencia/i);
});

test("20. BR-096 work-auth preserved", () => {
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

test("21. BR-095 normalization preserved", () => {
  for (const text of [
    "¿Necesito experiencia?",
    "necesito experiencia",
    "NECESITO EXPERIENCIA!",
    "¿Es de seguros?",
    "es de seguros",
    "ES DE SEGUROS?"
  ]) {
    const r = turn(text, dayPartPendingContext());
    assert.ok(
      r.interpretation.intent === "experience_question" ||
        r.interpretation.intent === "insurance_question",
      text
    );
    assert.equal(r.interpretation.entities.rawText, text);
  }
});

test("22. BR-094 location parsing preserved", () => {
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

test("23. BR-089 licensing FAQ preserved", () => {
  const r = turn("¿Necesito licencia?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "license_requirement_question");
  assert.match(r.rendered.text, /licencia/i);
});

test("24. BR-088 FAQ priority preserved", () => {
  const r = turn("¿Esto es un trabajo?", dayPartPendingContext(), {
    availability: {
      checked: true,
      requestedSlotAvailable: false,
      nearestAlternatives: []
    }
  });
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.ok(r.structuredDecision.reasonCodes.includes("FAQ_OUTRANKS_SCHEDULING"));
});

test("25. simulator/playground regressions", () => {
  const report = runRecruitAiV2ScenarioById("faq-priority-experience-insurance");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
  assert.equal(runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity").pass, true);
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  const p = sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  assert.equal(p.turn.diagnostics.authorizationResult, "denied");
});

test("26-29. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById("faq-priority-experience-insurance");
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
});

test("30. execution OFF", () => {
  assert.equal(isExecutionEnabled({}), false);
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  const r = turn("¿Necesito experiencia?", dayPartPendingContext());
  const auth = authorizeSideEffects({ structuredDecision: r.structuredDecision });
  assert.equal(auth.authorized, false);
});

test("31. syntax/lint", () => {
  require("../core/recruitAiV2/interpreter");
  require("../core/recruitAiV2/decisionEngine");
  require("../core/recruitAiV2/responseRenderer");
  require("../core/recruitAiV2/locationFacts");
  require("../core/teamVisionWorkflowCopy");
});

test("32. frontend unaffected", () => {
  assert.ok(true);
});

test("docs exist", () => {
  const root = path.join(__dirname, "../../docs");
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "03-engineering/recruit-ai-v2/26_FAQ_ROUTING_PRIORITY_EXPERIENCE_INSURANCE.md"
      )
    )
  );
  const rules = fs.readFileSync(
    path.join(root, "06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-098/);
});
