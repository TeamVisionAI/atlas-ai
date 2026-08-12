/**
 * Spanish live-canary — Findings A/B/C (info request, company identity, Si tengo auth).
 * No audio STT. Execution / LIVE_PATH remain OFF. No ads / Meta / allowlist changes.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  interpretInboundMessage,
  decideConversationTurn,
  createConversationContext,
  buildResponsePlan,
  renderCustomerReply,
  processRecruitAiV2TurnSync,
  INTENTS,
  FACT_CERTAINTY,
  isExecutionEnabled
} = require("../core/recruitAiV2");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const {
  looksLikeSpanishInfoRequest,
  looksLikeCompanyIdentityQuestion
} = require("../core/recruitAiV2/conversationContinuity");
const { isLiveExecutionPathEnabled } = require("../core/recruitAiV2/liveExecutionPathConfig");
const {
  getCanonicalFaqAnswer,
  getJobOverviewFaqAnswer
} = require("../core/teamVisionWorkflowCopy");

function renderTurn(message, context) {
  const interpretation = interpretInboundMessage({
    message: { text: message },
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function applyPatch(context, decision) {
  const patch = decision.contextPatch || {};
  return {
    ...context,
    ...patch,
    knownFacts: { ...context.knownFacts, ...(patch.knownFacts || {}) },
    conversation: { ...context.conversation, ...(patch.conversation || {}) },
    appointment: { ...context.appointment, ...(patch.appointment || {}) }
  };
}

test("safety: execution / live path remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
});

test("1. ¡Hola! Quiero más información → overview first + one qual question", () => {
  const ctx = createConversationContext({ preferredLanguage: "spanish" });
  const { interpretation, rendered, decision } = renderTurn(
    "¡Hola! Quiero más información",
    ctx
  );
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(interpretation.entities.jobFaqDetailLevel, "overview");
  assert.match(rendered.text, /servicios financieros/i);
  assert.match(rendered.text, /ciudad y estado|en qué ciudad/i);
  assert.equal((rendered.text.match(/\?/g) || []).length, 1);
  assert.equal(decision.contextPatch?.conversation?.opportunityExplained, true);
  assert.doesNotMatch(rendered.text, /^¡Hola! Gracias por escribirnos/i);
});

test("2. Bare Spanish info-request variants → overview-first", () => {
  const variants = [
    "Quiero información",
    "Quiero más detalles",
    "Me interesa saber de qué se trata",
    "Dame información",
    "Quisiera saber más"
  ];
  for (const phrase of variants) {
    assert.equal(looksLikeSpanishInfoRequest(phrase), true, phrase);
    const { interpretation, rendered } = renderTurn(
      phrase,
      createConversationContext({ preferredLanguage: "spanish" })
    );
    assert.equal(
      interpretation.intent,
      INTENTS.JOB_OPPORTUNITY_QUESTION,
      phrase
    );
    assert.match(rendered.text, /servicios financieros|oportunidad/i, phrase);
    assert.match(rendered.text, /\?/, phrase);
  }
});

test("3. Tampa Florida still parses as location", () => {
  const loc = parseLocationAnswer("Tampa Florida");
  assert.equal(loc?.city, "Tampa");
  assert.equal(loc?.state, "FL");
  assert.equal(loc?.completeness, "complete");

  const ctx = createConversationContext({ preferredLanguage: "spanish" });
  const { interpretation, rendered } = renderTurn("Tampa Florida", ctx);
  assert.equal(interpretation.intent, INTENTS.PROVIDE_LOCATION);
  assert.match(rendered.text, /permiso de trabajo|documentación legal/i);
});

test("4–5. Company identity after Tampa/FL — answer + resume auth, no city overwrite", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Tampa",
      state: "FL",
      cityCertainty: FACT_CERTAINTY.CONFIRMED,
      stateCertainty: FACT_CERTAINTY.CONFIRMED,
      workAuthorizationStatus: "unknown"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastOfferMade: "continue_qualification_after_location",
      lastAtlasOutboundText:
        "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
      confirmedFields: ["city", "state"]
    }
  });

  const variants = [
    "Qué empresa eres?",
    "Cuál es la empresa?",
    "Cómo se llama la compañía?",
    "Para qué compañía es?",
    "Con qué empresa trabajan?"
  ];

  for (const phrase of variants) {
    assert.equal(looksLikeCompanyIdentityQuestion(phrase), true, phrase);
    assert.equal(parseLocationAnswer(phrase), null, `loc blocked: ${phrase}`);

    const { interpretation, rendered, decision } = renderTurn(phrase, ctx);
    assert.equal(
      interpretation.intent,
      INTENTS.JOB_OPPORTUNITY_QUESTION,
      phrase
    );
    assert.equal(
      interpretation.entities.jobFaqDetailLevel,
      "company_identity",
      phrase
    );
    assert.match(
      rendered.text,
      /asesoría y distribución de servicios financieros/i,
      phrase
    );
    assert.match(rendered.text, /permiso de trabajo|documentación legal/i, phrase);
    assert.doesNotMatch(rendered.text, /Que Empresa Eres|estado está/i, phrase);
    assert.equal(
      decision.contextPatch?.conversation?.lastQuestionAsked,
      "ask_authorization",
      phrase
    );
    assert.notEqual(
      decision.contextPatch?.knownFacts?.city,
      "Que Empresa Eres",
      phrase
    );
  }

  // Known city must remain Tampa after company FAQ patch application.
  const turn = renderTurn("Qué empresa eres?", ctx);
  const next = applyPatch(ctx, turn.decision);
  assert.equal(next.knownFacts.city, "Tampa");
  assert.equal(next.knownFacts.state, "FL");
  assert.equal(next.conversation.lastQuestionAsked, "ask_authorization");
});

test("6–7. Work-auth pending: Si tengo / Sí tengo → authorized", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Tampa",
      state: "FL",
      cityCertainty: FACT_CERTAINTY.CONFIRMED,
      stateCertainty: FACT_CERTAINTY.CONFIRMED,
      workAuthorizationStatus: "unknown"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
      confirmedFields: ["city", "state"]
    }
  });

  for (const phrase of ["Si tengo", "Sí tengo"]) {
    const { interpretation, rendered, decision } = renderTurn(phrase, ctx);
    assert.equal(interpretation.intent, INTENTS.PROVIDE_AUTHORIZATION, phrase);
    assert.equal(interpretation.entities.workAuthorization, true, phrase);
    assert.doesNotMatch(rendered.text, /dato que te acabo de pedir/i, phrase);
    assert.notEqual(
      decision.customerReplyPlan?.templateKey,
      "clarify_once",
      phrase
    );
    assert.equal(
      decision.contextPatch?.knownFacts?.workAuthorizationStatus,
      "authorized",
      phrase
    );
  }
});

test("8. No work-auth pending: Si tengo does NOT assume authorization", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado vives?"
    }
  });
  const { interpretation } = renderTurn("Si tengo", ctx);
  assert.notEqual(interpretation.intent, INTENTS.PROVIDE_AUTHORIZATION);
  assert.notEqual(interpretation.entities?.workAuthorization, true);
});

test("9. Full Ruth regression chain", () => {
  let ctx = createConversationContext({ preferredLanguage: "spanish" });

  let turn = renderTurn("¡Hola! Quiero más información", ctx);
  assert.equal(turn.interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.match(turn.rendered.text, /servicios financieros/i);
  ctx = applyPatch(ctx, turn.decision);
  assert.equal(ctx.conversation.opportunityExplained, true);

  turn = renderTurn("Tampa Florida", ctx);
  assert.equal(turn.interpretation.intent, INTENTS.PROVIDE_LOCATION);
  ctx = applyPatch(ctx, turn.decision);
  assert.equal(ctx.knownFacts.city, "Tampa");
  assert.equal(ctx.knownFacts.state, "FL");
  assert.equal(ctx.conversation.lastQuestionAsked, "ask_authorization");

  turn = renderTurn("Qué empresa eres?", ctx);
  assert.equal(turn.interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(parseLocationAnswer("Qué empresa eres?"), null);
  ctx = applyPatch(ctx, turn.decision);
  assert.equal(ctx.knownFacts.city, "Tampa");
  assert.equal(ctx.knownFacts.state, "FL");
  assert.equal(ctx.conversation.lastQuestionAsked, "ask_authorization");
  assert.match(turn.rendered.text, /asesoría y distribución/i);
  assert.doesNotMatch(turn.rendered.text, /Que Empresa Eres/i);

  turn = renderTurn("Si tengo", ctx);
  assert.equal(turn.interpretation.intent, INTENTS.PROVIDE_AUTHORIZATION);
  assert.equal(turn.interpretation.entities.workAuthorization, true);
  ctx = applyPatch(ctx, turn.decision);
  assert.equal(ctx.knownFacts.workAuthorizationStatus, "authorized");
  assert.notEqual(turn.plan?.templateKey || turn.decision.customerReplyPlan?.templateKey, "clarify_once");
  assert.doesNotMatch(turn.rendered.text, /dato que te acabo de pedir/i);
});

test("company identity copy uses Team Vision canonical FAQ", () => {
  assert.match(getCanonicalFaqAnswer("es"), /asesoría y distribución/i);
  assert.match(getJobOverviewFaqAnswer("es"), /servicios financieros/i);
});

test("sync orchestrator Ruth path stays coherent", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    organizationId: "00000000-0000-4000-8000-000000000001",
    prospectId: "ruth-abc-test",
    prospectOwnerUserId: "33ad243a-9d00-4a4d-810b-df2762c0f076"
  });

  let result = processRecruitAiV2TurnSync({
    message: { text: "¡Hola! Quiero más información" },
    context: ctx,
    options: { allowExecution: false, invocationSource: "live_whatsapp" }
  });
  assert.equal(result.structuredDecision?.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  ctx = result.nextContext;
  assert.equal(ctx.conversation.opportunityExplained, true);

  result = processRecruitAiV2TurnSync({
    message: { text: "Tampa Florida" },
    context: ctx,
    options: { allowExecution: false, invocationSource: "live_whatsapp" }
  });
  ctx = result.nextContext;
  assert.equal(ctx.knownFacts.city, "Tampa");

  result = processRecruitAiV2TurnSync({
    message: { text: "Qué empresa eres?" },
    context: ctx,
    options: { allowExecution: false, invocationSource: "live_whatsapp" }
  });
  ctx = result.nextContext;
  assert.equal(ctx.knownFacts.city, "Tampa");
  assert.equal(ctx.conversation.lastQuestionAsked, "ask_authorization");

  result = processRecruitAiV2TurnSync({
    message: { text: "Si tengo" },
    context: ctx,
    options: { allowExecution: false, invocationSource: "live_whatsapp" }
  });
  assert.equal(result.structuredDecision?.intent, INTENTS.PROVIDE_AUTHORIZATION);
  assert.equal(result.nextContext.knownFacts.workAuthorizationStatus, "authorized");
});