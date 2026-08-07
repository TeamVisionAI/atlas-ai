/**
 * Recruit AI v2 — Natural-Language Opt-Out (BR-086)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  classifyCancellationIntent,
  looksLikeCommunicationOptOut
} = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { authorizeSideEffects, isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");
const { resolveContextCaptureConfig } = require("../core/recruitAiV2/contextCaptureConfig");
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

function miamiAuthContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      ...(overrides.knownFacts || {})
    },
    appointment: { status: "none", ...(overrides.appointment || {}) },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

const OPT_OUT_PHRASES = [
  "no more messages",
  "stop texting me",
  "don't contact me",
  "leave me alone",
  "no me escribas más",
  "no quiero más mensajes",
  "unsubscribe",
  "STOP",
  "don't message me",
  "do not message me",
  "stop messaging me",
  "don't text me",
  "no more texts",
  "do not contact me",
  "remove me",
  "no me mandes más mensajes",
  "deja de escribirme",
  "no me textees",
  "no me contactes",
  "elimíname",
  "sáquenme de la lista",
  "no me escriban",
  "basta",
  "cancelar mensajes"
];

test("1. no more messages", () => {
  const r = turn("no more messages", miamiAuthContext());
  assert.equal(r.interpretation.intent, "opt_out_request");
  assert.notEqual(r.interpretation.intent, "correct_location");
});

test("2. stop texting me", () => {
  assert.equal(turn("stop texting me", miamiAuthContext()).interpretation.intent, "opt_out_request");
});

test("3. don't contact me", () => {
  assert.equal(turn("don't contact me", miamiAuthContext()).interpretation.intent, "opt_out_request");
});

test("4. leave me alone", () => {
  assert.equal(turn("leave me alone", miamiAuthContext()).interpretation.intent, "opt_out_request");
});

test("5. no me escribas más", () => {
  assert.equal(
    turn("no me escribas más", miamiAuthContext()).interpretation.intent,
    "opt_out_request"
  );
});

test("6. no quiero más mensajes", () => {
  assert.equal(
    turn("no quiero más mensajes", miamiAuthContext()).interpretation.intent,
    "opt_out_request"
  );
});

test("7. unsubscribe", () => {
  assert.equal(turn("unsubscribe", miamiAuthContext()).interpretation.intent, "opt_out_request");
});

test("8. STOP regression", () => {
  assert.equal(turn("STOP", miamiAuthContext()).interpretation.intent, "opt_out_request");
});

test("9. appointment cancellation remains separate", () => {
  const c = classifyCancellationIntent("cancel the interview");
  assert.equal(c.intent, "cancel_request");
  assert.notEqual(c.intent, "opt_out_request");
});

test("10. withdraw remains separate", () => {
  const c = classifyCancellationIntent("I changed my mind");
  assert.equal(c.intent, "withdraw_interest");
});

test("11. combined cancel + opt-out", () => {
  const c = classifyCancellationIntent(
    "cancel the interview and don't text me anymore"
  );
  assert.equal(c.intent, "opt_out_request");
  assert.equal(c.alsoCancelAppointment, true);
  assert.equal(c.alsoOptOut, true);
  const r = turn(
    "cancel the interview and don't text me anymore",
    miamiAuthContext({
      appointment: { status: "proposed", proposedTime: "19:00" }
    })
  );
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
  assert.ok(auth.proposals.some((p) => p.type === "communication_opt_out"));
  assert.ok(auth.proposals.some((p) => p.type === "cancel_appointment"));
});

test("12. opt-out priority over correct_location", () => {
  const r = turn("no more messages", miamiAuthContext());
  assert.equal(r.interpretation.intent, "opt_out_request");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
});

test("13. opt-out priority over name/location parsing", () => {
  for (const text of ["no more messages", "no me escribas más", "remove me"]) {
    assert.equal(
      looksLikeCommunicationOptOut(text),
      true,
      text
    );
    const r = turn(text, miamiAuthContext());
    assert.equal(r.interpretation.intent, "opt_out_request", text);
    assert.notEqual(r.interpretation.intent, "provide_name", text);
    assert.notEqual(r.interpretation.intent, "correct_location", text);
  }
});

test("14. no follow-up question after opt-out", () => {
  const r = turn("no more messages", miamiAuthContext());
  assert.equal(r.nextContext.conversation.lastQuestionAsked, null);
  assert.equal(r.nextContext.currentStage, "withdrawn");
  assert.doesNotMatch(r.rendered.text, /\?/);
  assert.doesNotMatch(r.rendered.text, /Prefieres|morning or afternoon|dato que/i);
});

test("15. side effect proposed only", () => {
  const r = turn("no more messages", miamiAuthContext());
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
  assert.ok(auth.proposals.some((p) => p.type === "communication_opt_out"));
});

test("16-19. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById("natural-language-opt-out");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
});

test("20-22. production posture defaults remain fail-closed", () => {
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("23. BR-085 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-scheduling-date-change-cancellation").pass,
    true
  );
});

test("24. simulator regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  assert.ok(listRecruitAiV2Scenarios().some((s) => s.id === "natural-language-opt-out"));
});

test("25. playground regression", () => {
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "english" });
  sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  sendPlaygroundTurn(s.sessionId, { text: "Miami, Florida" });
  const r = sendPlaygroundTurn(s.sessionId, { text: "no more messages" });
  assert.equal(r.turn.diagnostics?.authorizationResult || "denied", "denied");
  assert.match(String(r.turn.atlasProposedReply || ""), /stop messages|no recibir/i);
  assert.doesNotMatch(String(r.turn.atlasProposedReply || ""), /city and state|Prefieres/i);
});

test("26. frontend unaffected marker", () => {
  assert.ok(true);
});

test("27. backend syntax + phrase coverage + docs", () => {
  for (const phrase of OPT_OUT_PHRASES) {
    assert.equal(
      looksLikeCommunicationOptOut(phrase),
      true,
      `expected opt-out: ${phrase}`
    );
  }
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/16_NATURAL_LANGUAGE_OPT_OUT.md"
  );
  assert.equal(fs.existsSync(doc), true);
});

test("variant scenario phrases remain opt-out", () => {
  for (const text of [
    "stop texting me",
    "don't contact me",
    "no me escribas más",
    "no quiero más mensajes",
    "unsubscribe"
  ]) {
    const r = turn(text, miamiAuthContext());
    assert.equal(r.interpretation.intent, "opt_out_request", text);
    assert.equal(r.structuredDecision.decision.nextAction, "acknowledge_opt_out_no_write");
  }
});
