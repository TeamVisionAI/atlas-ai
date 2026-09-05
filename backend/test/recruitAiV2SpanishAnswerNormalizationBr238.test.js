/**
 * BR-238 — Spanish pending-answer aliases (Sip, en las tardes, IUL unknown).
 */

"use strict";

require("dotenv").config();

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { interpretInboundMessage, parseDayPart } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
const { isBareConversationalYes } = require("../core/languageLibrary");
const {
  classifyCarrier,
  looksLikeOptionalUnknown,
  classifyDocumentsAvailable,
  DOCUMENTS_AVAILABLE
} = require("../core/recruitAiV2/iulDiscoveryFacts");
const { ASK, parseIulReviewDayPart } = require("../core/recruitAiV2/iulAdConversation");

const FIXED_NOW = new Date("2026-09-01T15:00:00.000-04:00");

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
  return { interpretation, structuredDecision, nextContext };
}

function authPending() {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
    }
  });
}

function dayPartPending() {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      coverage: "LOCAL"
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
    }
  });
}

function iulCarrierPending() {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: "policy_review",
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    knownFacts: {
      policyType: "IUL",
      iulPolicyActive: true
    },
    conversation: {
      lastQuestionAsked: ASK.CARRIER,
      lastAtlasOutboundText:
        "¿Recuerda con qué compañía o aseguradora está la póliza? Si no lo sabe, no hay problema."
    }
  });
}

test("docs: BR-238 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-238/);
  assert.match(rules, /sip/i);
  assert.match(rules, /en las tardes/i);
});

test("A. pending work authorization + Sip => YES and advance", () => {
  assert.equal(isBareConversationalYes("Sip"), true);
  assert.equal(
    parseWorkAuthorizationAnswer("Sip", authPending()),
    WORK_AUTHORIZATION.AUTHORIZED
  );
  const r = turn("Sip", authPending());
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.interpretation.entities.workAuthorization, true);
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, "ask_authorization");
  assert.notEqual(r.structuredDecision.customerReplyPlan?.templateKey, "clarify_once");
});

test("B. pending work authorization + Sipi => YES", () => {
  assert.equal(isBareConversationalYes("Sipi"), true);
  assert.equal(
    parseWorkAuthorizationAnswer("Sipi", authPending()),
    WORK_AUTHORIZATION.AUTHORIZED
  );
  const r = turn("Sipi", authPending());
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
});

test("C. pending work authorization + No => not authorized", () => {
  assert.equal(
    parseWorkAuthorizationAnswer("No", authPending()),
    WORK_AUTHORIZATION.NOT_AUTHORIZED
  );
  const r = turn("No", authPending());
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.interpretation.entities.workAuthorization, false);
  assert.equal(r.nextContext.knownFacts.workAuthorization, false);
});

test("D. pending daypart + En las tardes => AFTERNOON", () => {
  assert.equal(parseDayPart("En las tardes")?.dayPart, "afternoon");
  const r = turn("En las tardes", dayPartPending());
  assert.equal(r.interpretation.intent, "provide_day_part");
  assert.equal(r.interpretation.entities.dayPart, "afternoon");
  assert.equal(r.nextContext.knownFacts.preferredDayPart, "afternoon");
  assert.notEqual(r.interpretation.intent, "provide_location");
});

test("E. pending daypart + por las tardes => AFTERNOON", () => {
  assert.equal(parseDayPart("por las tardes")?.dayPart, "afternoon");
  assert.equal(parseIulReviewDayPart("por las tardes"), "afternoon");
  const r = turn("por las tardes", dayPartPending());
  assert.equal(r.nextContext.knownFacts.preferredDayPart, "afternoon");
});

test("F. pending IUL carrier + No => answered unknown and advance", () => {
  const classified = classifyCarrier("No");
  assert.equal(classified.carrier, null);
  assert.equal(classified.carrierRaw, null);
  assert.equal(classified.resolved, true);
  const r = turn("No", iulCarrierPending());
  assert.equal(r.interpretation.intent, "iul_carrier");
  assert.equal(r.interpretation.entities.carrier, null);
  assert.equal(r.nextContext.knownFacts.carrier, null);
  assert.equal(r.nextContext.knownFacts.carrierResolved, true);
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, ASK.CARRIER);
});

test("G. pending IUL carrier + No recuerdo => answered unknown and advance", () => {
  const classified = classifyCarrier("No recuerdo");
  assert.equal(classified.carrier, null);
  assert.equal(classified.resolved, true);
  const r = turn("No recuerdo", iulCarrierPending());
  assert.equal(r.nextContext.knownFacts.carrier, null);
  assert.equal(r.nextContext.knownFacts.carrierResolved, true);
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, ASK.CARRIER);
});

test("H. pending IUL carrier + No me acuerdo => answered unknown and advance", () => {
  assert.equal(classifyCarrier("No me acuerdo").carrier, null);
  const r = turn("No me acuerdo", iulCarrierPending());
  assert.equal(r.nextContext.knownFacts.carrierResolved, true);
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, ASK.CARRIER);
});

test("I. pending IUL carrier + ni idea => answered unknown and advance", () => {
  assert.equal(classifyCarrier("ni idea").carrier, null);
  const r = turn("ni idea", iulCarrierPending());
  assert.equal(r.nextContext.knownFacts.carrier, null);
  assert.equal(r.nextContext.knownFacts.carrierResolved, true);
});

test("J. required documents yes/no No stays NO", () => {
  assert.equal(classifyDocumentsAvailable("No").value, DOCUMENTS_AVAILABLE.NO);
  assert.equal(
    parseWorkAuthorizationAnswer("No", authPending()),
    WORK_AUTHORIZATION.NOT_AUTHORIZED
  );
});

test("K. text containing no is not globally UNKNOWN", () => {
  assert.equal(looksLikeOptionalUnknown("Innovación"), false);
  assert.equal(looksLikeOptionalUnknown("norte de miami"), false);
  assert.equal(classifyCarrier("Nationwide").carrier, "Nationwide");
  assert.equal(classifyCarrier("Norton").carrier, "Norton");
  assert.equal(isBareConversationalYes("sip miami"), false);
  assert.equal(parseWorkAuthorizationAnswer("Sip", dayPartPending()), null);
});

test("L. English yes / afternoon / I don't know stay green", () => {
  assert.equal(isBareConversationalYes("yes"), true);
  assert.equal(
    parseWorkAuthorizationAnswer("yes", authPending()),
    WORK_AUTHORIZATION.AUTHORIZED
  );
  assert.equal(parseDayPart("afternoon")?.dayPart, "afternoon");
  const unknown = classifyCarrier("I don't know");
  assert.equal(unknown.carrier, null);
  assert.equal(unknown.resolved, true);
});
