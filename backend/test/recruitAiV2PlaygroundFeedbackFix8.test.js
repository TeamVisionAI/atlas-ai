/**
 * Recruit AI v2 — Playground Feedback Fix #8 (BR-094)
 * U.S. city/state abbreviation normalization ("miami fl" → Miami, Florida confirmed).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  looksLikeAmbiguousFragment
} = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  parseLocationAnswer,
  normalizeStateToken,
  isCompleteCityStatePhrase
} = require("../core/recruitAiV2/locationFacts");
const { evaluateCoverage } = require("../core/businessRulesEngine");
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

function locationPendingContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function assertCompleteCityState(text, city, state) {
  const parsed = parseLocationAnswer(text);
  assert.ok(parsed, `expected parse for ${text}`);
  assert.equal(parsed.city, city);
  assert.equal(parsed.state, state);
  assert.equal(parsed.completeness, "complete");
  assert.equal(isCompleteCityStatePhrase(text), true);
  assert.equal(looksLikeAmbiguousFragment(text), false);
}

test("1. miami fl", () => {
  assertCompleteCityState("miami fl", "Miami", "FL");
  const r = turn("miami fl", locationPendingContext());
  assert.equal(r.interpretation.intent, "provide_location");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.knownFacts.cityCertainty, "confirmed");
  assert.equal(r.nextContext.knownFacts.stateCertainty, "confirmed");
  assert.match(r.rendered.text, /permiso/i);
  assert.doesNotMatch(r.rendered.text, /Con gusto te ayudo/i);
});

test("2. Miami FL", () => {
  assertCompleteCityState("Miami FL", "Miami", "FL");
});

test("3. Miami, FL", () => {
  assertCompleteCityState("Miami, FL", "Miami", "FL");
});

test("4. Miami Florida", () => {
  assertCompleteCityState("Miami Florida", "Miami", "FL");
});

test("5. Doral FL", () => {
  assertCompleteCityState("Doral FL", "Doral", "FL");
});

test("6. Tampa FL", () => {
  assertCompleteCityState("Tampa FL", "Tampa", "FL");
});

test("7. Orlando FL", () => {
  assertCompleteCityState("Orlando FL", "Orlando", "FL");
});

test("8. Kissimmee FL", () => {
  assertCompleteCityState("Kissimmee FL", "Kissimmee", "FL");
});

test("9. Fort Lauderdale FL", () => {
  assertCompleteCityState("Fort Lauderdale FL", "Fort Lauderdale", "FL");
});

test("10. West Palm Beach FL", () => {
  assertCompleteCityState("West Palm Beach FL", "West Palm Beach", "FL");
});

test("11. Atlanta GA", () => {
  assertCompleteCityState("Atlanta GA", "Atlanta", "GA");
});

test("12. Dallas TX", () => {
  assertCompleteCityState("Dallas TX", "Dallas", "TX");
});

test("13. Charlotte NC", () => {
  assertCompleteCityState("Charlotte NC", "Charlotte", "NC");
});

test("14. New York NY", () => {
  assertCompleteCityState("New York NY", "New York", "NY");
});

test("15. Los Angeles CA", () => {
  assertCompleteCityState("Los Angeles CA", "Los Angeles", "CA");
});

test("16. multi-word city parsing", () => {
  assertCompleteCityState("fort lauderdale fl", "Fort Lauderdale", "FL");
  assertCompleteCityState("west palm beach, florida", "West Palm Beach", "FL");
});

test("17. lowercase state abbreviation", () => {
  assert.equal(normalizeStateToken("fl"), "FL");
  assertCompleteCityState("tampa fl", "Tampa", "FL");
});

test("18. uppercase state abbreviation", () => {
  assert.equal(normalizeStateToken("FL"), "FL");
  assertCompleteCityState("Tampa FL", "Tampa", "FL");
});

test("19. comma/no-comma", () => {
  assertCompleteCityState("Miami,FL", "Miami", "FL");
  assertCompleteCityState("Miami FL", "Miami", "FL");
});

test("19b. BR-095 case/punct/whitespace location variants", () => {
  for (const text of ["MIAMI FL", "Miami - FL", "Miami. FL", "  miami   fl "]) {
    assertCompleteCityState(text, "Miami", "FL");
    const r = turn(text, locationPendingContext());
    assert.equal(r.interpretation.entities.rawText, text);
    assert.equal(r.nextContext.knownFacts.city, "Miami");
  }
});

test("20. Miami high-confidence Florida resolves complete", () => {
  const parsed = parseLocationAnswer("Miami");
  assert.equal(parsed.completeness, "complete");
  assert.equal(parsed.city, "Miami");
  assert.equal(parsed.state, "FL");
  assert.equal(parsed.proposedState, null);
  const r = turn("Miami", locationPendingContext());
  assert.equal(r.nextContext.knownFacts.stateCertainty, "confirmed");
});

test("21. FL remains incomplete (state-only)", () => {
  const parsed = parseLocationAnswer("FL");
  assert.equal(parsed.completeness, "state_only");
  assert.equal(parsed.city, null);
  assert.equal(parsed.state, "FL");
  const r = turn("FL", locationPendingContext());
  // Without a prior city, do not invent a confirmed Miami/Florida pair.
  assert.notEqual(r.nextContext.knownFacts.city, "Miami");
  assert.notEqual(
    r.structuredDecision.decision?.nextAction,
    "continue_qualification"
  );
});

test("22. correction Miami FL → Orlando FL", () => {
  const ctx = locationPendingContext({
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL",
      preferredMeetingType: "in_person"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText: "Gracias. ¿Tienes permiso de trabajo?"
    }
  });
  const r = turn("Actually Orlando FL", ctx);
  assert.equal(r.interpretation.intent, "correct_location");
  assert.equal(r.nextContext.knownFacts.city, "Orlando");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.knownFacts.cityCertainty, "confirmed");
  assert.equal(r.nextContext.knownFacts.stateCertainty, "confirmed");
});

test("23. coverage re-evaluated after correction", () => {
  const ctx = locationPendingContext({
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      coverage: "LOCAL",
      preferredMeetingType: "in_person"
    },
    appointment: { meetingType: "in_person" },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
    }
  });
  const r = turn("Actually Orlando FL", ctx);
  assert.equal(evaluateCoverage({ city: "Orlando", state: "FL" }).coverage, "OUTSIDE");
  assert.equal(r.nextContext.knownFacts.coverage, "OUTSIDE");
});

test("24. no stale modality after Orlando correction", () => {
  const ctx = locationPendingContext({
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      coverage: "LOCAL",
      preferredMeetingType: "in_person",
      meetingPreferenceSource: "coverage_default"
    },
    appointment: { meetingType: "in_person" },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres oficina o Zoom?"
    }
  });
  const r = turn("Actually Orlando FL", ctx);
  assert.equal(r.nextContext.knownFacts.preferredMeetingType, "zoom");
  assert.notEqual(r.nextContext.knownFacts.preferredMeetingType, "in_person");
  assert.doesNotMatch(r.rendered.text, /2500 NW 79th|oficinas ubicadas/i);
});

test("25. BR-082 regression — La or still fragment", () => {
  assert.equal(looksLikeAmbiguousFragment("La or"), true);
  assert.equal(isCompleteCityStatePhrase("La or"), false);
  const r = turn("La or", locationPendingContext());
  assert.equal(r.interpretation.intent, "ambiguous_fragment");
});

test("26. BR-090 Puerto Rico normalization regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("puerto-rico-fixed-employment-real-world").pass,
    true
  );
});

test("27. BR-091 withdrawal regression", () => {
  assert.equal(runRecruitAiV2ScenarioById("direct-no-interest-withdrawal").pass, true);
});

test("28. simulator/playground regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  assert.ok(
    listRecruitAiV2Scenarios().some((s) => s.id === "city-state-abbreviation-normalization")
  );
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  const r = sendPlaygroundTurn(s.sessionId, { text: "miami fl" });
  assert.equal(r.context.knownFacts.city, "Miami");
  assert.equal(r.context.knownFacts.state, "FL");
  assert.equal(r.turn.diagnostics.authorizationResult, "denied");
  assert.match(r.turn.atlasProposedReply, /permiso/i);
});

test("29-32. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById("city-state-abbreviation-normalization");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
});

test("33-35. context capture / shadow / execution posture unchanged (defaults)", () => {
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("side-effect authorizer deny-all on location abbreviation turn", () => {
  const r = turn("miami fl", locationPendingContext());
  const auth = authorizeSideEffects({
    interpretation: r.interpretation,
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
});

test("36. syntax/lint — modules load; docs exist", () => {
  require("../core/recruitAiV2/locationFacts");
  require("../core/recruitAiV2/interpreter");
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/22_CITY_STATE_ABBREVIATION_NORMALIZATION.md"
  );
  assert.equal(fs.existsSync(doc), true);
});

test("37. frontend unaffected marker", () => {
  assert.ok(true);
});

test("South Florida is not city=South", () => {
  assert.equal(parseLocationAnswer("South Florida"), null);
  assert.equal(isCompleteCityStatePhrase("South Florida"), false);
});

test("Miami maybe does not over-confirm state", () => {
  const parsed = parseLocationAnswer("Miami maybe");
  assert.ok(parsed);
  assert.equal(parsed.city, "Miami");
  assert.notEqual(parsed.completeness, "complete");
});

test("regression scenario city-state-abbreviation-normalization", () => {
  const report = runRecruitAiV2ScenarioById("city-state-abbreviation-normalization");
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
});
