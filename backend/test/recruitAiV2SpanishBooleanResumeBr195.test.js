/**
 * BR-195 — Spanish courtesy-form yes + recoverable clarification.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { parseWorkAuthorizationAnswer, WORK_AUTHORIZATION } = require("../core/recruitAiV2/qualificationFacts");
const { isBareConversationalYes } = require("../core/languageLibrary");

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
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
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

test("docs: BR-195 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-195/);
  assert.match(rules, /sí señor/i);
});

test("A) Si señor → authorization=true → next qualification step", () => {
  for (const phrase of ["Si señor", "sí señor", "si", "claro que sí", "así es", "por supuesto"]) {
    assert.equal(isBareConversationalYes(phrase), true, phrase);
    assert.equal(
      parseWorkAuthorizationAnswer(phrase, authPending()),
      WORK_AUTHORIZATION.AUTHORIZED,
      phrase
    );
  }

  const r = turn("Si señor", authPending());
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.notEqual(r.nextContext.conversation.lastQuestionAsked, "ask_authorization");
  assert.match(String(r.rendered.text || ""), /mañana|tarde/i);
  assert.doesNotMatch(String(r.rendered.text || ""), /permiso de trabajo/i);
});

test("B) Discúlpame cual dato restates pending question and does not hand off", () => {
  const r = turn("Discúlpame cual dato", authPending());
  assert.equal(r.interpretation.intent, "conversation_clarification_request");
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "safe_uncertain_escalate");
  assert.match(String(r.rendered.text || ""), /autorizaci[oó]n|permiso de trabajo|Estados Unidos/i);
  assert.notEqual(r.nextContext.currentStage, "human_required");
});

test("C) one inbound does not emit duplicate Perfecto", () => {
  const r = turn("Si señor", authPending());
  const text = String(r.rendered.text || "");
  const matches = text.match(/perfecto/gi) || [];
  assert.ok(matches.length <= 1, text);
  assert.doesNotMatch(text, /Perfecto\.\s+Excelente/i);
});
