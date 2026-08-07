/**
 * Recruit AI v2 — BR-102 partial state-only location + after-time scheduling.
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
const { parseAvailabilityConstraint } = require("../core/recruitAiV2/schedulingConstraints");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
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

function locationAskContext() {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
    }
  });
}

function afternoonTimeContext() {
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
      preferredDayPart: "afternoon"
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastAtlasOutboundText: "Perfecto. ¿Qué hora en la tarde te funciona mejor?"
    }
  });
}

const AFTER_TIME_PHRASES = [
  "despues de la 5",
  "después de la 5",
  "despues de las 5",
  "después de las 5",
  "a partir de las 5",
  "después de 5",
  "luego de las 5",
  "cualquier hora despues de las 5",
  "puedo despues de las 5",
  "me sirve despues de las 5",
  "after 5",
  "after 5 pm",
  "anytime after 5",
  "anytime after 5 pm",
  "I can do after 5",
  "anything after 5"
];

for (const text of ["Florida", "florida", "FLORIDA", "Texas", "Georgia", "New York"]) {
  test(`partial state: "${text}" → state_only + ask city`, () => {
    const r = turn(text, locationAskContext());
    assert.equal(r.interpretation.intent, "provide_location");
    assert.equal(r.interpretation.entities.completeness, "state_only");
    assert.ok(r.interpretation.entities.state);
    assert.equal(r.interpretation.entities.city, null);
    assert.equal(r.nextContext.knownFacts.stateCertainty, "partial");
    assert.equal(r.nextContext.knownFacts.city, null);
    assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_city");
    assert.match(r.rendered.text, /ciudad de|city in/i);
    assert.doesNotMatch(r.rendered.text, /dato que te acabo/i);
  });
}

test("Florida → Miami completes Miami, Florida", () => {
  let ctx = locationAskContext();
  ctx = turn("florida", ctx).nextContext;
  assert.equal(ctx.knownFacts.state, "FL");
  const r = turn("miami", ctx);
  assert.equal(r.interpretation.intent, "provide_location");
  assert.equal(r.interpretation.entities.completeness, "complete");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.knownFacts.cityCertainty, "confirmed");
  assert.equal(r.nextContext.knownFacts.stateCertainty, "confirmed");
  assert.match(r.rendered.text, /permiso de trabajo|autoriz/i);
});

test("BR-094 city-only Miami still proposes Florida confirmation", () => {
  const r = turn("Miami", locationAskContext());
  assert.equal(r.interpretation.entities.completeness, "partial");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.proposedState, "FL");
  assert.match(r.rendered.text, /Miami.*Florida/i);
});

test("New York state-only does not invent New York City", () => {
  const parsed = parseLocationAnswer("New York");
  assert.equal(parsed.completeness, "state_only");
  assert.equal(parsed.state, "NY");
  assert.equal(parsed.city, null);
  const r = turn("New York", locationAskContext());
  assert.equal(r.nextContext.knownFacts.state, "NY");
  assert.equal(r.nextContext.knownFacts.city, null);
  assert.match(r.rendered.text, /Nueva York|New York/i);
});

for (const text of AFTER_TIME_PHRASES) {
  test(`after-time: "${text}" → constraint 17:00`, () => {
    const parsed = parseAvailabilityConstraint(text);
    assert.ok(parsed, `expected constraint for ${text}`);
    assert.equal(parsed.earliestTime, "17:00");
    const r = turn(text, afternoonTimeContext());
    assert.equal(r.interpretation.intent, "provide_availability_constraint");
    assert.equal(
      r.nextContext.knownFacts.availabilityConstraint.earliestTime,
      "17:00"
    );
    assert.equal(r.interpretation.entities.needsAmPmClarification, false);
    assert.equal(r.nextContext.appointment?.proposedDate || null, null);
    assert.equal(r.structuredDecision.decision.shouldEscalate, false);
    assert.doesNotMatch(r.rendered.text, /dato que te acabo/i);
    assert.match(r.rendered.text, /5:00 PM|5 PM|después de las 5|after 5/i);
  });
}

test("BR-095 after-time normalization variants", () => {
  for (const text of [
    "despues de la 5",
    "después de la 5",
    "DESPUES DE LA 5",
    "¡Después de la 5!"
  ]) {
    const r = turn(text, afternoonTimeContext());
    assert.equal(r.interpretation.intent, "provide_availability_constraint");
    assert.equal(r.interpretation.entities.rawText, text);
    assert.equal(
      r.nextContext.knownFacts.availabilityConstraint.earliestTime,
      "17:00"
    );
  }
});

test("exact playground: florida → miami → auth → tarde → despues de la 5", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW
  });
  const steps = [
    "hola",
    "florida",
    "miami",
    "si soy ciudadano",
    "tarde",
    "despues de la 5"
  ];
  const out = [];
  for (const s of steps) {
    const r = turn(s, ctx);
    out.push({
      in: s,
      intent: r.interpretation.intent,
      text: r.rendered.text
    });
    ctx = r.nextContext;
  }
  assert.equal(ctx.knownFacts.city, "Miami");
  assert.equal(ctx.knownFacts.state, "FL");
  assert.equal(ctx.knownFacts.workAuthorization, true);
  assert.ok(["afternoon", "evening"].includes(ctx.knownFacts.preferredDayPart));
  assert.equal(ctx.knownFacts.availabilityConstraint.earliestTime, "17:00");
  assert.equal(ctx.appointment?.proposedDate || null, null);
  assert.equal(out[1].intent, "provide_location");
  assert.match(out[1].text, /ciudad de Florida/i);
  assert.equal(out[5].intent, "provide_availability_constraint");
  assert.doesNotMatch(out.map((o) => o.text).join("\n"), /dato que te acabo/i);
  assert.equal(
    authorizeSideEffects({
      structuredDecision: turn("despues de la 5", afternoonTimeContext())
        .structuredDecision
    }).authorized,
    false
  );
  assert.equal(isExecutionEnabled({}), false);
});

test("BR-101 morning + 10 inheritance preserved", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "morning"
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastAtlasOutboundText: "¿Qué hora en la mañana te funciona mejor?"
    }
  });
  const r = turn("10", ctx);
  assert.equal(r.interpretation.entities.requestedTime, "10:00");
  assert.equal(r.interpretation.entities.needsAmPmClarification, false);
});

test("BR-084 trabajo hasta las 5 still constraint", () => {
  const r = turn("trabajo hasta las 5", afternoonTimeContext());
  assert.equal(r.interpretation.intent, "provide_availability_constraint");
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
});

test("BR-100 / BR-099 / BR-097 regressions", () => {
  const auth = turn(
    "si soy ciudadano",
    createConversationContext({
      preferredLanguage: "spanish",
      _testNow: FIXED_NOW,
      knownFacts: { city: "Miami", state: "FL" },
      conversation: {
        lastQuestionAsked: "ask_authorization",
        lastAtlasOutboundText: "¿Tienes permiso de trabajo?"
      }
    })
  );
  assert.equal(auth.interpretation.intent, "provide_authorization");
  assert.equal(auth.nextContext.knownFacts.workAuthorization, true);

  const sales = turn(
    "no se vender",
    createConversationContext({
      preferredLanguage: "spanish",
      _testNow: FIXED_NOW,
      knownFacts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true
      },
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
      }
    })
  );
  assert.equal(sales.interpretation.intent, "sales_objection");

  assert.equal(runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity").pass, true);
});

test("simulator pack + isolation", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
});

test("docs exist", () => {
  const root = path.join(__dirname, "../../docs");
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "03-engineering/recruit-ai-v2/30_PARTIAL_STATE_AFTER_TIME.md"
      )
    )
  );
  const rules = fs.readFileSync(
    path.join(root, "06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-102/);
});
