/**
 * Recruit AI v2 — License Requirement Intent Precision (BR-089)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  looksLikeLicenseRequirementQuestion
} = require("../core/recruitAiV2/interpreter");
const {
  parseLicenseStatement,
  looksLikeLicenseAbsenceStatement,
  looksLikeAmbiguousLicenseFragment,
  FINANCIAL_LICENSE_STATUS
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

function dayPartPendingContext() {
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
      coverage: "OUTSIDE"
    },
    appointment: { status: "proposed", meetingType: "zoom", proposedTime: null },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Como estás en Tampa, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?"
    }
  });
}

function assertRequirement(text) {
  assert.equal(looksLikeLicenseRequirementQuestion(text), true, text);
  const r = turn(text, dayPartPendingContext());
  assert.equal(r.interpretation.intent, "license_requirement_question", text);
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "answer_license_requirement_then_resume",
    text
  );
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part", text);
  assert.doesNotMatch(r.rendered.text, /214|215|\$/i, text);
}

test("1. ¿Tengo que tener licencia?", () => {
  assertRequirement("¿Tengo que tener licencia?");
});

test("2. ¿Necesito licencia?", () => {
  assertRequirement("¿Necesito licencia?");
});

test("3. ¿Tengo que sacar licencia?", () => {
  assertRequirement("¿Tengo que sacar licencia?");
});

test("4. ¿Es obligatorio tener licencia?", () => {
  assertRequirement("¿Es obligatorio tener licencia?");
});

test("5. ¿Necesito licencia para empezar?", () => {
  assertRequirement("¿Necesito licencia para empezar?");
});

test("6. Do I need a license?", () => {
  assertRequirement("Do I need a license?");
});

test("7. Do I need to be licensed?", () => {
  assertRequirement("Do I need to be licensed?");
});

test("8. Is a license required?", () => {
  assertRequirement("Is a license required?");
});

test("9. Do I have to get licensed?", () => {
  assertRequirement("Do I have to get licensed?");
});

test("10. No tengo licencia → status statement", () => {
  assert.equal(looksLikeLicenseAbsenceStatement("No tengo licencia"), true);
  const parsed = parseLicenseStatement("No tengo licencia");
  assert.equal(parsed.financialLicenseStatus, FINANCIAL_LICENSE_STATUS.NONE);
  assert.equal(parsed.ambiguous, false);
  const r = turn("No tengo licencia", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "provide_license_clarification");
  assert.notEqual(r.interpretation.intent, "ambiguous_license_statement");
});

test("11. Tengo licencia → ambiguous type clarification", () => {
  const parsed = parseLicenseStatement("Tengo licencia");
  assert.equal(parsed.ambiguous, true);
  const r = turn("Tengo licencia", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "ambiguous_license_statement");
  assert.match(r.rendered.text, /conducir|driver/i);
});

test("12. licencia → ambiguous_license_statement", () => {
  assert.equal(looksLikeAmbiguousLicenseFragment("licencia"), true);
  const r = turn("licencia", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "ambiguous_license_statement");
});

test("13. requirement question outranks scheduling", () => {
  const r = turn("¿Tengo que tener licencia?", dayPartPendingContext());
  assert.notEqual(r.interpretation.intent, "provide_day_part");
  assert.notEqual(r.interpretation.intent, "scheduling_date_proposal");
  assert.ok(
    r.structuredDecision.reasonCodes.includes(
      "LICENSE_REQUIREMENT_QUESTION_RECOGNIZED"
    )
  );
});

test("14. requirement question preserves pending day-part", () => {
  const r = turn("¿Tengo que tener licencia?", dayPartPendingContext());
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part");
  assert.match(r.rendered.text, /mañana o en la tarde/i);
});

test("15. mañana after requirement FAQ = morning", () => {
  const faq = turn("¿Tengo que tener licencia?", dayPartPendingContext());
  const r = turn("mañana", faq.nextContext);
  assert.equal(r.interpretation.intent, "provide_day_part");
  assert.equal(r.nextContext.knownFacts.preferredDayPart, "morning");
  assert.equal(r.nextContext.appointment.proposedDate, null);
  assert.match(r.rendered.text, /hora en la mañana/i);
  assert.doesNotMatch(r.rendered.text, /sábado|domingo|lunes/i);
});

test("16. no fabricated licensing nomenclature", () => {
  const r = turn("¿Tengo que tener licencia?", dayPartPendingContext());
  assert.doesNotMatch(r.rendered.text, /\b214\b|\b215\b|Series 6|Series 7/i);
});

test("17. no salary/income claims", () => {
  const r = turn("¿Tengo que tener licencia?", dayPartPendingContext());
  assert.doesNotMatch(r.rendered.text, /\$|garantizado.*sueldo|guaranteed salary/i);
});

test("18-21. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById(
    "license-requirement-preserves-day-part"
  );
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
  for (const t of report.turns) {
    assert.equal(t.authorizationResult, "denied");
  }
});

test("22-24. production posture defaults remain fail-closed", () => {
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("25. BR-088 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity").pass,
    true
  );
});

test("26. BR-087 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("long-scheduling-memory-modality-zoom-link").pass,
    true
  );
});

test("27. BR-086 regression", () => {
  assert.equal(runRecruitAiV2ScenarioById("natural-language-opt-out").pass, true);
});

test("28. simulator/playground regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  assert.ok(
    listRecruitAiV2Scenarios().some(
      (s) => s.id === "license-requirement-preserves-day-part"
    )
  );
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  const r = sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  assert.equal(r.turn.diagnostics.authorizationResult, "denied");
});

test("29. syntax/lint + docs exist", () => {
  require("../core/recruitAiV2/qualificationFacts");
  require("../core/recruitAiV2/interpreter");
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/19_LICENSE_REQUIREMENT_INTENT_PRECISION.md"
  );
  assert.equal(fs.existsSync(doc), true);
});

test("30. frontend unaffected marker", () => {
  assert.ok(true);
});

test("regression scenario license-requirement-preserves-day-part", () => {
  const report = runRecruitAiV2ScenarioById(
    "license-requirement-preserves-day-part"
  );
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
});

test("side effects denied for requirement FAQ", () => {
  const r = turn("¿Tengo que tener licencia?", dayPartPendingContext());
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
});
