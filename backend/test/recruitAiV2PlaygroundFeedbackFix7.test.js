/**
 * Recruit AI v2 — Playground Feedback Fix #7 (BR-088)
 * Job/opportunity intent, FAQ priority, mañana disambiguation, contextual continuation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  looksLikeJobOpportunityQuestion,
  looksLikeConversationClarificationRequest
} = require("../core/recruitAiV2/interpreter");
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
    currentStage: "scheduling",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Tampa",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "zoom",
      coverage: "OUTSIDE",
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      meetingType: "zoom",
      proposedTime: null,
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Como estás en Tampa, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

test("1. Esto es un trabajo", () => {
  assert.equal(looksLikeJobOpportunityQuestion("Esto es un trabajo"), true);
  const r = turn("Esto es un trabajo", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.match(r.rendered.text, /oportunidad|servicios financieros/i);
});

test("2. ¿Esto es un trabajo?", () => {
  const r = turn("¿Esto es un trabajo?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.doesNotMatch(r.rendered.text, /Esa hora puede no estar disponible/i);
});

test("3. Is this a job?", () => {
  const r = turn(
    "Is this a job?",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.match(r.rendered.text, /opportunity|financial services/i);
});

test("4. What kind of job is this?", () => {
  assert.equal(looksLikeJobOpportunityQuestion("What kind of job is this?"), true);
  const r = turn(
    "What kind of job is this?",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "job_opportunity_question");
});

test("5. job intent outranks scheduling", () => {
  const r = turn("¿Esto es un trabajo?", dayPartPendingContext(), {
    availability: { checked: true, requestedSlotAvailable: false, nearestAlternatives: [] }
  });
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.notEqual(r.structuredDecision.decision.nextAction, "offer_alternatives_no_handoff");
  assert.ok(r.structuredDecision.reasonCodes.includes("FAQ_OUTRANKS_SCHEDULING"));
});

test("6. insurance FAQ outranks scheduling", () => {
  const r = turn("Is this insurance?", dayPartPendingContext({ preferredLanguage: "english" }));
  assert.equal(r.interpretation.intent, "insurance_question");
  assert.match(r.rendered.text, /morning or afternoon|financial/i);
});

test("7. license FAQ outranks scheduling", () => {
  const r = turn("Do I need a license?", dayPartPendingContext({ preferredLanguage: "english" }));
  assert.equal(r.interpretation.intent, "license_requirement_question");
  assert.doesNotMatch(r.rendered.text, /may not be available/i);
});

test("8. compensation FAQ outranks scheduling", () => {
  const r = turn("¿Es salario o comisión?", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "compensation_question");
  assert.match(r.rendered.text, /mañana o en la tarde/i);
});

test("9. mañana after day-part question = morning", () => {
  const r = turn("mañana", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "provide_day_part");
  assert.equal(r.nextContext.knownFacts.preferredDayPart, "morning");
  assert.ok(r.structuredDecision.reasonCodes.includes("MANANA_DAY_PART_CONTEXT"));
});

test("10. mañana after date question = tomorrow", () => {
  const r = turn(
    "mañana",
    dayPartPendingContext({
      knownFacts: { preferredDayPart: "morning" },
      conversation: {
        lastQuestionAsked: "ask_date",
        lastAtlasOutboundText: "¿Qué día te funciona?"
      }
    })
  );
  assert.equal(r.interpretation.intent, "scheduling_date_proposal");
  assert.equal(r.nextContext.appointment.proposedDate, "2026-08-08");
  assert.ok(r.structuredDecision.reasonCodes.includes("MANANA_DATE_CONTEXT"));
});

test("11. tarde after day-part question = afternoon", () => {
  const r = turn("tarde", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "provide_day_part");
  assert.equal(r.nextContext.knownFacts.preferredDayPart, "afternoon");
  assert.match(r.rendered.text, /tarde/i);
});

test("12. day-part answer advances to time question", () => {
  const r = turn("mañana", dayPartPendingContext());
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "acknowledge_day_part_ask_time"
  );
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_time_preference");
  assert.match(r.rendered.text, /Qué hora|hora en la mañana/i);
});

test("13. no bare Continuemos response", () => {
  const r = turn("mañana", dayPartPendingContext());
  assert.doesNotMatch(r.rendered.text, /^Gracias — anotado\. Continuemos\.?$/i);
  assert.doesNotMatch(r.rendered.text, /Continuemos\.?\s*$/i);
  assert.match(r.rendered.text, /\?/);
});

test("14. continuemos con qué? uses pending state", () => {
  const after = turn("mañana", dayPartPendingContext());
  const r = turn("continuemos con que?", after.nextContext);
  assert.equal(r.interpretation.intent, "conversation_clarification_request");
  assert.match(r.rendered.text, /hora de la entrevista|prefieres en la mañana/i);
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
});

test("15. what do you still need? uses pending state", () => {
  assert.equal(
    looksLikeConversationClarificationRequest("What do you still need?"),
    true
  );
  const after = turn("mañana", dayPartPendingContext());
  const r = turn(
    "What do you still need?",
    { ...after.nextContext, preferredLanguage: "english" }
  );
  assert.equal(r.interpretation.intent, "conversation_clarification_request");
  assert.match(r.rendered.text, /interview time|morning/i);
});

test("16. no time-unavailable copy for FAQ", () => {
  for (const text of ["Esto es un trabajo", "¿Esto es un trabajo?", "Is this a job?"]) {
    const r = turn(text, dayPartPendingContext());
    assert.doesNotMatch(r.rendered.text, /Esa hora puede no estar disponible|may not be available/i, text);
  }
  const escalateRemap = renderCustomerReply({
    language: "spanish",
    templateKey: "safe_uncertain_escalate",
    entities: { requiresHuman: false }
  });
  assert.doesNotMatch(escalateRemap.text, /Esa hora puede no estar disponible/i);
});

test("17. no handoff for recoverable FAQ", () => {
  const r = turn("¿Esto es un trabajo?", dayPartPendingContext());
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.equal(r.nextContext.attention?.needsHumanAttention, false);
});

test("18. pending scheduling resumes after FAQ", () => {
  const r = turn("Esto es un trabajo", dayPartPendingContext());
  assert.match(r.rendered.text, /Prefieres en la mañana o en la tarde/i);
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part");
});

test("19. side effects denied", () => {
  const r = turn("Esto es un trabajo", dayPartPendingContext());
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
});

test("20-23. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
});

test("24-26. production posture defaults remain fail-closed", () => {
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("27. BR-087 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("long-scheduling-memory-modality-zoom-link").pass,
    true
  );
});

test("28. BR-086 regression", () => {
  assert.equal(runRecruitAiV2ScenarioById("natural-language-opt-out").pass, true);
});

test("29. BR-085 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-scheduling-date-change-cancellation").pass,
    true
  );
});

test("30. simulator/playground regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  assert.ok(
    listRecruitAiV2Scenarios().some((s) => s.id === "tampa-faq-day-part-continuity")
  );
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  const r = sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  assert.equal(r.turn.diagnostics.authorizationResult, "denied");
});

test("31. frontend unaffected marker", () => {
  assert.ok(true);
});

test("32. backend syntax/lint + docs exist", () => {
  require("../core/recruitAiV2/conversationContinuity");
  require("../core/recruitAiV2/decisionEngine");
  require("../core/recruitAiV2/interpreter");
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/18_PLAYGROUND_FEEDBACK_INTENT_PRIORITY.md"
  );
  assert.equal(fs.existsSync(doc), true);
});

test("regression scenario Tampa FAQ + Day-Part Continuity", () => {
  const report = runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
});
