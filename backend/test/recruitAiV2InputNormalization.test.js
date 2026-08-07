/**
 * Recruit AI v2 — BR-095 deterministic inbound input normalization.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const {
  normalizeInboundText,
  normalizeIntentText,
  prepareLocationSearchText
} = require("../core/recruitAiV2/inputNormalization");
const {
  interpretInboundMessage,
  looksLikeDirectLackOfInterest,
  looksLikeCommunicationOptOut,
  looksLikeLicenseRequirementQuestion
} = require("../core/recruitAiV2/interpreter");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");

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

function locationCtx(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    ...overrides,
    knownFacts: { ...(overrides.knownFacts || {}) },
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?",
      ...(overrides.conversation || {})
    }
  });
}

function dayPartCtx(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    _testNow: FIXED_NOW,
    ...overrides,
    knownFacts: {
      city: "Tampa",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      preferredMeetingType: "zoom",
      coverage: "OUTSIDE",
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Como estás en Tampa, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?",
      ...(overrides.conversation || {})
    }
  });
}

test("raw text is preserved; comparison form is separate", () => {
  const n = normalizeInboundText("  MIAMI, FL  ");
  assert.equal(n.rawText, "  MIAMI, FL  ");
  assert.equal(n.trimmedText, "MIAMI, FL");
  assert.equal(n.comparisonText, "miami fl");
  assert.deepEqual(n.tokens, ["miami", "fl"]);
});

test("case-insensitive location equivalence", () => {
  for (const text of ["miami fl", "MIAMI FL", "Miami FL", "Miami, FL", "miami,fl", "  miami   fl "]) {
    const parsed = parseLocationAnswer(text);
    assert.equal(parsed?.city, "Miami", text);
    assert.equal(parsed?.state, "FL", text);
    assert.equal(parsed?.completeness, "complete", text);
    const r = turn(text, locationCtx());
    assert.equal(r.interpretation.entities.rawText, text);
    assert.equal(r.nextContext.knownFacts.city, "Miami");
    assert.equal(r.nextContext.knownFacts.state, "FL");
    assert.equal(r.interpretation.entities.comparisonText, prepareLocationSearchText(text));
    assert.notEqual(r.interpretation.entities.rawText, undefined);
  }
});

test("accent-insensitive manana/mañana preserves BR-088 context", () => {
  assert.equal(normalizeIntentText("mañana"), "manana");
  assert.equal(normalizeIntentText("manana"), "manana");
  const morning = turn("manana", dayPartCtx());
  assert.equal(morning.interpretation.intent, "provide_day_part");
  assert.equal(morning.nextContext.knownFacts.preferredDayPart, "morning");
  const morningAccent = turn("mañana", dayPartCtx());
  assert.equal(morningAccent.interpretation.intent, "provide_day_part");
  const dateTurn = turn(
    "manana",
    dayPartCtx({
      knownFacts: { preferredDayPart: "morning" },
      conversation: {
        lastQuestionAsked: "ask_date",
        lastAtlasOutboundText: "¿Qué día te funciona?"
      }
    })
  );
  assert.equal(dateTurn.interpretation.intent, "scheduling_date_proposal");
});

test("punctuation-tolerant withdraw / license / opt-out", () => {
  assert.equal(looksLikeDirectLackOfInterest("No me interesa."), true);
  assert.equal(looksLikeDirectLackOfInterest("NO ME INTERESA"), true);
  assert.equal(looksLikeDirectLackOfInterest("No me interesa!"), true);
  assert.equal(looksLikeLicenseRequirementQuestion("tengo que tener licencia?"), true);
  assert.equal(looksLikeLicenseRequirementQuestion("¿Tengo que tener licencia?"), true);
  assert.equal(looksLikeCommunicationOptOut("no me escribas mas"), true);
  assert.equal(looksLikeCommunicationOptOut("no me escribas más"), true);
});

test("accent-insensitive scheduling shorthand", () => {
  assert.equal(normalizeIntentText("cámbialo para el miércoles"), "cambialo para el miercoles");
  assert.equal(normalizeIntentText("despues de las 5"), "despues de las 5");
  assert.equal(normalizeIntentText("después de las 5"), "despues de las 5");
  assert.equal(normalizeIntentText("también"), "tambien");
  assert.equal(normalizeIntentText("está"), "esta");
  assert.equal(normalizeIntentText("escríbeme"), "escribeme");
});

test("time punctuation preserved for 6:30?", () => {
  const n = normalizeInboundText("6:30?");
  assert.equal(n.comparisonText, "6:30");
});

test("si is not globally forced — bare si affirmative still works via detector", () => {
  const n = normalizeInboundText("sí");
  assert.equal(n.comparisonText, "si");
  assert.equal(n.rawText, "sí");
  const r = turn("sí", locationCtx({
    knownFacts: { city: "Miami", proposedState: "FL" },
    conversation: {
      lastQuestionAsked: "confirm_location",
      lastAtlasOutboundText: "¿Miami, Florida?"
    }
  }));
  // confirm_location + affirmative → provide_location path
  assert.ok(["provide_location", "schedule_confirm"].includes(r.interpretation.intent));
});

test("docs exist", () => {
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/23_INPUT_NORMALIZATION.md"
  );
  assert.equal(fs.existsSync(doc), true);
});
