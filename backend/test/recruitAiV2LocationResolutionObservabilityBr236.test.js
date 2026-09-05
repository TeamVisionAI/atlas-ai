/**
 * BR-236 — location resolution observability is measurement only.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { RESOLUTION_SOURCE } = require("../core/usLocalityResolver");
const {
  RESOLUTION_OUTCOME,
  COVERAGE_OUTCOME,
  EVENT_NAME,
  classifyLocationResolution,
  buildLocationResolutionEvent,
  setLocationResolutionEmitForTests,
  resetLocationResolutionEmitForTests
} = require("../core/recruitAiV2/locationResolutionObservability");

const OTHER_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const FIXED_NOW = new Date("2026-09-05T18:20:00.000-04:00");

function locationPending(organizationId = TEAM_VISION_ORGANIZATION_ID) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    organizationId,
    prospectId: organizationId === TEAM_VISION_ORGANIZATION_ID ? "prospect-tv" : "prospect-other",
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado te encuentras?"
    }
  });
}

function captureEvents() {
  const events = [];
  setLocationResolutionEmitForTests((_event, fields) => {
    events.push(fields);
    return true;
  });
  return events;
}

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  return { interpretation, structuredDecision };
}

test.beforeEach(() => {
  resetLocationResolutionEmitForTests();
});

test.afterEach(() => {
  resetLocationResolutionEmitForTests();
});

test("docs: BR-236 records resolver outcome separately from coverage", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-236/);
  assert.match(rules, /separate from coverage/i);
  assert.match(rules, /Do not treat OUTSIDE as a resolver miss/i);
  assert.match(rules, /Do not log raw message body/i);
});

test("A) Dallas TX is gazetteer complete and Team Vision OUTSIDE", () => {
  const events = captureEvents();
  const parsed = parseLocationAnswer("Dallas Texas");
  const classified = classifyLocationResolution({ parsed, rawText: "Dallas Texas" });
  assert.equal(classified.resolutionOutcome, RESOLUTION_OUTCOME.GAZETTEER_COMPLETE);
  assert.equal(parsed.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  assert.equal(
    evaluateCoverage({
      city: parsed.city,
      state: parsed.state,
      organizationId: TEAM_VISION_ORGANIZATION_ID
    }).coverage,
    "OUTSIDE"
  );
  turn("Dallas Texas", locationPending());
  assert.equal(events.length, 1);
  assert.equal(events[0].event, EVENT_NAME);
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.GAZETTEER_COMPLETE);
  assert.equal(events[0].coverageResult, COVERAGE_OUTCOME.OUTSIDE);
  assert.equal(events[0].nationalResolverMatched, true);
  assert.equal(events[0].organizationId, TEAM_VISION_ORGANIZATION_ID);
});

test("B) North Miami Beach FL is gazetteer complete and Team Vision LOCAL", () => {
  const events = captureEvents();
  turn("North Miami Beach Florida", locationPending());
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.GAZETTEER_COMPLETE);
  assert.equal(events[0].city, "North Miami Beach");
  assert.equal(events[0].coverageResult, COVERAGE_OUTCOME.LOCAL);
});

test("C) Orlando city-only uses FL overlay, not national gazetteer", () => {
  const events = captureEvents();
  const parsed = parseLocationAnswer("Hola gracias estoy en Orlando");
  const classified = classifyLocationResolution({
    parsed,
    rawText: "Hola gracias estoy en Orlando"
  });
  assert.equal(classified.resolutionOutcome, RESOLUTION_OUTCOME.FL_OVERLAY_COMPLETE);
  assert.notEqual(parsed.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  turn("Hola gracias estoy en Orlando", locationPending());
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.FL_OVERLAY_COMPLETE);
  assert.equal(events[0].fallbackUsed, true);
  assert.equal(events[0].nationalResolverMatched, false);
});

test("D) Halandey typo is catalog alias, not national gazetteer", () => {
  const events = captureEvents();
  const parsed = parseLocationAnswer("Halandey");
  const classified = classifyLocationResolution({ parsed, rawText: "Halandey" });
  assert.equal(classified.resolutionOutcome, RESOLUTION_OUTCOME.CATALOG_ALIAS_COMPLETE);
  assert.notEqual(parsed.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  turn("Halandey", locationPending());
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.CATALOG_ALIAS_COMPLETE);
  assert.equal(events[0].parserPath, "catalog_alias");
  assert.equal(events[0].nationalResolverMatched, false);
});

test("E) Springfield is ambiguous clarification", () => {
  const events = captureEvents();
  const parsed = parseLocationAnswer("Springfield");
  assert.equal(
    classifyLocationResolution({ parsed, rawText: "Springfield" }).resolutionOutcome,
    RESOLUTION_OUTCOME.AMBIGUOUS_CITY_CLARIFY
  );
  turn("Springfield", locationPending());
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.AMBIGUOUS_CITY_CLARIFY);
  assert.equal(events[0].requiresClarification, true);
  assert.equal(events[0].coverageResult, null);
  assert.equal(events[0].unresolvedPhraseKey, "springfield");
});

test("F) Springfield IL is gazetteer complete", () => {
  const events = captureEvents();
  turn("Springfield IL", locationPending());
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.GAZETTEER_COMPLETE);
  assert.equal(events[0].city, "Springfield");
  assert.equal(events[0].state, "IL");
});

test("G) ZIP mismatch is conflict clarify, not coverage", () => {
  const events = captureEvents();
  const parsed = parseLocationAnswer("Dallas TX 10001");
  assert.equal(
    classifyLocationResolution({ parsed, rawText: "Dallas TX 10001" }).resolutionOutcome,
    RESOLUTION_OUTCOME.ZIP_CONFLICT_CLARIFY
  );
  turn("Dallas TX 10001", locationPending());
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.ZIP_CONFLICT_CLARIFY);
  assert.equal(events[0].zipPresent, true);
  assert.equal(events[0].zipValidated, false);
  assert.equal(events[0].coverageResult, null);
});

test("H) invented city + Texas is legacy heuristic, not gazetteer-high", () => {
  const events = captureEvents();
  const parsed = parseLocationAnswer("Something Fake Texas");
  assert.equal(
    classifyLocationResolution({ parsed, rawText: "Something Fake Texas" }).resolutionOutcome,
    RESOLUTION_OUTCOME.LEGACY_HEURISTIC_COMPLETE
  );
  assert.notEqual(parsed.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  turn("Something Fake Texas", locationPending());
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.LEGACY_HEURISTIC_COMPLETE);
  assert.equal(events[0].fallbackUsed, true);
  assert.notEqual(events[0].confidence, "high");
});

test("I) Toronto Ontario is not a valid U.S. completion", () => {
  const parsed = parseLocationAnswer("Toronto Ontario");
  assert.notEqual(parsed?.completeness, "complete");
  const classified = classifyLocationResolution({ parsed, rawText: "Toronto Ontario" });
  assert.equal(classified.resolutionOutcome, RESOLUTION_OUTCOME.NON_US_OR_UNKNOWN);
});

test("J) FAQ containing a city name does not emit a location-resolution event", () => {
  const events = captureEvents();
  const parsed = parseLocationAnswer("Me gustaria saber las posiciones disponibles en Miami");
  assert.equal(parsed, null);
  assert.equal(
    classifyLocationResolution({
      parsed,
      rawText: "Me gustaria saber las posiciones disponibles en Miami"
    }).skipped,
    true
  );
  const r = turn(
    "Me gustaria saber las posiciones disponibles en Miami",
    locationPending()
  );
  assert.notEqual(r.interpretation.intent, "provide_location");
  assert.equal(events.length, 0);
});

test("K) same resolved city, different tenant coverage field", () => {
  const events = captureEvents();
  turn("North Miami Beach Florida", locationPending(TEAM_VISION_ORGANIZATION_ID));
  turn("North Miami Beach Florida", locationPending(OTHER_ORG));
  assert.equal(events.length, 2);
  assert.equal(events[0].reason, events[1].reason);
  assert.equal(events[0].city, events[1].city);
  assert.equal(events[0].reason, RESOLUTION_OUTCOME.GAZETTEER_COMPLETE);
  assert.equal(events[0].coverageResult, COVERAGE_OUTCOME.LOCAL);
  assert.equal(events[1].coverageResult, COVERAGE_OUTCOME.OUTSIDE);
  assert.notEqual(events[0].coverageResult, events[1].reason);
});

test("L) tenant isolation on event organizationId", () => {
  const events = captureEvents();
  turn("Dallas Texas", locationPending(TEAM_VISION_ORGANIZATION_ID));
  turn("Dallas Texas", locationPending(OTHER_ORG));
  assert.equal(events[0].organizationId, TEAM_VISION_ORGANIZATION_ID);
  assert.equal(events[1].organizationId, OTHER_ORG);
  assert.equal(events[0].prospectId, "prospect-tv");
  assert.equal(events[1].prospectId, "prospect-other");
  assert.notEqual(events[0].organizationId, events[1].organizationId);
});

test("M) event never stores raw body, street, phone, email, or full ZIP", () => {
  const events = captureEvents();
  turn("123 Main St Dallas TX 75201", locationPending());
  assert.equal(events.length, 1);
  const serialized = JSON.stringify(events[0]);
  assert.doesNotMatch(serialized, /123 Main/);
  assert.doesNotMatch(serialized, /75201/);
  assert.doesNotMatch(serialized, /\+1/);
  assert.doesNotMatch(serialized, /@/);
  assert.equal(events[0].phone, undefined);
  assert.equal(events[0].rawText, undefined);
  assert.equal(events[0].body, undefined);
  assert.equal(events[0].zip, undefined);
  assert.equal(events[0].zipPresent, true);
  const built = buildLocationResolutionEvent({
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    parsed: parseLocationAnswer("123 Main St Dallas TX 75201"),
    rawText: "123 Main St Dallas TX 75201",
    coverage: "OUTSIDE"
  });
  assert.doesNotMatch(JSON.stringify(built), /123 Main/);
});

test("IUL context does not emit a location-resolution event", () => {
  const events = captureEvents();
  const context = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    prospectId: "prospect-iul",
    _testNow: FIXED_NOW,
    campaignIntakePurpose: "IUL",
    knownFacts: { policyType: "IUL", iulQualificationStatus: "started" },
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado te encuentras?"
    }
  });
  turn("Dallas Texas", context);
  assert.equal(events.length, 0);
});

test("performance: classify+build stays in-process and cheap", () => {
  const parsed = parseLocationAnswer("Dallas Texas");
  const started = process.hrtime.bigint();
  for (let i = 0; i < 200; i += 1) {
    buildLocationResolutionEvent({
      organizationId: TEAM_VISION_ORGANIZATION_ID,
      parsed,
      rawText: "Dallas Texas",
      coverage: "OUTSIDE"
    });
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 50, `classify loop ${elapsedMs}ms`);
});
