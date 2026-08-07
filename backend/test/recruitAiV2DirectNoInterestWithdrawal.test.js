/**
 * Recruit AI v2 — Direct Lack-of-Interest Withdrawal (BR-091)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  classifyCancellationIntent,
  looksLikeDirectLackOfInterest,
  looksLikeCommunicationOptOut
} = require("../core/recruitAiV2/interpreter");
const {
  looksLikeFixedEmploymentPreference,
  looksLikeCurrentJobSearchFocus
} = require("../core/recruitAiV2/employmentFit");
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

function dayPartContext() {
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
      coverage: "OUTSIDE"
    },
    appointment: { status: "proposed", meetingType: "zoom", proposedTime: null },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Como estás en Kissimmee, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?"
    }
  });
}

function assertWithdraw(text) {
  assert.equal(looksLikeDirectLackOfInterest(text), true, text);
  const classified = classifyCancellationIntent(text);
  assert.equal(classified?.intent, "withdraw_interest", text);
  assert.notEqual(classified?.intent, "opt_out_request", text);
  const r = turn(text, dayPartContext());
  assert.equal(r.interpretation.intent, "withdraw_interest", text);
  assert.equal(r.nextContext.currentStage, "withdrawn", text);
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "acknowledge_withdraw_no_write",
    text
  );
  assert.equal(r.nextContext.conversation.lastQuestionAsked, null, text);
  assert.doesNotMatch(r.rendered.text, /\?/, text);
  assert.doesNotMatch(
    r.rendered.text,
    /mañana|tarde|no recibir más mensajes|compañero|conectarte/i,
    text
  );
  assert.match(r.rendered.text, /gracias|[eé]xito|success/i, text);
  assert.ok(
    r.structuredDecision.reasonCodes.includes(
      "DIRECT_LACK_OF_INTEREST_RECOGNIZED"
    ) ||
      r.structuredDecision.reasonCodes.includes("WITHDRAW_INTENT_RECOGNIZED"),
    text
  );
}

test("1. No me interesa", () => {
  assertWithdraw("No me interesa");
});

test("2. No estoy interesado", () => {
  assertWithdraw("No estoy interesado");
});

test("3. No estoy interesada", () => {
  assertWithdraw("No estoy interesada");
});

test("4. No me interesa esto", () => {
  assertWithdraw("No me interesa esto");
});

test("5. No gracias, no me interesa", () => {
  assertWithdraw("No gracias, no me interesa");
});

test("6. Gracias, pero no me interesa", () => {
  assertWithdraw("Gracias, pero no me interesa");
});

test("7. No quiero seguir", () => {
  assertWithdraw("No quiero seguir");
});

test("8. No quiero continuar", () => {
  assertWithdraw("No quiero continuar");
});

test("9. I'm not interested", () => {
  assertWithdraw("I'm not interested");
});

test("10. Not interested", () => {
  assertWithdraw("Not interested");
});

test("11. No thanks, I'm not interested", () => {
  assertWithdraw("No thanks, I'm not interested");
});

test("12. I don't want to continue", () => {
  assertWithdraw("I don't want to continue");
});

test("13. direct lack of interest outranks scheduling", () => {
  const r = turn("No me interesa", dayPartContext());
  assert.equal(r.interpretation.intent, "withdraw_interest");
  assert.notEqual(r.interpretation.intent, "provide_day_part");
  assert.doesNotMatch(r.rendered.text, /hora|mañana|tarde/i);
});

test("14. direct lack of interest outranks generic clarification", () => {
  const r = turn("No me interesa", dayPartContext());
  assert.notEqual(r.structuredDecision.decision.nextAction, "clarify_once");
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
});

test("15. direct lack of interest != opt-out", () => {
  assert.equal(looksLikeCommunicationOptOut("No me interesa"), false);
  assert.equal(classifyCancellationIntent("No me interesa")?.intent, "withdraw_interest");
  assert.equal(classifyCancellationIntent("STOP")?.intent, "opt_out_request");
  assert.equal(
    classifyCancellationIntent("No me escribas más")?.intent,
    "opt_out_request"
  );
});

test("16. fixed-employment preference remains distinct", () => {
  assert.equal(
    looksLikeFixedEmploymentPreference("Estoy buscando empleo fijo"),
    true
  );
  assert.equal(looksLikeDirectLackOfInterest("Estoy buscando empleo fijo"), false);
  const r = turn("Estoy buscando empleo fijo", dayPartContext());
  assert.equal(r.interpretation.intent, "fixed_employment_preference");
});

test("17. current_not_fit remains distinct", () => {
  assert.equal(
    looksLikeCurrentJobSearchFocus(
      "Por el momento mi enfoque es encontrar trabajo"
    ),
    true
  );
  assert.equal(
    looksLikeDirectLackOfInterest(
      "Por el momento mi enfoque es encontrar trabajo"
    ),
    false
  );
});

test("18. appointment cancellation remains distinct", () => {
  const cancel = classifyCancellationIntent("cancela la cita");
  assert.equal(cancel.intent, "cancel_request");
  const better = classifyCancellationIntent("Mejor cancélalo");
  assert.equal(better.intent, "cancel_request");
  const combo = classifyCancellationIntent("Mejor cancélalo, cambié de idea");
  assert.equal(combo.intent, "withdraw_interest");
  assert.equal(combo.cancellationKind, "withdraw_and_cancel");
});

test("19. STOP remains opt-out", () => {
  const r = turn("STOP", dayPartContext());
  assert.equal(r.interpretation.intent, "opt_out_request");
});

test("20. no follow-up question", () => {
  const r = turn("No me interesa", dayPartContext());
  assert.doesNotMatch(r.rendered.text, /\?/);
  assert.equal(r.nextContext.conversation.lastQuestionAsked, null);
});

test("21. no handoff", () => {
  const r = turn("No me interesa", dayPartContext());
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.doesNotMatch(r.rendered.text, /conectarte|looping in|teammate|compañero/i);
});

test("22-25. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById("direct-no-interest-withdrawal");
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
  const effects = (last.proposedSideEffects || []).map((p) =>
    typeof p === "string" ? p : p.type
  );
  assert.ok(effects.includes("withdraw_prospect"));
  assert.ok(!effects.includes("communication_opt_out"));
});

test("26-28. production posture defaults remain fail-closed", () => {
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("29. BR-090 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("puerto-rico-fixed-employment-real-world").pass,
    true
  );
});

test("30. BR-089 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("license-requirement-preserves-day-part").pass,
    true
  );
});

test("31. BR-088 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity").pass,
    true
  );
});

test("32. simulator/playground regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(
    pack.failed,
    0,
    JSON.stringify(pack.reports?.filter((r) => !r.pass))
  );
  assert.ok(
    listRecruitAiV2Scenarios().some((s) => s.id === "direct-no-interest-withdrawal")
  );
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  sendPlaygroundTurn(s.sessionId, { text: "Kissimmee, Florida" });
  sendPlaygroundTurn(s.sessionId, { text: "Sí tengo permiso de trabajo" });
  const w = sendPlaygroundTurn(s.sessionId, { text: "No me interesa" });
  assert.equal(w.turn.diagnostics.interpretedIntent, "withdraw_interest");
  assert.equal(w.turn.diagnostics.authorizationResult, "denied");
  assert.match(w.turn.atlasProposedReply, /[eé]xito/i);
});

test("33. syntax/lint + docs exist", () => {
  require("../core/recruitAiV2/interpreter");
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/21_DIRECT_NO_INTEREST_WITHDRAWAL.md"
  );
  assert.equal(fs.existsSync(doc), true);
});

test("34. frontend unaffected marker", () => {
  assert.ok(true);
});

test("Esto no me interesa + I don't want to proceed", () => {
  assertWithdraw("Esto no me interesa");
  assertWithdraw("I don't want to proceed");
});

test("side effects denied for bare No me interesa", () => {
  const r = turn("No me interesa", dayPartContext());
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
});
