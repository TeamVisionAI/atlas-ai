/**
 * Pending ask_location must capture conversational city-only answers
 * ("Hola gracias estoy en orlando") instead of generic clarify_once.
 * Implements BR-082 / BR-094 / BR-155. Shared parser — not Orlando-only.
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
  extractLocationCandidateText
} = require("../core/recruitAiV2/locationFacts");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");

const GENERIC_FALLBACK =
  "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?";
const LOCATION_ASK =
  "¿En qué ciudad y estado te encuentras?";
const HALLANDALE_PREF =
  "Donde esran ubicado husconalgo serca a halandey";
const OTHER_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const FIXED_NOW = new Date("2026-09-04T18:00:00.000-04:00");

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
      lastAtlasOutboundText: LOCATION_ASK
    },
    ...overrides
  });
}

function assertCapturedCity(result, city, label) {
  assert.match(result.interpretation.intent, /provide_location|correct_location/, label);
  assert.equal(result.interpretation.entities.city, city, label);
  assert.equal(result.nextContext.knownFacts.city, city, label);
  assert.notEqual(
    result.structuredDecision.customerReplyPlan.templateKey,
    "clarify_once",
    label
  );
  assert.notEqual(result.rendered.text, GENERIC_FALLBACK, label);
  assert.doesNotMatch(result.rendered.text, /dato que te acabo de pedir/i, label);
}

test("A) pending ask_location + Hola gracias estoy en orlando captures Orlando", () => {
  const extracted = extractLocationCandidateText("Hola gracias estoy en orlando");
  assert.equal(String(extracted.text || "").toLowerCase(), "orlando");
  const parsed = parseLocationAnswer("Hola gracias estoy en orlando");
  assert.equal(parsed.city, "Orlando");
  const r = turn("Hola gracias estoy en orlando", locationPending());
  assertCapturedCity(r, "Orlando", "production phrase");
});

test("B) estoy en Orlando captures Orlando", () => {
  const parsed = parseLocationAnswer("estoy en Orlando");
  assert.equal(parsed.city, "Orlando");
  const r = turn("estoy en Orlando", locationPending());
  assertCapturedCity(r, "Orlando", "estoy en");
});

test("C) vivo en Orlando captures Orlando", () => {
  const parsed = parseLocationAnswer("vivo en Orlando");
  assert.equal(parsed.city, "Orlando");
  const r = turn("vivo en Orlando", locationPending());
  assertCapturedCity(r, "Orlando", "vivo en");
});

test("D) bare Orlando captures Orlando", () => {
  const parsed = parseLocationAnswer("Orlando");
  assert.equal(parsed.city, "Orlando");
  const r = turn("Orlando", locationPending());
  assertCapturedCity(r, "Orlando", "bare city");
});

test("E) city-only does not produce generic clarify_once", () => {
  for (const text of [
    "Hola gracias estoy en orlando",
    "estoy en Tampa",
    "soy de Kissimmee",
    "me encuentro en Doral",
    "estoy ubicado en Miami"
  ]) {
    const r = turn(text, locationPending());
    assert.notEqual(
      r.structuredDecision.customerReplyPlan.templateKey,
      "clarify_once",
      text
    );
    assert.notEqual(r.rendered.text, GENERIC_FALLBACK, text);
    assert.ok(r.interpretation.entities.city, text);
  }
});

test("F) state confirmation is specific when required, never invented", () => {
  const atlanta = turn("Atlanta", locationPending());
  assert.equal(atlanta.interpretation.entities.city, "Atlanta");
  assert.equal(atlanta.interpretation.entities.state, null);
  assert.equal(atlanta.interpretation.entities.proposedState, "GA");
  assert.equal(
    atlanta.structuredDecision.customerReplyPlan.templateKey,
    "confirm_location_proposal"
  );
  assert.match(atlanta.rendered.text, /Atlanta/i);
  assert.match(atlanta.rendered.text, /GA|Georgia/i);
  assert.notEqual(atlanta.rendered.text, GENERIC_FALLBACK);

  const conversationalAtlanta = turn("estoy en Atlanta", locationPending());
  assert.equal(conversationalAtlanta.interpretation.entities.city, "Atlanta");
  assert.match(
    conversationalAtlanta.structuredDecision.customerReplyPlan.templateKey,
    /confirm_location|ask_state/
  );
  assert.match(conversationalAtlanta.rendered.text, /Atlanta/i);
  assert.notEqual(conversationalAtlanta.rendered.text, GENERIC_FALLBACK);

  const springfield = turn("estoy en Springfield", locationPending());
  assert.equal(springfield.interpretation.entities.city, "Springfield");
  assert.equal(springfield.interpretation.entities.proposedState, null);
  assert.match(
    springfield.structuredDecision.customerReplyPlan.templateKey,
    /ask_state/
  );
  assert.match(springfield.rendered.text, /estado/i);
  assert.doesNotMatch(springfield.rendered.text, /Illinois|Missouri|Massachusetts/i);
  assert.notEqual(springfield.rendered.text, GENERIC_FALLBACK);
});

test("G) Orlando Florida still captures city+state", () => {
  const parsed = parseLocationAnswer("Orlando Florida");
  assert.equal(parsed.city, "Orlando");
  assert.equal(parsed.state, "FL");
  assert.equal(parsed.completeness, "complete");
  const r = turn("Orlando Florida", locationPending());
  assertCapturedCity(r, "Orlando", "city+state");
  assert.equal(r.nextContext.knownFacts.state, "FL");
});

test("H) unrelated text while ask_location pending can still clarify", () => {
  const r = turn("la or", locationPending());
  assert.notEqual(r.interpretation.intent, "provide_location");
  assert.notEqual(r.interpretation.intent, "correct_location");
  assert.equal(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once");
});

test("I) confirmed location is not overwritten by location-preference FAQ", () => {
  const confirmed = locationPending({
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
    }
  });
  const r = turn(HALLANDALE_PREF, confirmed);
  assert.equal(r.interpretation.intent, "office_location_question");
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.notEqual(r.nextContext.knownFacts.city, "Hallandale");
});

test("shared parser: other conversational cities and other tenant", () => {
  for (const [text, city] of [
    ["soy de Tampa", "Tampa"],
    ["me encuentro en Houston", "Houston"],
    ["estoy ubicada en Chicago", "Chicago"],
    ["I live in Dallas", "Dallas"]
  ]) {
    const parsed = parseLocationAnswer(text);
    assert.equal(parsed.city, city, text);
  }

  const otherTenant = turn(
    "Hola gracias estoy en orlando",
    locationPending({ organizationId: OTHER_ORG })
  );
  assertCapturedCity(otherTenant, "Orlando", "non-TV tenant");
});

test("explicit correction No, estoy en Orlando updates city", () => {
  const prior = locationPending({
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
    }
  });
  const r = turn("No, estoy en Orlando", prior);
  assert.match(r.interpretation.intent, /correct_location|provide_location/);
  assert.equal(r.interpretation.entities.city, "Orlando");
  assert.equal(r.nextContext.knownFacts.city, "Orlando");
});

test("J) BR-082 documents pending conversational location extract", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-082/);
  assert.match(rules, /estoy en/);
  assert.match(rules, /Hola gracias estoy en orlando|greeting\/thanks/);
});
