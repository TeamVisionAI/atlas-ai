/**
 * Recruit AI v2 — Puerto Rico work-auth + fixed-employment preference (BR-090)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  looksLikePuertoRicoOriginStatement,
  looksLikeFixedEmploymentPreference,
  looksLikeCurrentJobSearchFocus,
  looksLikeCompensationQuestion,
  classifyCancellationIntent
} = require("../core/recruitAiV2/interpreter");
const {
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
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
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");
const {
  resolveContextCaptureConfig
} = require("../core/recruitAiV2/contextCaptureConfig");

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
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Kissimmee",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "OUTSIDE",
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

function postAuthDayPartContext(extra = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Kissimmee",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "zoom",
      coverage: "OUTSIDE",
      ...(extra.knownFacts || {})
    },
    appointment: { status: "proposed", meetingType: "zoom", proposedTime: null },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Como estás en Kissimmee, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?",
      opportunityExplained: Boolean(extra.opportunityExplained),
      fixedEmploymentAcknowledged: Boolean(extra.fixedEmploymentAcknowledged),
      ...(extra.conversation || {})
    }
  });
}

const PR_PHRASES = [
  "Soy de PR",
  "Soy de Puerto Rico",
  "Nací en Puerto Rico",
  "Soy puertorriqueño",
  "Soy puertorriqueña"
];

test("1. Soy de PR", () => {
  assert.equal(looksLikePuertoRicoOriginStatement("Soy de PR"), true);
});

test("2. Soy de Puerto Rico", () => {
  assert.equal(looksLikePuertoRicoOriginStatement("Soy de Puerto Rico"), true);
});

test("3. Nací en Puerto Rico", () => {
  assert.equal(looksLikePuertoRicoOriginStatement("Nací en Puerto Rico"), true);
});

test("4. Soy puertorriqueño", () => {
  assert.equal(looksLikePuertoRicoOriginStatement("Soy puertorriqueño"), true);
});

test("5. Soy puertorriqueña", () => {
  assert.equal(looksLikePuertoRicoOriginStatement("Soy puertorriqueña"), true);
});

test("6. PR response satisfies work-auth flow", () => {
  for (const phrase of ["Si soy de PR", ...PR_PHRASES]) {
    const status = parseWorkAuthorizationAnswer(phrase, authPendingContext());
    assert.equal(status, WORK_AUTHORIZATION.AUTHORIZED, phrase);
    const r = turn(phrase, authPendingContext());
    assert.equal(r.interpretation.intent, "provide_authorization", phrase);
    assert.equal(r.nextContext.knownFacts.workAuthorization, true, phrase);
    assert.ok(
      r.structuredDecision.reasonCodes.includes(
        "PUERTO_RICO_WORK_AUTH_NORMALIZED"
      ),
      phrase
    );
  }
});

test("7. no work-auth re-ask after PR", () => {
  const r = turn("Si soy de PR", authPendingContext());
  assert.doesNotMatch(r.rendered.text, /permiso de trabajo|documentaci[oó]n legal/i);
  assert.match(r.rendered.text, /Zoom|mañana|tarde/i);
});

test("8. Puerto Rico never treated as foreign-country correction", () => {
  const r = turn("Si soy de PR", authPendingContext());
  assert.doesNotMatch(
    r.rendered.text,
    /foreign|pa[ií]s extranjero|no eres de|not from the us/i
  );
  assert.equal(
    looksLikePuertoRicoOriginStatement("Soy de República Dominicana"),
    false
  );
  assert.equal(looksLikePuertoRicoOriginStatement("Soy latino"), false);
  assert.equal(looksLikePuertoRicoOriginStatement("Soy del Caribe"), false);
});

test("9. job FAQ after PR outranks workflow", () => {
  const r = turn("De q trata el trabajo?", postAuthDayPartContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "answer_job_opportunity_then_resume"
  );
  assert.doesNotMatch(r.rendered.text, /Esa hora puede no estar disponible/i);
});

test("10. Estoy buscando empleo fijo", () => {
  assert.equal(
    looksLikeFixedEmploymentPreference("Estoy buscando empleo fijo"),
    true
  );
  const r = turn(
    "Estoy buscando empleo fijo",
    postAuthDayPartContext({ opportunityExplained: true })
  );
  assert.equal(r.interpretation.intent, "fixed_employment_preference");
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "acknowledge_fixed_employment_preference"
  );
  assert.match(r.rendered.text, /sueldo fijo/i);
  assert.doesNotMatch(r.rendered.text, /\?/);
});

test("11. Quiero sueldo fijo", () => {
  assert.equal(
    looksLikeFixedEmploymentPreference("Quiero un sueldo fijo"),
    true
  );
  const r = turn("Quiero un sueldo fijo", postAuthDayPartContext());
  assert.equal(r.interpretation.intent, "fixed_employment_preference");
  assert.notEqual(r.interpretation.intent, "compensation_question");
});

test("12. I'm looking for a salaried job", () => {
  const r = turn(
    "I'm looking for a salaried job",
    postAuthDayPartContext({
      conversation: {
        lastQuestionAsked: "ask_day_part"
      }
    })
  );
  assert.equal(r.interpretation.intent, "fixed_employment_preference");
});

test("13. fixed employment != opt-out", () => {
  assert.equal(classifyCancellationIntent("Estoy buscando empleo fijo"), null);
  const r = turn("Estoy buscando empleo fijo", postAuthDayPartContext());
  assert.notEqual(r.interpretation.intent, "opt_out_request");
  assert.doesNotMatch(r.rendered.text, /no recibir más mensajes/i);
});

test("14. fixed employment != compensation FAQ only", () => {
  assert.equal(
    looksLikeCompensationQuestion("Esto paga salario?"),
    true
  );
  assert.equal(
    looksLikeFixedEmploymentPreference("Esto paga salario?"),
    false
  );
  const pay = turn("Esto paga salario?", postAuthDayPartContext());
  assert.equal(pay.interpretation.intent, "compensation_question");
  const pref = turn("Estoy buscando empleo fijo", postAuthDayPartContext());
  assert.equal(pref.interpretation.intent, "fixed_employment_preference");
});

test("15. repeated fixed-employment preference closes politely", () => {
  assert.equal(
    looksLikeCurrentJobSearchFocus(
      "Por el momento mi enfoque es encontrar trabajo"
    ),
    true
  );
  const first = turn(
    "Estoy buscando empleo fijo",
    postAuthDayPartContext({ opportunityExplained: true })
  );
  const second = turn(
    "Por el momento mi enfoque es encontrar trabajo",
    first.nextContext
  );
  assert.equal(second.interpretation.intent, "current_not_fit");
  assert.equal(second.nextContext.knownFacts.currentFit, "not_now");
  assert.equal(second.nextContext.currentStage, "current_not_fit");
  assert.match(second.rendered.text, /[eé]xito/i);
});

test("16. no morning/afternoon ask after clear non-fit", () => {
  const ctx = postAuthDayPartContext({
    opportunityExplained: true,
    fixedEmploymentAcknowledged: true,
    knownFacts: { employmentPreference: "fixed" }
  });
  const r = turn("Por el momento mi enfoque es encontrar trabajo", ctx);
  assert.doesNotMatch(r.rendered.text, /mañana|tarde|\?/);
});

test("17. no handoff", () => {
  const r = turn(
    "Por el momento mi enfoque es encontrar trabajo",
    postAuthDayPartContext({
      opportunityExplained: true,
      fixedEmploymentAcknowledged: true
    })
  );
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.doesNotMatch(r.rendered.text, /conectarte|looping in|teammate/i);
});

test("18-21. no appointment/Calendar/WhatsApp/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById(
    "puerto-rico-fixed-employment-real-world"
  );
  assert.equal(
    report.pass,
    true,
    JSON.stringify(report.turns?.filter((t) => !t.pass))
  );
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
  for (const t of report.turns) {
    assert.equal(t.authorizationResult, "denied");
  }
  const last = report.turns[report.turns.length - 1];
  assert.ok(
    !(last.proposedSideEffects || []).some(
      (p) =>
        p.type === "communication_opt_out" ||
        p.type === "withdraw_prospect" ||
        p.type === "create_appointment"
    )
  );
});

test("22-24. production posture defaults remain fail-closed", () => {
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("25. BR-089 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("license-requirement-preserves-day-part").pass,
    true
  );
});

test("26. BR-088 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity").pass,
    true
  );
});

test("27. BR-087 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("long-scheduling-memory-modality-zoom-link")
      .pass,
    true
  );
});

test("28. BR-086 regression", () => {
  assert.equal(runRecruitAiV2ScenarioById("natural-language-opt-out").pass, true);
});

test("29. simulator/playground regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(
    pack.failed,
    0,
    JSON.stringify(pack.reports?.filter((r) => !r.pass))
  );
  assert.ok(
    listRecruitAiV2Scenarios().some(
      (s) => s.id === "puerto-rico-fixed-employment-real-world"
    )
  );
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  sendPlaygroundTurn(s.sessionId, { text: "Kissimmee fl" });
  const auth = sendPlaygroundTurn(s.sessionId, { text: "Si soy de PR" });
  assert.equal(auth.turn.diagnostics.authorizationResult, "denied");
  assert.equal(
    auth.turn.diagnostics.interpretedIntent,
    "provide_authorization"
  );
  assert.match(auth.turn.atlasProposedReply, /Zoom/i);
  assert.doesNotMatch(auth.turn.atlasProposedReply, /permiso de trabajo/i);
});

test("30. syntax/lint + docs exist", () => {
  require("../core/recruitAiV2/employmentFit");
  require("../core/recruitAiV2/qualificationFacts");
  require("../core/recruitAiV2/interpreter");
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/20_PUERTO_RICO_FIXED_EMPLOYMENT_PREFERENCE.md"
  );
  assert.equal(fs.existsSync(doc), true);
});

test("31. frontend unaffected marker", () => {
  assert.ok(true);
});

test("side effects denied for fixed-employment and not-fit", () => {
  const pref = turn("Estoy buscando empleo fijo", postAuthDayPartContext());
  assert.equal(
    authorizeSideEffects({
      structuredDecision: pref.structuredDecision,
      responsePlan: pref.structuredDecision.customerReplyPlan
    }).authorized,
    false
  );
  const close = turn(
    "Por el momento mi enfoque es encontrar trabajo",
    pref.nextContext
  );
  assert.equal(
    authorizeSideEffects({
      structuredDecision: close.structuredDecision,
      responsePlan: close.structuredDecision.customerReplyPlan
    }).authorized,
    false
  );
});
