/**
 * BR-235 — Recruit V2 uses the national U.S. locality resolver, then BR-226 coverage.
 * Does not copy the Census dataset into CITY_TO_PROPOSED_STATE.
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
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { RESOLUTION_SOURCE } = require("../core/usLocalityResolver");

const PRODUCTION_371 = "Hola gracias estoy en Orlando";
const PRODUCTION_376 = "Vivo en la 1535 NT 180 ST NORTH MIAMI BEACH Florida.";
const OTHER_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const FIXED_NOW = new Date("2026-09-05T16:00:00.000-04:00");

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

function locationPending(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado te encuentras?"
    },
    ...overrides
  });
}

function assertComplete(parsed, city, state, label) {
  assert.ok(parsed, label);
  assert.equal(parsed.city, city, label);
  assert.equal(parsed.state, state, label);
  assert.equal(parsed.completeness, "complete", label);
}

test("docs: BR-235 national resolution then coverage", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-235/);
  assert.match(rules, /nationally before tenant coverage/i);
  assert.match(rules, /BR-233/);
  assert.match(rules, /BR-226/);
});

test("A) #371 production Orlando conversational parse is unchanged", () => {
  const parsed = parseLocationAnswer(PRODUCTION_371);
  assert.equal(parsed.city, "Orlando");
  assert.equal(parsed.state, "FL");
  const r = turn(PRODUCTION_371, locationPending());
  assert.match(r.interpretation.intent, /provide_location|correct_location/);
  assert.equal(r.interpretation.entities.city, "Orlando");
  assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
});

test("B) #376 production North Miami Beach street address is unchanged", () => {
  assertComplete(parseLocationAnswer(PRODUCTION_376), "North Miami Beach", "FL", "376");
  const r = turn(PRODUCTION_376, locationPending());
  assert.equal(r.interpretation.entities.city, "North Miami Beach");
  assert.equal(r.interpretation.entities.state, "FL");
  assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
});

test("C) Dallas full address resolves nationally", () => {
  const parsed = parseLocationAnswer("123 Main St Dallas TX");
  assertComplete(parsed, "Dallas", "TX", "dallas street");
  assert.equal(parsed.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  assert.notEqual(parsed.city, "Main");
  assert.notEqual(parsed.city, "123");
});

test("D) Charlotte conversational wrapper resolves", () => {
  assertComplete(parseLocationAnswer("Estoy en Charlotte NC"), "Charlotte", "NC", "charlotte");
  assertComplete(parseLocationAnswer("Vivo en Dallas Texas"), "Dallas", "TX", "dallas vivo");
  assertComplete(
    parseLocationAnswer("I live in Atlanta Georgia"),
    "Atlanta",
    "GA",
    "atlanta live"
  );
});

test("E) Salt Lake City multi-word is preserved", () => {
  const parsed = parseLocationAnswer("Salt Lake City UT");
  assertComplete(parsed, "Salt Lake City", "UT", "slc");
  assert.notEqual(parsed.city, "Lake");
  assert.notEqual(parsed.city, "Salt Lake");
  assertComplete(parseLocationAnswer("West Palm Beach FL"), "West Palm Beach", "FL", "wpb");
  assertComplete(parseLocationAnswer("San Antonio TX"), "San Antonio", "TX", "satx");
  assertComplete(parseLocationAnswer("Fort Lauderdale FL"), "Fort Lauderdale", "FL", "ftl");
  assertComplete(parseLocationAnswer("New York City NY"), "New York", "NY", "nyc");
  assertComplete(parseLocationAnswer("Brooklyn NY"), "Brooklyn", "NY", "bk");
});

test("F) Springfield bare clarifies and does not infer a state", () => {
  const parsed = parseLocationAnswer("Springfield");
  assert.equal(parsed.city, "Springfield");
  assert.equal(parsed.state, null);
  assert.equal(parsed.proposedState, null);
  assert.equal(parsed.completeness, "partial");
  assert.equal(parsed.requiresClarification, true);
  const r = turn("estoy en Springfield", locationPending());
  assert.equal(r.interpretation.entities.city, "Springfield");
  assert.equal(r.interpretation.entities.state, null);
  assert.match(r.structuredDecision.customerReplyPlan.templateKey, /ask_state/);
});

test("G) Springfield IL is complete", () => {
  assertComplete(parseLocationAnswer("Springfield IL"), "Springfield", "IL", "springfield il");
});

test("H) ZIP-valid pair is complete", () => {
  const parsed = parseLocationAnswer("Dallas TX 75201");
  assertComplete(parsed, "Dallas", "TX", "dallas zip");
  assert.equal(parsed.zip, "75201");
  assert.equal(parsed.resolutionSource, RESOLUTION_SOURCE.ZIP_CROSSWALK);
  assertComplete(
    parseLocationAnswer("44 Beacon St Boston MA 02108"),
    "Boston",
    "MA",
    "boston zip street"
  );
});

test("I) ZIP mismatch clarifies rather than guessing", () => {
  const parsed = parseLocationAnswer("Dallas TX 10001");
  assert.equal(parsed.city, "Dallas");
  assert.notEqual(parsed.completeness, "complete");
  assert.equal(parsed.requiresClarification, true);
  assert.equal(parsed.proposedState, "TX");
  const r = turn("Dallas TX 10001", locationPending());
  assert.notEqual(
    r.structuredDecision.customerReplyPlan.templateKey,
    "continue_qualification_after_location"
  );
});

test("J) invented city + Texas is not high-confidence gazetteer", () => {
  const parsed = parseLocationAnswer("Something Fake Texas");
  assert.notEqual(parsed?.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  assert.notEqual(parsed?.confidence, "high");
  assert.notEqual(parsed?.resolutionSource, RESOLUTION_SOURCE.ZIP_CROSSWALK);
});

test("K) Team Vision LOCAL vs OUTSIDE after national resolution", () => {
  const nmb = parseLocationAnswer("North Miami Beach Florida");
  const dallas = parseLocationAnswer("Dallas Texas");
  assertComplete(nmb, "North Miami Beach", "FL", "nmb");
  assertComplete(dallas, "Dallas", "TX", "dallas");
  assert.equal(
    evaluateCoverage({
      city: nmb.city,
      state: nmb.state,
      organizationId: TEAM_VISION_ORGANIZATION_ID
    }).coverage,
    "LOCAL"
  );
  assert.equal(
    evaluateCoverage({
      city: dallas.city,
      state: dallas.state,
      organizationId: TEAM_VISION_ORGANIZATION_ID
    }).coverage,
    "OUTSIDE"
  );
});

test("L) empty localCities is OUTSIDE for the same resolved city", () => {
  const parsed = parseLocationAnswer("North Miami Beach Florida");
  assertComplete(parsed, "North Miami Beach", "FL", "nmb empty");
  assert.equal(
    evaluateCoverage({
      city: parsed.city,
      state: parsed.state,
      organizationId: OTHER_ORG,
      localCities: []
    }).coverage,
    "OUTSIDE"
  );
});

test("M) work-auth follows a successful national location parse", () => {
  const located = turn("Dallas Texas", locationPending());
  assert.equal(located.nextContext.knownFacts.city, "Dallas");
  assert.equal(located.nextContext.knownFacts.state, "TX");
  assert.equal(located.nextContext.conversation.lastQuestionAsked, "ask_authorization");
  const auth = turn("sí, tengo permiso", located.nextContext);
  assert.equal(auth.interpretation.intent, "provide_authorization");
  assert.notEqual(auth.structuredDecision.customerReplyPlan.templateKey, "ask_location");
  assert.notEqual(auth.nextContext.knownFacts.city, null);
});

test("N) street number and street name never become city", () => {
  const parsed = parseLocationAnswer("123 Main St Dallas TX");
  assert.notEqual(parsed.city, "123");
  assert.notEqual(parsed.city, "Main");
  assert.notEqual(parsed.city, "St");
  assert.equal(parsed.city, "Dallas");
});

test("O) FAQ containing a city word is not hijacked", () => {
  const parsed = parseLocationAnswer(
    "Me gustaria saber las posiciones disponibles en Miami"
  );
  assert.equal(parsed, null);
  const r = turn(
    "Me gustaria saber las posiciones disponibles en Miami",
    locationPending()
  );
  assert.notEqual(r.interpretation.intent, "provide_location");
});

test("P) scheduling phrase with a state-like token is not hijacked", () => {
  assert.equal(parseLocationAnswer("mejor mañana"), null);
  assert.equal(parseLocationAnswer("para hoy"), null);
  const r = turn("mejor mañana", locationPending());
  assert.notEqual(r.interpretation.intent, "provide_location");
});

test("Q) non-US locations do not become complete U.S. pairs", () => {
  const toronto = parseLocationAnswer("Toronto Ontario");
  const havana = parseLocationAnswer("Havana Cuba");
  const london = parseLocationAnswer("London UK");
  assert.notEqual(toronto?.completeness, "complete");
  assert.notEqual(havana?.completeness, "complete");
  assert.notEqual(london?.completeness, "complete");
  assert.notEqual(toronto?.state, "ON");
  assert.notEqual(havana?.state, "CU");
});

test("CITY_TO_PROPOSED_STATE remains a small overlay, not a national copy", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/locationFacts.js"),
    "utf8"
  );
  assert.match(src, /CITY_TO_PROPOSED_STATE/);
  assert.match(src, /tryNationalUsLocalityResolution/);
  assert.match(src, /resolveUsLocality/);
  const catalog = require("../core/recruitAiV2/locationFacts").CITY_TO_PROPOSED_STATE;
  assert.ok(Object.keys(catalog).length < 200);
});
