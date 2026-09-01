/**
 * BR-196 — explicit job FAQ mid-qualification; first outbound stays lightweight.
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
const { getExplicitJobFaqAnswer, getAdLeadFirstTouchMessage } = require("../core/teamVisionWorkflowCopy");

function turn(text, context) {
  const interpretation = interpretInboundMessage({ message: { text }, context });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, rendered };
}

function authPending() {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
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

test("docs: BR-196 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-196/);
  assert.match(rules, /sales of financial products/);
});

test("first outbound stays lightweight and is not the role FAQ", () => {
  const first = getAdLeadFirstTouchMessage("es", {});
  assert.match(first, /ciudad y estado/i);
  assert.doesNotMatch(first, /ventas de productos financieros/i);

  const r = turn(
    "¡Hola! Quiero más información",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.match(r.rendered.text, /ciudad y estado/i);
  assert.doesNotMatch(r.rendered.text, /ventas de productos financieros/i);
});

test("explicit job questions mid-qualification answer then resume auth", () => {
  const approved = getExplicitJobFaqAnswer("es");
  assert.match(approved, /ventas de productos financieros/);
  assert.match(approved, /licencias correspondientes/);

  for (const phrase of [
    "¿De qué se trata?",
    "¿Qué es el trabajo?",
    "¿Qué hacen?",
    "¿De qué es la oportunidad?",
    "¿Me puedes explicar de qué se trata?"
  ]) {
    const r = turn(phrase, authPending());
    assert.match(r.rendered.text, /servicios financieros/i);
    assert.match(r.rendered.text, /ventas/i);
    assert.match(r.rendered.text, /permiso de trabajo|autorizaci[oó]n|Estados Unidos/i);
    assert.doesNotMatch(r.rendered.text, /¿En qué ciudad y estado/i);
  }
});
