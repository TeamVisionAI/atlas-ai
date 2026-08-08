/**
 * Recruit AI v2 — BR-105 constraint-preserving resume + direct compensation answers.
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
  isBeforeEarliestConstraint
} = require("../core/recruitAiV2/schedulingConstraints");
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

function afterFiveAfternoonContext(overrides = {}) {
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
        earliestTimeInclusive: false,
        latestTime: null,
        dayPart: "evening",
        explicitCandidateTime: null,
        raw: "despues de las 5"
      },
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
      lastAtlasOutboundText:
        "¿Qué hora después de las 5:00 PM te funciona mejor?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

test("1. afternoon + after 5 + compensation FAQ resumes after-5 question", () => {
  const r = turn("a como la hora?", afterFiveAfternoonContext());
  assert.equal(r.interpretation.intent, "compensation_question");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
  assert.equal(r.nextContext.knownFacts.preferredDayPart, "afternoon");
  assert.match(r.rendered.text, /después de las 5/i);
  assert.doesNotMatch(r.rendered.text, /hora en la tarde te funciona/i);
  assert.doesNotMatch(r.rendered.text, /Por cierto/i);
});

test("2. network objection preserves earliestTime", () => {
  const r = turn("no conozco a nadie", afterFiveAfternoonContext());
  assert.equal(r.interpretation.intent, "network_objection");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
  assert.match(r.rendered.text, /después de las 5/i);
  assert.doesNotMatch(r.rendered.text, /Por cierto/i);
});

test("3. experience FAQ preserves earliestTime", () => {
  const r = turn("necesito experiencia?", afterFiveAfternoonContext());
  assert.equal(r.interpretation.intent, "experience_question");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
  assert.match(r.rendered.text, /después de las 5/i);
});

test("4. general job FAQ preserves earliestTime", () => {
  const r = turn("de que se trata?", afterFiveAfternoonContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
  assert.match(r.rendered.text, /después de las 5/i);
  assert.doesNotMatch(r.rendered.text, /Por cierto|By the way/i);
});

test("5-6. no regression to generic afternoon-only prompt", () => {
  const r = turn("es por comision?", afterFiveAfternoonContext());
  assert.match(r.rendered.text, /después de las 5/i);
  assert.doesNotMatch(r.rendered.text, /¿Qué hora en la tarde te funciona mejor\?/i);
});

test("7-13. direct compensation answers", () => {
  const commission = turn("es por comision?", afterFiveAfternoonContext());
  assert.equal(
    commission.interpretation.entities.compensationDetailKind,
    "commission_question"
  );
  assert.match(commission.rendered.text, /^Sí\./);
  assert.match(commission.rendered.text, /producción/i);
  assert.doesNotMatch(commission.rendered.text, /%\d+|\$\d/);

  const commission2 = turn("es por comisión", afterFiveAfternoonContext());
  assert.match(commission2.rendered.text, /^Sí\./);

  const commissionEn = turn(
    "is it commission",
    afterFiveAfternoonContext({ preferredLanguage: "english" })
  );
  assert.match(commissionEn.rendered.text, /^Yes\./i);

  const salary = turn("es salario fijo?", afterFiveAfternoonContext());
  assert.equal(
    salary.interpretation.entities.compensationDetailKind,
    "fixed_pay_question"
  );
  assert.match(salary.rendered.text, /^No\./);
  assert.match(salary.rendered.text, /fijo/i);

  const fixed = turn("es pago fijo?", afterFiveAfternoonContext());
  assert.equal(
    fixed.interpretation.entities.compensationDetailKind,
    "fixed_pay_question"
  );
  assert.match(fixed.rendered.text, /^No\./);

  const hourly = turn("a como la hora?", afterFiveAfternoonContext());
  assert.equal(
    hourly.interpretation.entities.compensationDetailKind,
    "hourly_pay_question"
  );
  assert.match(hourly.rendered.text, /^No\./);
  assert.match(hourly.rendered.text, /tarifa por hora|hora garantizada/i);
  assert.doesNotMatch(hourly.rendered.text, /\$\d|\/hora|\d+\s*usd/i);
});

test("17-18. no mechanical Por cierto / By the way on FAQ resume", () => {
  const es = turn("es por comision?", afterFiveAfternoonContext());
  assert.doesNotMatch(es.rendered.text, /Por cierto/i);
  const en = turn(
    "is it commission",
    afterFiveAfternoonContext({ preferredLanguage: "english" })
  );
  assert.doesNotMatch(en.rendered.text, /By the way/i);
});

test("19. after 5 + 6 → 18:00", () => {
  const r = turn("6", afterFiveAfternoonContext());
  assert.equal(r.interpretation.intent, "scheduling_counteroffer");
  assert.equal(r.nextContext.appointment.proposedTime, "18:00");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
});

test("20. after 5 + 7 → 19:00", () => {
  const r = turn("7", afterFiveAfternoonContext());
  assert.equal(r.nextContext.appointment.proposedTime, "19:00");
});

test("21. after 5 + 4 → conflict/clarification", () => {
  assert.equal(isBeforeEarliestConstraint("16:00", "17:00"), true);
  const r = turn("4", afterFiveAfternoonContext());
  assert.ok(
    r.structuredDecision.reasonCodes.includes("AVAILABILITY_CONSTRAINT_CONFLICT")
  );
  assert.match(r.rendered.text, /después de las 5|a partir de las 5/i);
  assert.notEqual(r.nextContext.appointment?.proposedTime, "16:00");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
});

test("21b. after 5 + bare 5 → exclusive conflict (17:00 invalid)", () => {
  const r = turn("5", afterFiveAfternoonContext());
  assert.ok(
    r.structuredDecision.reasonCodes.includes("AVAILABILITY_CONSTRAINT_CONFLICT")
  );
  assert.notEqual(r.nextContext.appointment?.proposedTime, "17:00");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTimeInclusive,
    false
  );
});

test("21c. a partir de las 5 + bare 5 → inclusive accept 17:00", () => {
  const ctx = afterFiveAfternoonContext({
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
        earliestTimeInclusive: true,
        latestTime: null,
        dayPart: "evening",
        explicitCandidateTime: null,
        raw: "a partir de las 5"
      }
    }
  });
  const r = turn("5", ctx);
  assert.equal(r.nextContext.appointment?.proposedTime, "17:00");
  assert.ok(
    !r.structuredDecision.reasonCodes.includes("AVAILABILITY_CONSTRAINT_CONFLICT")
  );
});

test("22-23. no AM inference conflicting with after-5; earliestTime stored", () => {
  const r = turn("10", afterFiveAfternoonContext());
  assert.equal(r.nextContext.appointment.proposedTime, "22:00");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
});

test("exact playground multi-turn constraint + compensation", () => {
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

  const sequence = [
    ["Miami FL", null],
    ["si soy residente", (c) => {
      c.conversation = {
        ...c.conversation,
        lastQuestionAsked: "ask_authorization",
        lastAtlasOutboundText:
          "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
      };
      return c;
    }],
    ["de que se trata", null],
    ["no conozco a nadie", null],
    ["tarde", (c) => {
      c.conversation = {
        ...c.conversation,
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
      };
      return c;
    }],
    ["entonces como voy a ganar dinero?", null],
    ["despues de las 5", null],
    ["a como la hora?", null],
    ["es salario fijo?", null],
    ["es por comision?", null]
  ];

  for (const [text, prep] of sequence) {
    if (prep) ctx = prep(ctx);
    const r = turn(text, ctx);
    ctx = r.nextContext;
  }

  assert.equal(ctx.knownFacts.city, "Miami");
  assert.equal(ctx.knownFacts.state, "FL");
  assert.equal(ctx.knownFacts.workAuthorization, true);
  assert.equal(ctx.knownFacts.preferredDayPart, "afternoon");
  assert.equal(ctx.knownFacts.availabilityConstraint.earliestTime, "17:00");

  const last = turn("es por comision?", afterFiveAfternoonContext({
    knownFacts: ctx.knownFacts,
    conversation: ctx.conversation,
    appointment: ctx.appointment
  }));
  assert.match(last.rendered.text, /^Sí\./);
  assert.match(last.rendered.text, /después de las 5/i);
  assert.doesNotMatch(last.rendered.text, /Por cierto|hora en la tarde te funciona/i);
});

test("BR-104 / BR-103 / BR-102 regressions", () => {
  const general = turn(
    "entonces como voy a ganar dinero?",
    afterFiveAfternoonContext({
      knownFacts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true,
        preferredDayPart: "afternoon",
        preferredMeetingType: "in_person",
        availabilityConstraint: null
      }
    })
  );
  assert.equal(general.interpretation.intent, "compensation_question");

  const network = turn("no conozco a nadie", afterFiveAfternoonContext());
  assert.equal(network.interpretation.intent, "network_objection");

  const after = turn(
    "despues de las 5",
    afterFiveAfternoonContext({
      knownFacts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true,
        preferredDayPart: "afternoon",
        preferredMeetingType: "in_person",
        availabilityConstraint: null
      },
      conversation: {
        lastQuestionAsked: "ask_time_preference",
        lastAtlasOutboundText: "¿Qué hora en la tarde te funciona mejor?"
      }
    })
  );
  assert.equal(after.interpretation.intent, "provide_availability_constraint");
  assert.equal(
    after.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
});

test("exact playground scenario constraint-preserving-resume", async () => {
  const report = await runRecruitAiV2ScenarioById(
    "constraint-preserving-resume-compensation"
  );
  assert.equal(report.pass, true, JSON.stringify(report.failures || report, null, 2));
});

test("simulator pack + isolation", async () => {
  const pack = await runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(
    (pack.reports || []).filter((r) => !r.pass).map((r) => r.id),
    null,
    2
  ));
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
    "../../docs/03-engineering/recruit-ai-v2/33_CONSTRAINT_PRESERVING_RESUME.md"
  );
  assert.equal(fs.existsSync(doc), true);
  const br = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(br, /BR-105/);
});
