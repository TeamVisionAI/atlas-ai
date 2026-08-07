/**
 * Recruit AI v2 — day-part context priority for "mañana" + hour inheritance (BR-101)
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
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00"); // Friday

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

function timePendingContext(dayPart) {
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
      preferredDayPart: dayPart
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastAtlasOutboundText:
        dayPart === "morning"
          ? "¿Qué hora en la mañana te funciona mejor?"
          : "¿Qué hora en la tarde te funciona mejor?"
    }
  });
}

for (const text of [
  "mañana",
  "manana",
  "en la mañana",
  "en la manana",
  "por la mañana"
]) {
  test(`ask_day_part: "${text}" → morning, not Saturday`, () => {
    const r = turn(text, dayPartPendingContext());
    assert.equal(r.interpretation.intent, "provide_day_part");
    assert.equal(r.nextContext.knownFacts.preferredDayPart, "morning");
    assert.equal(r.nextContext.appointment?.proposedDate || null, null);
    assert.notEqual(r.interpretation.intent, "scheduling_date_proposal");
    assert.doesNotMatch(r.rendered.text, /s[aá]bado|Saturday/i);
    assert.match(r.rendered.text, /hora.*mañana|morning/i);
  });
}

test("pending date ask: mañana → tomorrow", () => {
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

test("morning day-part + 10 → 10:00 AM, no AM/PM ask", () => {
  const r = turn("10", timePendingContext("morning"));
  assert.equal(r.interpretation.intent, "scheduling_counteroffer");
  assert.equal(r.interpretation.entities.requestedTime, "10:00");
  assert.equal(r.interpretation.entities.needsAmPmClarification, false);
  assert.doesNotMatch(r.rendered.text, /mañana o .*tarde|morning or/i);
});

test("afternoon day-part + 3 → 15:00, no AM/PM ask", () => {
  const r = turn("3", timePendingContext("afternoon"));
  assert.equal(r.interpretation.intent, "scheduling_counteroffer");
  assert.equal(r.interpretation.entities.requestedTime, "15:00");
  assert.equal(r.interpretation.entities.needsAmPmClarification, false);
});

test("BR-088 / BR-097 / BR-100 regressions preserved", () => {
  const faq = turn("de que se trata", dayPartPendingContext());
  assert.equal(faq.interpretation.entities.jobFaqDetailLevel, "overview");

  const auth = turn(
    "si soy ciudadano",
    createConversationContext({
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
        lastAtlasOutboundText: "¿Tienes permiso de trabajo?"
      }
    })
  );
  assert.equal(auth.interpretation.intent, "provide_authorization");
  assert.equal(auth.nextContext.knownFacts.workAuthorization, true);

  assert.equal(runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity").pass, true);
});

test("simulator pack + isolation", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  const r = turn("en la mañana", dayPartPendingContext());
  assert.equal(
    authorizeSideEffects({ structuredDecision: r.structuredDecision }).authorized,
    false
  );
  assert.equal(isExecutionEnabled({}), false);
});

test("docs exist", () => {
  const root = path.join(__dirname, "../../docs");
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "03-engineering/recruit-ai-v2/29_DAY_PART_MANANA_CONTEXT_PRIORITY.md"
      )
    )
  );
  const rules = fs.readFileSync(
    path.join(root, "06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-101/);
});
