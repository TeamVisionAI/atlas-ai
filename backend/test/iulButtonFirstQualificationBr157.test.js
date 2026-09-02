/**
 * BR-157 — IUL_REVIEW button-first qualification (formal Spanish).
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
  INTENTS
} = require("../core/recruitAiV2");
const {
  CAMPAIGN_KIND,
  CONVERSATION_GOAL,
  ASK,
  renderIulAdReply
} = require("../core/recruitAiV2/iulAdConversation");
const {
  IUL_OPTION_IDS,
  IUL_OPTION_LABELS,
  IUL_BUTTON_TITLES,
  historyLabelForId
} = require("../core/recruitAiV2/iulQualificationOptions");
const {
  extractInteractiveReply,
  buildInteractiveFromOptions
} = require("../core/whatsappInteractiveMessage");
const { normalizeMessageBody } = require("../services/whatsappWebhookParser");
const { evaluateAtlasInboundAutomationEligibility } = require("../core/atlasInboundAutomationEligibility");
const { buildNormalizedMessageFromWhatsApp } = require("../core/channelMessage");

const INFORMAL_SPANISH = /\b(tú|tu póliza|te)\b/i;

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL_REVIEW",
    knownFacts: { name: "María" },
    ctwaReferral: {
      sourceType: "ad",
      headline: "Revisa tu póliza IUL",
      body: "Entiende cómo está tu IUL",
      sourceId: "ad-iul-review-1"
    },
    ...overrides
  });
}

function runTurn(message, context) {
  const interpretation = interpretInboundMessage({
    message: typeof message === "string" ? { text: message } : message,
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function interactiveIds(decision) {
  const interactive = decision.customerReplyPlan?.entities?.whatsappInteractive;
  if (!interactive) {
    return [];
  }
  if (interactive.type === "button") {
    return (interactive.action?.buttons || []).map((row) => row.reply?.id);
  }
  if (interactive.type === "list") {
    return (interactive.action?.sections || [])
      .flatMap((section) => section.rows || [])
      .map((row) => row.id);
  }
  return [];
}

test("fresh IUL lead receives qualification options before Zoom", () => {
  const { interpretation, decision, rendered, plan } = runTurn("Hola", iulContext());
  assert.equal(interpretation.intent, INTENTS.IUL_GREETING);
  assert.match(rendered.text, /Hola, María 👋 Gracias por escribirnos/);
  assert.match(rendered.text, /Para orientarle mejor, ¿cuál describe su situación\?/);
  assert.doesNotMatch(rendered.text, /Zoom/i);
  assert.doesNotMatch(rendered.text, /horario/i);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.equal(decision.decision.nextAction, "iul_ask_qualification_status");
  const interactive = plan.entities.whatsappInteractive;
  assert.equal(interactive.type, "button");
  assert.deepEqual(interactiveIds(decision), [
    IUL_OPTION_IDS.STATUS_ACTIVE,
    IUL_OPTION_IDS.STATUS_RESEARCH,
    IUL_OPTION_IDS.STATUS_UNSURE
  ]);
  assert.match(plan.entities.interactiveFallbackText, /1\. Tengo un IUL activo/);
  assert.match(plan.entities.interactiveFallbackText, /2\. Estoy buscando información/);
  assert.match(plan.entities.interactiveFallbackText, /3\. No estoy seguro qué tengo/);
});

test("active-IUL selection advances to review-intent options", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS }
  });
  const { interpretation, decision, rendered, plan } = runTurn(
    {
      text: "Tengo un IUL activo",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.STATUS_ACTIVE,
        title: "Tengo un IUL activo"
      }
    },
    ctx
  );
  assert.equal(interpretation.intent, INTENTS.IUL_STATUS_ACTIVE);
  assert.equal(
    decision.contextPatch.knownFacts.iulQualificationStatus,
    IUL_OPTION_IDS.STATUS_ACTIVE
  );
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.REVIEW_INTENT);
  assert.match(rendered.text, /Perfecto\. ¿Qué le gustaría revisar principalmente\?/);
  assert.doesNotMatch(rendered.text, /Zoom/i);
  assert.equal(plan.entities.whatsappInteractive.type, "list");
  assert.deepEqual(interactiveIds(decision), [
    IUL_OPTION_IDS.REVIEW_COSTS,
    IUL_OPTION_IDS.REVIEW_GROWTH,
    IUL_OPTION_IDS.REVIEW_BENEFITS,
    IUL_OPTION_IDS.REVIEW_UNDERSTAND,
    IUL_OPTION_IDS.REVIEW_OTHER
  ]);
});

test("review-intent selection advances toward scheduling without a hard-coded time", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.REVIEW_INTENT },
    knownFacts: {
      name: "María",
      iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE
    }
  });
  const { interpretation, decision, rendered, plan } = runTurn(
    {
      text: "Costos",
      interactiveReply: {
        type: "list_reply",
        id: IUL_OPTION_IDS.REVIEW_COSTS,
        title: "Costos"
      }
    },
    ctx
  );
  assert.equal(interpretation.intent, INTENTS.IUL_REVIEW_INTENT);
  assert.equal(decision.contextPatch.knownFacts.iulReviewIntent, IUL_OPTION_IDS.REVIEW_COSTS);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.MEETING_MODE);
  assert.match(
    rendered.text,
    /Lo ideal es revisar su póliza con usted y explicarle exactamente lo que tiene/
  );
  assert.match(rendered.text, /¿Cómo prefiere hacer su revisión de póliza\?/);
  assert.doesNotMatch(rendered.text, /10:00|18:00|2099/);
  assert.ok(interactiveIds(decision).includes(IUL_OPTION_IDS.MEET_ZOOM));
  assert.ok(!interactiveIds(decision).includes(IUL_OPTION_IDS.DAY_MORNING));
  assert.equal(plan.entities.whatsappInteractive.type, "button");
});

test("Otro accepts free text then resumes toward Zoom", () => {
  const afterOther = iulContext({
    conversation: { lastQuestionAsked: ASK.REVIEW_INTENT },
    knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE }
  });
  const otherTap = runTurn(
    {
      text: "Otro",
      interactiveReply: { id: IUL_OPTION_IDS.REVIEW_OTHER, title: "Otro" }
    },
    afterOther
  );
  assert.match(otherTap.rendered.text, /Cuénteme brevemente qué le gustaría revisar/);
  assert.equal(otherTap.decision.contextPatch.conversation.lastQuestionAsked, ASK.OTHER_DETAIL);

  const afterDetail = iulContext({
    conversation: { lastQuestionAsked: ASK.OTHER_DETAIL },
    knownFacts: {
      iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
      iulReviewIntent: IUL_OPTION_IDS.REVIEW_OTHER
    }
  });
  const freeText = runTurn("Quiero entender los cargos internos", afterDetail);
  assert.equal(freeText.interpretation.intent, INTENTS.IUL_OTHER_FREE_TEXT);
  assert.equal(
    freeText.decision.contextPatch.knownFacts.iulOtherDetail,
    "Quiero entender los cargos internos"
  );
  assert.match(freeText.rendered.text, /¿Cómo prefiere hacer su revisión de póliza\?/);
});

test("interactive button payloads normalize by ID, not label", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS }
  });
  const { interpretation, decision } = runTurn(
    {
      text: "Busco información",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.STATUS_RESEARCH,
        title: "Busco información"
      }
    },
    ctx
  );
  assert.equal(interpretation.intent, INTENTS.IUL_STATUS_RESEARCH);
  assert.equal(interpretation.entities.iulQualificationStatus, IUL_OPTION_IDS.STATUS_RESEARCH);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.RESEARCH_INTENT);
  assert.match(decision.customerReplyPlan.templateKey, /research_intent/);
});

test("interactive list payloads normalize by ID", () => {
  const reply = extractInteractiveReply({
    type: "interactive",
    interactive: {
      type: "list_reply",
      list_reply: { id: IUL_OPTION_IDS.REVIEW_GROWTH, title: "Crecimiento" }
    }
  });
  assert.equal(reply.type, "list_reply");
  assert.equal(reply.id, IUL_OPTION_IDS.REVIEW_GROWTH);
  assert.equal(historyLabelForId(reply.id, reply.title), "Crecimiento");
  assert.equal(
    normalizeMessageBody({
      type: "interactive",
      interactive: {
        list_reply: { id: IUL_OPTION_IDS.REVIEW_GROWTH, title: "Crecimiento" }
      }
    }),
    "Crecimiento"
  );

  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.REVIEW_INTENT },
    knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE }
  });
  const { interpretation } = runTurn(
    { text: "Crecimiento", interactiveReply: reply },
    ctx
  );
  assert.equal(interpretation.entities.iulReviewIntent, IUL_OPTION_IDS.REVIEW_GROWTH);
});

test("numeric fallback 1/2/3 works on the first qualification step", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS }
  });
  const one = runTurn("1", ctx);
  assert.equal(one.interpretation.intent, INTENTS.IUL_STATUS_ACTIVE);
  const two = runTurn("2", ctx);
  assert.equal(two.interpretation.intent, INTENTS.IUL_STATUS_RESEARCH);
  const three = runTurn("3", ctx);
  assert.equal(three.interpretation.intent, INTENTS.IUL_STATUS_UNSURE);
  assert.match(three.rendered.text, /identificar qué tipo de póliza tiene/);
  assert.deepEqual(interactiveIds(three.decision), [
    IUL_OPTION_IDS.POLICY_IN_HAND_YES,
    IUL_OPTION_IDS.POLICY_IN_HAND_NO
  ]);
});

test("IUL lead never enters recruiting city/state qualification", () => {
  const first = runTurn("Hola", iulContext());
  assert.doesNotMatch(first.rendered.text, /ciudad y estado|city and state/i);
  assert.doesNotMatch(first.decision.decision.nextAction, /location|city|state/i);
  assert.equal(first.decision.contextPatch.conversationGoal, CONVERSATION_GOAL);
  assert.equal(first.decision.contextPatch.campaignKind, CAMPAIGN_KIND);

  const active = runTurn("1", iulContext({
    conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS }
  }));
  assert.doesNotMatch(active.rendered.text, /ciudad/i);
  assert.match(active.decision.decision.nextAction, /^iul_/);
});

test("campaign, CTWA, and IUL_REVIEW attribution remain intact", () => {
  const ctx = iulContext();
  const { decision } = runTurn("Hola", ctx);
  assert.equal(decision.contextPatch.conversationGoal, CONVERSATION_GOAL);
  assert.equal(decision.contextPatch.campaignKind, CAMPAIGN_KIND);
  assert.equal(decision.contextPatch.campaignIntakePurpose, "IUL_REVIEW");
  assert.equal(decision.contextPatch.ctwaReferral.sourceId, "ad-iul-review-1");
  assert.equal(ctx.campaignIntakePurpose, "IUL_REVIEW");
  assert.equal(ctx.ctwaReferral.sourceId, "ad-iul-review-1");

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: {
      phone: "+17865559157",
      organization_id: "00000000-0000-4000-8000-000000000001",
      source: "UNKNOWN",
      entry_method: "UNATTRIBUTED"
    },
    inbound: { ctwaReferral: ctx.ctwaReferral }
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "CTWA_REFERRAL");
});

test("existing text-only recruiting WhatsApp conversations still ask city/state", () => {
  const { interpretation, rendered } = runTurn(
    "Hola",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.match(rendered.text, /ciudad/i);
});

test("research path answers briefly then continues to the Zoom transition", () => {
  const ctx = iulContext({
    conversation: { lastQuestionAsked: ASK.RESEARCH_INTENT },
    knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_RESEARCH }
  });
  const { rendered, decision } = runTurn(
    {
      text: "Cómo funciona",
      interactiveReply: { id: IUL_OPTION_IDS.REVIEW_HOW, title: "Cómo funciona" }
    },
    ctx
  );
  assert.match(rendered.text, /seguro de vida con valor en efectivo/i);
  assert.match(rendered.text, /¿Cómo prefiere hacer su revisión de póliza\?/);
  assert.doesNotMatch(rendered.text, /reemplaz|cancel|garantiz|impuesto/i);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.MEETING_MODE);
});

test("unsure + policy in hand goes to Zoom without pretending attachments are ingested", () => {
  const unsure = runTurn("3", iulContext({
    conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS }
  }));
  assert.doesNotMatch(unsure.rendered.text, /enví|pdf|foto|adjunt/i);

  const inHand = runTurn(
    {
      text: "Tengo la póliza",
      interactiveReply: { id: IUL_OPTION_IDS.POLICY_IN_HAND_YES, title: "Tengo la póliza" }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.POLICY_IN_HAND },
      knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_UNSURE }
    })
  );
  assert.match(inHand.rendered.text, /¿Cómo prefiere hacer su revisión de póliza\?/);
  assert.doesNotMatch(inHand.rendered.text, /envíeme|adjunte|subir/i);
});

test("inbound interactive reply is preserved on the channel envelope", () => {
  const inbound = {
    providerMessageId: "wamid.iul-1",
    body: "Tengo un IUL activo",
    messageType: "interactive",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.STATUS_ACTIVE,
      title: "Tengo un IUL activo"
    },
    timestamp: "2026-08-25T12:00:00.000Z"
  };
  const normalized = buildNormalizedMessageFromWhatsApp(inbound, "+17865559157");
  assert.equal(normalized.interactiveReply.id, IUL_OPTION_IDS.STATUS_ACTIVE);
  assert.equal(normalized.text, "Tengo un IUL activo");
});

test("interactive Cloud API payloads use reply buttons or lists; text fallback stays numbered", () => {
  const buttons = buildInteractiveFromOptions({
    body: "¿Cuál describe su situación?",
    options: [
      { id: IUL_OPTION_IDS.STATUS_ACTIVE, title: IUL_BUTTON_TITLES[IUL_OPTION_IDS.STATUS_ACTIVE] },
      { id: IUL_OPTION_IDS.STATUS_RESEARCH, title: IUL_BUTTON_TITLES[IUL_OPTION_IDS.STATUS_RESEARCH] },
      { id: IUL_OPTION_IDS.STATUS_UNSURE, title: IUL_BUTTON_TITLES[IUL_OPTION_IDS.STATUS_UNSURE] }
    ]
  });
  assert.equal(buttons.type, "button");
  assert.equal(buttons.action.buttons[0].type, "reply");

  const list = buildInteractiveFromOptions({
    body: "¿Qué le gustaría revisar principalmente?",
    options: [
      { id: IUL_OPTION_IDS.REVIEW_COSTS, title: "Costos", label: "Costos" },
      { id: IUL_OPTION_IDS.REVIEW_GROWTH, title: "Crecimiento", label: "Crecimiento" },
      { id: IUL_OPTION_IDS.REVIEW_BENEFITS, title: "Beneficios", label: "Beneficios" },
      { id: IUL_OPTION_IDS.REVIEW_UNDERSTAND, title: "Entender mi póliza", label: "Entender mi póliza" },
      { id: IUL_OPTION_IDS.REVIEW_OTHER, title: "Otro", label: "Otro" }
    ]
  });
  assert.equal(list.type, "list");
});

test("formal Spanish is consistent in Atlas IUL copy; no tú / tu póliza / te", () => {
  const keys = [
    "iul_ask_qualification_status",
    "iul_ask_review_intent",
    "iul_ask_research_intent",
    "iul_ask_policy_in_hand",
    "iul_ask_other_detail",
    "iul_brief_how_then_review",
    "iul_brief_costs_then_review",
    "iul_brief_growth_then_review",
    "iul_brief_benefits_then_review",
    "iul_brief_understand_then_review",
    "iul_scheduling_transition",
    "iul_info_only_then_review",
    "iul_no_replace_then_review",
    "iul_agent_investment_then_review",
    "iul_send_info_then_review",
    "iul_primerica_then_continue",
    "iul_review_cost_then_continue",
    "iul_review_day_part_ack",
    "iul_offer_review_slots",
    "iul_offer_nearest_review_slots",
    "iul_no_review_availability",
    "iul_zero_review_slots"
  ];
  for (const key of keys) {
    const text = renderIulAdReply(key, "spanish", { firstName: "María" });
    assert.doesNotMatch(text, INFORMAL_SPANISH, key);
    assert.doesNotMatch(text, /\btu\b/, key);
  }
  for (const [id, label] of Object.entries(IUL_OPTION_LABELS)) {
    assert.doesNotMatch(label, INFORMAL_SPANISH, id);
    assert.doesNotMatch(IUL_BUTTON_TITLES[id], INFORMAL_SPANISH, id);
  }
});

test("history preserves the full human-readable label for shortened button titles", () => {
  assert.equal(
    historyLabelForId(IUL_OPTION_IDS.STATUS_RESEARCH, "Busco información"),
    "Estoy buscando información"
  );
  assert.equal(
    normalizeMessageBody({
      type: "interactive",
      interactive: {
        button_reply: { id: IUL_OPTION_IDS.STATUS_UNSURE, title: "No estoy seguro" }
      }
    }),
    "No estoy seguro qué tengo"
  );
});
