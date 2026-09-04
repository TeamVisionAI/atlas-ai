/**
 * Pending ask_authorization must accept natural Spanish possessives
 * ("Si lo tengo") and must not invent auth from bare Si elsewhere.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");

const GENERIC_FALLBACK =
  "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?";
const FIXED_NOW = new Date("2026-09-04T15:00:00.000-04:00");

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

function authPending(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
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
    },
    ...overrides
  });
}

function locationPending() {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado te encuentras?"
    }
  });
}

function assertAuthorizedAdvance(phrase, r) {
  assert.equal(
    parseWorkAuthorizationAnswer(phrase, authPending()),
    WORK_AUTHORIZATION.AUTHORIZED,
    phrase
  );
  assert.equal(r.interpretation.intent, "provide_authorization", phrase);
  assert.equal(r.nextContext.knownFacts.workAuthorization, true, phrase);
  assert.equal(
    r.nextContext.knownFacts.workAuthorizationStatus,
    WORK_AUTHORIZATION.AUTHORIZED,
    phrase
  );
  assert.notEqual(
    r.nextContext.conversation.lastQuestionAsked,
    "ask_authorization",
    phrase
  );
  assert.doesNotMatch(String(r.rendered.text || ""), /dato que te acabo de pedir/i);
  assert.doesNotMatch(String(r.rendered.text || ""), /permiso de trabajo/i);
  assert.doesNotMatch(String(r.rendered.text || ""), /c[oó]mo te llamas|tu nombre/i);
  assert.match(String(r.rendered.text || ""), /mañana|tarde/i);
}

test("A) pending work-auth + Si lo tengo => authorized and next question", () => {
  const r = turn("Si lo tengo", authPending());
  assertAuthorizedAdvance("Si lo tengo", r);
});

test("B) pending work-auth + Si tengo documentos para trabajar => authorized", () => {
  const r = turn("Si tengo documentos para trabajar", authPending());
  assertAuthorizedAdvance("Si tengo documentos para trabajar", r);
});

test("C) pending work-auth + bare Si => authorized", () => {
  const r = turn("Si", authPending());
  assertAuthorizedAdvance("Si", r);
});

test("D) no pending work-auth + bare Si => do not invent workAuthorization", () => {
  const r = turn("Si", locationPending());
  assert.equal(parseWorkAuthorizationAnswer("Si", locationPending()), null);
  assert.notEqual(r.interpretation.intent, "provide_authorization");
  assert.notEqual(r.nextContext.knownFacts.workAuthorization, true);
});

test("E) pending work-auth + No lo tengo => negative", () => {
  const r = turn("No lo tengo", authPending());
  assert.equal(
    parseWorkAuthorizationAnswer("No lo tengo", authPending()),
    WORK_AUTHORIZATION.NOT_AUTHORIZED
  );
  assert.equal(r.interpretation.entities.workAuthorization, false);
  assert.notEqual(r.nextContext.knownFacts.workAuthorization, true);
  assert.doesNotMatch(String(r.rendered.text || ""), /dato que te acabo de pedir/i);
});

test("F) pending work-auth + Estoy esperando el permiso => not affirmative", () => {
  assert.equal(
    parseWorkAuthorizationAnswer("Estoy esperando el permiso", authPending()),
    WORK_AUTHORIZATION.NOT_AUTHORIZED
  );
  const r = turn("Estoy esperando el permiso", authPending());
  assert.notEqual(r.nextContext.knownFacts.workAuthorization, true);
  assert.doesNotMatch(String(r.rendered.text || ""), new RegExp(GENERIC_FALLBACK.replace(/[—?]/g, ".")));
});

test("G) FAQ then Si lo tengo resumes authorization correctly", () => {
  const faq = turn("Para que sería el trabajo?", authPending());
  assert.equal(faq.interpretation.intent, "job_opportunity_question");
  assert.equal(faq.nextContext.conversation.lastQuestionAsked, "ask_authorization");
  assert.notEqual(faq.nextContext.knownFacts.workAuthorization, true);

  const r = turn("Si lo tengo", faq.nextContext);
  assertAuthorizedAdvance("Si lo tengo", r);
  assert.equal(r.nextContext.knownFacts.city, "Miami");
});

test("H) accepted answer does not re-ask generic pending-data fallback", () => {
  for (const phrase of [
    "si lo tengo",
    "lo tengo",
    "tengo",
    "tengo permiso",
    "tengo documentos",
    "si tengo documentos",
    "estoy autorizado para trabajar"
  ]) {
    const r = turn(phrase, authPending());
    assert.doesNotMatch(
      String(r.rendered.text || ""),
      /dato que te acabo de pedir/i,
      phrase
    );
    assert.equal(r.nextContext.knownFacts.workAuthorization, true, phrase);
  }
});

test("I) accent and no-accent variants", () => {
  for (const phrase of ["Sí lo tengo", "si lo tengo", "Sí tengo documentos", "sí"]) {
    const r = turn(phrase, authPending());
    assertAuthorizedAdvance(phrase, r);
  }
});
