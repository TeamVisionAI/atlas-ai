/**
 * BR-232 — pending location accepts a street-address line when it ends
 * in a catalog-known city + recognized state.
 * Production: "Vivo en la 1535 NT 180 ST NORTH MIAMI BEACH Florida."
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
const {
  parseLocationAnswer,
  extractLocationCandidateText,
  extractTrailingKnownCityState,
  looksLikeConversationalProseCity
} = require("../core/recruitAiV2/locationFacts");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { LOCAL_CITIES } = require("../core/localAreaConfig");

const GENERIC_FALLBACK =
  "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?";
const PRODUCTION =
  "Vivo en la 1535 NT 180 ST NORTH MIAMI BEACH Florida.";
const OTHER_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const FIXED_NOW = new Date("2026-09-05T15:00:00.000-04:00");

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

function assertNorthMiamiBeachFl(parsed, label) {
  assert.ok(parsed, label);
  assert.equal(parsed.city, "North Miami Beach", label);
  assert.equal(parsed.state, "FL", label);
  assert.equal(parsed.completeness, "complete", label);
}

test("docs: BR-232 trailing known locality", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-232/);
  assert.match(rules, /trailing known city\/state/i);
});

test("A) exact production phrase parses North Miami Beach + FL", () => {
  const extracted = extractLocationCandidateText(PRODUCTION);
  assert.match(String(extracted.text || ""), /NORTH MIAMI BEACH Florida/i);
  assert.equal(looksLikeConversationalProseCity(extracted.text), true);
  assertNorthMiamiBeachFl(parseLocationAnswer(PRODUCTION), "production parse");
  const r = turn(PRODUCTION, locationPending());
  assert.match(r.interpretation.intent, /provide_location|correct_location/);
  assert.equal(r.interpretation.entities.city, "North Miami Beach");
  assert.equal(r.interpretation.entities.state, "FL");
  assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
});

test("B) normalized NW/180th address parses the same", () => {
  assertNorthMiamiBeachFl(
    parseLocationAnswer("1535 NW 180 ST NORTH MIAMI BEACH Florida"),
    "NW ST"
  );
  assertNorthMiamiBeachFl(
    parseLocationAnswer("1535 NW 180th St NORTH MIAMI BEACH Florida"),
    "180th"
  );
});

test("C) comma-formatted full address parses the same", () => {
  assertNorthMiamiBeachFl(
    parseLocationAnswer("Estoy en 1535 NW 180th St, North Miami Beach, FL"),
    "comma FL"
  );
});

test("D) bare North Miami Beach Florida still works", () => {
  assertNorthMiamiBeachFl(
    parseLocationAnswer("North Miami Beach Florida"),
    "bare city+state"
  );
  assertNorthMiamiBeachFl(
    parseLocationAnswer("Vivo en North Miami Beach FL"),
    "vivo en FL"
  );
});

test("E) multi-word city is preserved exactly", () => {
  const parsed = extractTrailingKnownCityState(
    "la 1535 NT 180 ST NORTH MIAMI BEACH Florida"
  );
  assert.equal(parsed.city, "North Miami Beach");
  assert.notEqual(parsed.city, "Beach");
  assert.notEqual(parsed.city, "Miami");
  assert.notEqual(parsed.city, "North Miami");
});

test("F) numeric street components are not mistaken for city", () => {
  const parsed = parseLocationAnswer(PRODUCTION);
  assert.notEqual(parsed.city, "1535");
  assert.notEqual(parsed.city, "180");
  assert.notEqual(parsed.city, "NT");
  assert.notEqual(parsed.city, "ST");
});

test("G) Team Vision coverage resolves North Miami Beach LOCAL", () => {
  assert.ok(LOCAL_CITIES.includes("north miami beach"));
  const coverage = evaluateCoverage({
    city: "North Miami Beach",
    state: "FL",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.equal(coverage.coverage, "LOCAL");
});

test("H) another tenant with no North Miami Beach local coverage remains OUTSIDE", () => {
  const coverage = evaluateCoverage({
    city: "North Miami Beach",
    state: "FL",
    organizationId: OTHER_ORG,
    localCities: []
  });
  assert.equal(coverage.coverage, "OUTSIDE");
});

test("I) ambiguous/insufficient address still asks clarification", () => {
  const r = turn("Vivo en la 1535 NT 180 ST", locationPending());
  assert.notEqual(r.interpretation.intent, "provide_location");
  assert.equal(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
});

test("M) pending city/state conversation advances qualification", () => {
  const r = turn(PRODUCTION, locationPending());
  assert.equal(r.nextContext.knownFacts.city, "North Miami Beach");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.notEqual(r.rendered.text, GENERIC_FALLBACK);
  assert.notEqual(r.structuredDecision.decision.nextAction, "clarify_once");
  assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
  assert.match(r.rendered.text, /North Miami Beach/i);
  assert.match(r.rendered.text, /autorizaci[oó]n|permiso de trabajo|documentaci[oó]n legal/i);
  assert.doesNotMatch(r.rendered.text, /ciudad y estado|what city and state/i);
});
