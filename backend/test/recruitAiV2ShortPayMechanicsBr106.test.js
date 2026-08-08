/**
 * Recruit AI v2 — BR-106 short pay-mechanics compensation phrases ("como pagan").
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  looksLikeCompensationQuestion,
  classifyCompensationQuestionKind
} = require("../core/recruitAiV2/compensationQuestion");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");

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

function awaitingAvailabilityContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      preferredMeetingType: "in_person",
      availabilityConstraint: {
        type: "availability_constraint",
        earliestTime: "17:00",
        latestTime: null,
        dayPart: "evening",
        explicitCandidateTime: null,
        raw: "despues de las 5"
      },
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      proposedTime: "17:30",
      meetingType: "in_person",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "awaiting_availability",
      lastAtlasOutboundText:
        "Entendido — prefieres 5:30 PM. Voy a revisar disponibilidad y te comparto opciones que funcionen.",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

const SPANISH = [
  "como pagan",
  "cómo pagan",
  "como es el pago",
  "como funciona el pago",
  "como pagan ahi",
  "de que forma pagan",
  "como me van a pagar",
  "como recibo el pago",
  "cual es la forma de pago"
];

const ENGLISH = [
  "how do they pay",
  "how do you pay",
  "how does payment work",
  "how will I get paid",
  "how am I paid",
  "what's the pay structure",
  "what is the payment structure"
];

for (const phrase of SPANISH) {
  test(`pay_how ES: "${phrase}"`, () => {
    const r = turn(phrase, awaitingAvailabilityContext());
    assert.equal(r.interpretation.intent, "compensation_question");
    assert.equal(r.interpretation.entities.compensationDetailKind, "pay_how");
    assert.match(r.rendered.text, /producción|produccion/i);
    assert.doesNotMatch(r.rendered.text, /Continuemos|Gracias — eso ayuda/i);
    assert.doesNotMatch(r.rendered.text, /\$\d|%\d|ilimitad/i);
    assert.equal(r.nextContext.conversation.lastQuestionAsked, "awaiting_availability");
    assert.equal(r.nextContext.appointment.proposedTime, "17:30");
    assert.equal(
      r.nextContext.knownFacts.availabilityConstraint.earliestTime,
      "17:00"
    );
  });
}

for (const phrase of ENGLISH) {
  test(`pay_how EN: "${phrase}"`, () => {
    const r = turn(
      phrase,
      awaitingAvailabilityContext({ preferredLanguage: "english" })
    );
    assert.equal(r.interpretation.intent, "compensation_question");
    assert.equal(r.interpretation.entities.compensationDetailKind, "pay_how");
    assert.doesNotMatch(r.rendered.text, /Continuemos|Let's continue|that helps/i);
    assert.doesNotMatch(r.rendered.text, /\$\d|%\d|unlimited/i);
  });
}

test("maps to compensation_question/pay_how; outranks generic ack", () => {
  assert.equal(classifyCompensationQuestionKind("como pagan?"), "pay_how");
  const r = turn("como pagan?", awaitingAvailabilityContext());
  assert.notEqual(r.interpretation.intent, "provide_name");
  assert.notEqual(r.interpretation.intent, "soft_acknowledgement");
  assert.doesNotMatch(r.rendered.text, /Continuemos/i);
  assert.match(
    r.rendered.text,
    /basada en producción|basada en produccion/i
  );
});

test("BR-095 pay-how normalization", () => {
  for (const v of [
    "como pagan",
    "cómo pagan",
    "COMO PAGAN?",
    "¡Cómo pagan!"
  ]) {
    assert.equal(looksLikeCompensationQuestion(v), true);
    assert.equal(classifyCompensationQuestionKind(v), "pay_how");
    const r = turn(v, awaitingAvailabilityContext());
    assert.equal(r.interpretation.intent, "compensation_question");
    assert.equal(r.interpretation.normalization.rawText, v);
  }
});

test("exact playground: 5:30 → ok → hourly → como pagan", () => {
  let ctx = awaitingAvailabilityContext();
  const hourly = turn("a como la hora?", ctx);
  assert.equal(hourly.interpretation.entities.compensationDetailKind, "hourly_pay_question");
  assert.equal(hourly.nextContext.appointment.proposedTime, "17:30");
  assert.equal(hourly.nextContext.conversation.lastQuestionAsked, "awaiting_availability");
  ctx = hourly.nextContext;

  const payHow = turn("como pagan?", ctx);
  assert.equal(payHow.interpretation.intent, "compensation_question");
  assert.equal(payHow.interpretation.entities.compensationDetailKind, "pay_how");
  assert.equal(payHow.nextContext.appointment.proposedTime, "17:30");
  assert.equal(
    payHow.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
  assert.equal(payHow.nextContext.conversation.lastQuestionAsked, "awaiting_availability");
  assert.doesNotMatch(payHow.rendered.text, /Continuemos|Por cierto|compañero/i);
  assert.equal(payHow.structuredDecision.decision.shouldEscalate, false);
});

test("BR-105 / BR-104 / BR-103 regressions near pay_how", () => {
  const afterFive = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      preferredMeetingType: "in_person",
      availabilityConstraint: {
        earliestTime: "17:00",
        type: "availability_constraint"
      }
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastAtlasOutboundText: "¿Qué hora después de las 5 te funciona mejor?"
    }
  });
  const r = turn("a como la hora?", afterFive);
  assert.match(r.rendered.text, /después de las 5/i);

  const commission = turn("es por comision?", afterFive);
  assert.equal(
    commission.interpretation.entities.compensationDetailKind,
    "commission_question"
  );

  const soft = turn(
    "ok",
    awaitingAvailabilityContext()
  );
  assert.equal(soft.interpretation.intent, "soft_acknowledgement");
});

test("exact playground scenario short-pay-mechanics-como-pagan", async () => {
  const report = await runRecruitAiV2ScenarioById("short-pay-mechanics-como-pagan");
  assert.equal(report.pass, true, JSON.stringify(report.failures || report, null, 2));
});

test("simulator pack + isolation", async () => {
  const pack = await runAllRecruitAiV2ScenarioPack();
  assert.equal(
    pack.failed,
    0,
    JSON.stringify(
      (pack.reports || []).filter((r) => !r.pass).map((r) => r.id),
      null,
      2
    )
  );
  assert.equal(isExecutionEnabled({}), false);
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: "answer_compensation_faq_then_resume",
        shouldEscalate: false,
        mayCreateAppointment: false
      },
      reasonCodes: []
    },
    responsePlan: { templateKey: "compensation_faq_then_resume" },
    env: {}
  });
  assert.equal(auth.authorized, false);
});

test("docs exist", () => {
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/34_SHORT_PAY_MECHANICS.md"
  );
  assert.equal(fs.existsSync(doc), true);
  const br = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(br, /BR-106/);
});
