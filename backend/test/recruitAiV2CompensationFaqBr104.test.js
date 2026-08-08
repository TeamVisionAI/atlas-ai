/**
 * Recruit AI v2 — BR-104 compensation / earnings FAQ routing during scheduling.
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

function askTimeAfternoonContext(overrides = {}) {
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
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      meetingType: "in_person",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastAtlasOutboundText: "¿Qué hora en la tarde te funciona mejor?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

const SPANISH_PHRASES = [
  "entonces como voy a ganar dinero",
  "entonces cómo voy a ganar dinero",
  "como se gana dinero",
  "como me pagan",
  "cuanto pagan",
  "como funciona el pago",
  "es por comisión",
  "pagan por hora",
  "hay salario",
  "cuanto puedo ganar",
  "a como la hora",
  "a cómo la hora",
  "cuanto es la hora",
  "cuánto pagan la hora",
  "es por salario",
  "es salario",
  "es pago fijo",
  "el pago es fijo",
  "pagan fijo",
  "es por hora",
  "es sueldo",
  "hay sueldo",
  "es sueldo fijo",
  "cuanto es el sueldo"
];

const ENGLISH_PHRASES = [
  "how do I make money",
  "how do I get paid",
  "how does the pay work",
  "is it commission",
  "is it hourly",
  "is there a salary",
  "how much can I make",
  "how much per hour",
  "what's the hourly rate",
  "is it salary",
  "is it fixed pay",
  "is the pay fixed",
  "is it a fixed salary",
  "what's the salary"
];

for (const phrase of SPANISH_PHRASES) {
  test(`compensation ES: "${phrase}"`, () => {
    const r = turn(phrase, askTimeAfternoonContext());
    assert.equal(r.interpretation.intent, "compensation_question");
    assert.equal(
      r.structuredDecision.decision.nextAction,
      "answer_compensation_faq_then_resume"
    );
    assert.equal(r.nextContext.knownFacts.preferredDayPart, "afternoon");
    assert.equal(r.nextContext.knownFacts.city, "Miami");
    assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_time_preference");
    assert.doesNotMatch(r.rendered.text, /Con gusto te ayudo|dato que te acabo/i);
    assert.doesNotMatch(
      r.rendered.text,
      /ilimitad|garantiz(o|amos) \$?\d|\$\d{2,}|unlimited income/i
    );
    assert.match(r.rendered.text, /hora en la tarde|tarde te funciona/i);
  });
}

for (const phrase of ENGLISH_PHRASES) {
  test(`compensation EN: "${phrase}"`, () => {
    const r = turn(
      phrase,
      askTimeAfternoonContext({ preferredLanguage: "english" })
    );
    assert.equal(r.interpretation.intent, "compensation_question");
    assert.doesNotMatch(r.rendered.text, /happy to help|dato que te acabo/i);
    assert.doesNotMatch(
      r.rendered.text,
      /unlimited income|guaranteed \$?\d|\$\d{2,}/i
    );
  });
}

test("compensation intent outranks ask_time; no generic fallback", () => {
  const r = turn("entonces como voy a ganar dinero?", askTimeAfternoonContext());
  assert.equal(r.interpretation.intent, "compensation_question");
  assert.ok(
    r.structuredDecision.reasonCodes.includes("FAQ_OUTRANKS_SCHEDULING")
  );
  assert.ok(r.structuredDecision.reasonCodes.includes("NO_INCOME_GUARANTEE"));
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.doesNotMatch(r.rendered.text, /Con gusto te ayudo/i);
});

test("progressive disclosure subtypes: hourly / salary / fixed / commission", () => {
  const hourly = turn("a como la hora", askTimeAfternoonContext());
  assert.equal(
    hourly.interpretation.entities.compensationDetailKind,
    "hourly_pay_question"
  );
  assert.match(hourly.rendered.text, /hora/i);
  assert.doesNotMatch(hourly.rendered.text, /\$\d|\/hora|\d+\s*usd/i);
  assert.match(hourly.rendered.text, /hora en la tarde|tarde te funciona/i);

  const salary = turn("es por salario?", askTimeAfternoonContext());
  assert.equal(
    salary.interpretation.entities.compensationDetailKind,
    "salary_question"
  );
  assert.match(salary.rendered.text, /salario/i);
  assert.doesNotMatch(salary.rendered.text, /\$\d{2,}/i);

  const fixed = turn("es pago fijo?", askTimeAfternoonContext());
  assert.equal(
    fixed.interpretation.entities.compensationDetailKind,
    "fixed_pay_question"
  );
  assert.match(fixed.rendered.text, /pago fijo|fijo garantizado/i);
  assert.doesNotMatch(fixed.rendered.text, /\$\d{2,}/i);

  const commission = turn("es por comisión", askTimeAfternoonContext());
  assert.equal(
    commission.interpretation.entities.compensationDetailKind,
    "commission_question"
  );
  assert.match(commission.rendered.text, /producción|contrato/i);
  assert.doesNotMatch(commission.rendered.text, /%\d+|porcentaje fijo/i);

  const howMuch = turn("cuanto pagan", askTimeAfternoonContext());
  assert.equal(howMuch.interpretation.entities.compensationDetailKind, "how_much");
  assert.doesNotMatch(howMuch.rendered.text, /\$\d{2,}|ganarás|ganaras/i);
});

test("BR-095 compensation normalization", () => {
  const variants = [
    "entonces como voy a ganar dinero",
    "entonces cómo voy a ganar dinero?",
    "ENTONCES COMO VOY A GANAR DINERO!",
    "como me pagan",
    "cómo me pagan?"
  ];
  for (const v of variants) {
    assert.equal(looksLikeCompensationQuestion(v), true);
    assert.ok(classifyCompensationQuestionKind(v));
    const r = turn(v, askTimeAfternoonContext());
    assert.equal(r.interpretation.intent, "compensation_question");
    assert.equal(r.interpretation.normalization.rawText, v);
  }
});

test("exact playground multi-turn: miami→auth→overview→network→tarde→compensation", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "inferred" },
    currentStage: "greeting",
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
    }
  });

  const steps = [
    ["Miami FL", (r) => {
      assert.equal(r.nextContext.knownFacts.city, "Miami");
      assert.equal(r.nextContext.knownFacts.state, "FL");
    }],
    ["si soy residente", (r) => {
      assert.equal(r.nextContext.knownFacts.workAuthorization, true);
    }],
    ["de que se trata", (r) => {
      assert.equal(r.interpretation.intent, "job_opportunity_question");
    }],
    ["no conozco a nadie", (r) => {
      assert.equal(r.interpretation.intent, "network_objection");
    }],
    ["tarde", (r) => {
      assert.equal(r.nextContext.knownFacts.preferredDayPart, "afternoon");
    }],
    ["entonces como voy a ganar dinero?", (r) => {
      assert.equal(r.interpretation.intent, "compensation_question");
      assert.equal(r.nextContext.knownFacts.city, "Miami");
      assert.equal(r.nextContext.knownFacts.state, "FL");
      assert.equal(r.nextContext.knownFacts.workAuthorization, true);
      assert.equal(r.nextContext.knownFacts.preferredDayPart, "afternoon");
      assert.equal(
        r.nextContext.conversation.lastQuestionAsked,
        "ask_time_preference"
      );
      assert.match(r.rendered.text, /producción|contrato/i);
      assert.match(r.rendered.text, /hora en la tarde|tarde te funciona/i);
      assert.doesNotMatch(r.rendered.text, /Con gusto te ayudo|dato que te acabo/i);
      assert.equal(r.structuredDecision.decision.shouldEscalate, false);
    }]
  ];

  // Seed auth/day-part prompts where needed between turns.
  for (const [text, check] of steps) {
    if (text === "si soy residente") {
      ctx = {
        ...ctx,
        conversation: {
          ...ctx.conversation,
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        }
      };
    }
    if (text === "tarde") {
      ctx = {
        ...ctx,
        conversation: {
          ...ctx.conversation,
          lastQuestionAsked: "ask_day_part",
          lastAtlasOutboundText:
            "¿Prefieres en la mañana o en la tarde?"
        }
      };
    }
    const r = turn(text, ctx);
    check(r);
    ctx = r.nextContext;
  }
});

test("BR-103 / BR-099 / BR-098 regressions near compensation", () => {
  const network = turn("no conozco a nadie", askTimeAfternoonContext());
  assert.equal(network.interpretation.intent, "network_objection");

  const sales = turn("no se vender", askTimeAfternoonContext({
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
    }
  }));
  assert.equal(sales.interpretation.intent, "sales_objection");

  const experience = turn("necesito experiencia?", askTimeAfternoonContext({
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
    }
  }));
  assert.equal(experience.interpretation.intent, "experience_question");
});

test("exact playground scenario compensation-faq-during-ask-time", async () => {
  const report = await runRecruitAiV2ScenarioById("compensation-faq-during-ask-time");
  assert.equal(report.pass, true, JSON.stringify(report.failures || report, null, 2));
});

test("simulator pack + isolation", async () => {
  const pack = await runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.failedScenarioIds || [], null, 2));

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
  assert.equal(isExecutionEnabled({}), false);
});

test("docs exist", () => {
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/32_COMPENSATION_FAQ_ROUTING.md"
  );
  assert.equal(fs.existsSync(doc), true);
  const br = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(br, /BR-104/);
});
