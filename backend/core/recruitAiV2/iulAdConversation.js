/**
 * BR-143 — Spanish IUL-review ad conversation (Lead AI / policy_review).
 * Educate → clarify → review → soft appointment ask.
 * Does not book (BR-132 unimplemented). Does not change BR-142 eligibility.
 */

const { INTENTS, NEXT_ACTIONS, REASON_CODES, LANGUAGES, STAGES } =
  require("./constants");

const CAMPAIGN_KIND = "iul_review_ad";
const CONVERSATION_GOAL = "policy_review";

const ASK = Object.freeze({
  POLICY_ACTIVE: "iul_ask_policy_active",
  REVIEW_TOPIC: "iul_ask_review_topic",
  REVIEW_DAY_PART: "iul_ask_review_day_part"
});

const TOPICS = Object.freeze({
  CASH_VALUE: "cash_value",
  COSTS: "costs",
  PROJECTION: "projection",
  ALTERNATIVE: "alternative"
});

const SAFETY_INTENTS = new Set([
  INTENTS.CANCEL_REQUEST,
  INTENTS.WITHDRAW_INTEREST,
  INTENTS.OPT_OUT_REQUEST
]);

const IUL_SOURCE_IDS_ENV = "IUL_REVIEW_AD_SOURCE_IDS";

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function localeCode(language) {
  return language === LANGUAGES.ENGLISH || language === "english" || language === "en"
    ? "en"
    : "es";
}

function looksLikeEnglishIulUtterance(text) {
  const t = fold(text);
  if (!t) {
    return false;
  }
  if (/\b(hola|gracias|cuanto|poliza|mandame|activa|tarde|noche)\b/.test(t)) {
    return false;
  }
  return (
    /\b(is this|how much|send me|my agent|i don'?t want|just want|the review)\b/.test(
      t
    ) || /\b(hello|hi|hey|thanks)\b/.test(t)
  );
}

function looksLikeIulPolicyLanguage(text) {
  const t = fold(text);
  if (!t) {
    return false;
  }
  return (
    /\biul\b/.test(t) ||
    /\bindexed universal\b/.test(t) ||
    /\bpoliza iul\b/.test(t) ||
    /\brevisar (mi |tu )?poliza\b/.test(t) ||
    /\breview (my |the )?iul\b/.test(t) ||
    /\breview (my |the )?polic(y|ies)\b/.test(t)
  );
}

function looksLikeIulReferral(referral) {
  if (!referral || typeof referral !== "object") {
    return false;
  }
  const blob = [referral.headline, referral.body, referral.sourceUrl, referral.source_url]
    .filter(Boolean)
    .join(" ");
  if (looksLikeIulPolicyLanguage(blob)) {
    return true;
  }
  const sourceId = String(referral.sourceId || referral.source_id || "").trim();
  if (!sourceId) {
    return false;
  }
  const allow = String(process.env[IUL_SOURCE_IDS_ENV] || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return allow.includes(sourceId);
}

function isIulAsk(lastQuestionAsked) {
  const key = String(lastQuestionAsked || "");
  return key === ASK.POLICY_ACTIVE || key === ASK.REVIEW_TOPIC || key === ASK.REVIEW_DAY_PART;
}

function isIulReviewAdContext(context = {}, extras = {}) {
  if (context.campaignKind === CAMPAIGN_KIND) {
    return true;
  }
  if (context.conversationGoal === CONVERSATION_GOAL) {
    return true;
  }
  if (isIulAsk(context.conversation?.lastQuestionAsked)) {
    return true;
  }
  if (looksLikeIulReferral(context.ctwaReferral || extras.ctwaReferral)) {
    return true;
  }
  const lead = extras.leadSource || extras.lead_source || null;
  if (lead?.conversationGoal === CONVERSATION_GOAL || lead?.campaignKind === CAMPAIGN_KIND) {
    return true;
  }
  return false;
}

function isIulReviewAdTurn({ context, text, extras } = {}) {
  return (
    isIulReviewAdContext(context, extras) || looksLikeIulPolicyLanguage(text)
  );
}

function looksLikeInfoOnly(text) {
  const t = fold(text);
  return (
    /\bsolo quiero (mas )?informacion\b/.test(t) ||
    /\bsolo informacion\b/.test(t) ||
    /\bquiero (mas )?informacion\b/.test(t) ||
    /\bjust (want |looking for )?info(rmation)?\b/.test(t) ||
    /\bonly (want )?info(rmation)?\b/.test(t) ||
    /\b(can i |could i )?(get |have )?(more )?info(rmation)?\b/.test(t)
  );
}

function looksLikeNoReplace(text) {
  const t = fold(text);
  return (
    /\bno quiero cambiar( mi poliza)?\b/.test(t) ||
    /\bno (voy a|quiero) reemplazar\b/.test(t) ||
    /\bi don'?t want to (change|replace)( my policy)?\b/.test(t) ||
    /\bnot (looking to )?replac/.test(t)
  );
}

function looksLikeAgentSaidInvestment(text) {
  const t = fold(text);
  return (
    /\bmi agente me dijo que (es|era) una inversion\b/.test(t) ||
    /\b(me dijeron|dijo) que (es|era) una inversion\b/.test(t) ||
    /\b(my agent|the agent) (told|said).{0,40}invest/.test(t) ||
    /\bsaid (it'?s|it is|the iul is) an investment\b/.test(t)
  );
}

function looksLikeSendInfoHere(text) {
  const t = fold(text);
  return (
    /\bmandame la informacion( por aqui)?\b/.test(t) ||
    /\benviame la informacion( por aqui)?\b/.test(t) ||
    /\bpor (whats?app|aqui)\b/.test(t) && /\binformacion\b/.test(t) ||
    /\bsend (me )?(the )?info(rmation)? (here|in (this )?chat|on whatsapp)\b/.test(t) ||
    /\btext me the (info|details)\b/.test(t)
  );
}

function looksLikePrimericaQuestion(text) {
  const t = fold(text);
  return (
    /\bes(to)? (es )?primerica\b/.test(t) ||
    /\bprimerica\b/.test(t) ||
    /\bis this primerica\b/.test(t)
  );
}

function looksLikeReviewCostQuestion(text) {
  const t = fold(text);
  return (
    /\bcuanto cuesta\b/.test(t) ||
    /\bcuesta (algo|la revision|la cita)\b/.test(t) ||
    /\bhow much (does it )?(cost|is it)\b/.test(t) ||
    /\bis (the )?review free\b/.test(t) ||
    /\bwhat (does it|do you) charge\b/.test(t)
  );
}

function looksLikePolicyActiveYes(text) {
  const t = fold(text);
  if (!t) {
    return false;
  }
  if (looksLikePolicyActiveNo(text)) {
    return false;
  }
  return (
    /^(si|yes|yep|yeah|claro|correcto|afirmativo)$/.test(t) ||
    /\b(si|yes),?\s*(la tengo|esta activa|sigue activa|todavia)\b/.test(t) ||
    /\bla tengo( activa)?\b/.test(t) ||
    /\besta activa\b/.test(t) ||
    /\bstill active\b/.test(t) ||
    /\bi (still )?have it\b/.test(t)
  );
}

function looksLikePolicyActiveNo(text) {
  const t = fold(text);
  return (
    /^(no|nope)$/.test(t) ||
    /\bno la tengo\b/.test(t) ||
    /\bno esta activa\b/.test(t) ||
    /\bya no( la tengo| esta)?\b/.test(t) ||
    /\bnot active\b/.test(t) ||
    /\bi don'?t have (it|one)\b/.test(t) ||
    /\bno longer( have)?\b/.test(t)
  );
}

function classifyReviewTopic(text) {
  const t = fold(text);
  if (/\bvalor acumulado\b/.test(t) || /\bcash value\b/.test(t) || /\bcreciendo\b/.test(t)) {
    return TOPICS.CASH_VALUE;
  }
  if (/\bcostos?\b/.test(t) || /\bcargos\b/.test(t) || /\bfees?\b/.test(t) || /\bcosts?\b/.test(t)) {
    return TOPICS.COSTS;
  }
  if (
    /\bproyect/.test(t) ||
    /\bfuturo\b/.test(t) ||
    /\bprojection\b/.test(t) ||
    /\blong[- ]term\b/.test(t)
  ) {
    return TOPICS.PROJECTION;
  }
  if (
    /\botra estrategia\b/.test(t) ||
    /\bmejor( a)? (mis |sus )?objetivos\b/.test(t) ||
    /\balternativ/.test(t) ||
    /\bbetter fit\b/.test(t)
  ) {
    return TOPICS.ALTERNATIVE;
  }
  return null;
}

function parseIulReviewDayPart(text) {
  const t = fold(text);
  if (
    /\btarde\b/.test(t) ||
    /\bnoche\b/.test(t) ||
    /\bafternoon\b/.test(t) ||
    /\bevening\b/.test(t) ||
    /\bnight\b/.test(t)
  ) {
    return "evening";
  }
  if (
    /\bdia\b/.test(t) ||
    /\bmanana\b/.test(t) ||
    /\bmorning\b/.test(t) ||
    /\bduring the day\b/.test(t) ||
    /\bdaytime\b/.test(t)
  ) {
    return "day";
  }
  return null;
}

function classifyIulAdInbound({ text, context } = {}) {
  const lastAsk = context?.conversation?.lastQuestionAsked || null;

  if (looksLikePrimericaQuestion(text)) {
    return { intent: INTENTS.IUL_PRIMERICA_QUESTION, confidence: 0.95, entities: {} };
  }
  if (looksLikeReviewCostQuestion(text)) {
    return { intent: INTENTS.IUL_REVIEW_COST_QUESTION, confidence: 0.94, entities: {} };
  }
  if (looksLikeAgentSaidInvestment(text)) {
    return { intent: INTENTS.IUL_AGENT_SAID_INVESTMENT, confidence: 0.96, entities: {} };
  }
  if (looksLikeNoReplace(text)) {
    return { intent: INTENTS.IUL_NO_REPLACE, confidence: 0.95, entities: {} };
  }
  if (looksLikeSendInfoHere(text)) {
    return { intent: INTENTS.IUL_SEND_INFO_HERE, confidence: 0.94, entities: {} };
  }
  if (looksLikeInfoOnly(text)) {
    return { intent: INTENTS.IUL_INFO_ONLY, confidence: 0.94, entities: {} };
  }

  const topic = classifyReviewTopic(text);
  if (topic) {
    return {
      intent: INTENTS.IUL_CHOOSE_REVIEW_TOPIC,
      confidence: 0.92,
      entities: { iulReviewTopic: topic }
    };
  }

  if (lastAsk === ASK.REVIEW_DAY_PART) {
    const dayPart = parseIulReviewDayPart(text);
    if (dayPart) {
      return {
        intent: INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
        confidence: 0.93,
        entities: { iulReviewDayPart: dayPart }
      };
    }
  }

  if (lastAsk === ASK.POLICY_ACTIVE) {
    if (looksLikePolicyActiveYes(text)) {
      return {
        intent: INTENTS.IUL_POLICY_ACTIVE_YES,
        confidence: 0.93,
        entities: { iulPolicyActive: true }
      };
    }
    if (looksLikePolicyActiveNo(text)) {
      return {
        intent: INTENTS.IUL_POLICY_ACTIVE_NO,
        confidence: 0.93,
        entities: { iulPolicyActive: false }
      };
    }
  }

  if (looksLikePolicyActiveYes(text) && lastAsk !== ASK.REVIEW_DAY_PART) {
    return {
      intent: INTENTS.IUL_POLICY_ACTIVE_YES,
      confidence: 0.86,
      entities: { iulPolicyActive: true }
    };
  }
  if (looksLikePolicyActiveNo(text) && lastAsk !== ASK.REVIEW_DAY_PART) {
    return {
      intent: INTENTS.IUL_POLICY_ACTIVE_NO,
      confidence: 0.86,
      entities: { iulPolicyActive: false }
    };
  }

  return {
    intent: INTENTS.IUL_GREETING,
    confidence: 0.8,
    entities: {}
  };
}

function copy(language) {
  const es = localeCode(language) !== "en";
  return {
    opener: es
      ? "¡Hola! 👋 Gracias por escribirnos. Vi que quieres revisar tu póliza IUL. ¿Actualmente la tienes activa?"
      : "Hi! 👋 Thanks for writing. I saw you want to review your IUL policy. Is it currently active?",
    topicAsk: es
      ? "Perfecto. ¿Qué te gustaría entender mejor: cómo está creciendo el valor acumulado, los costos de la póliza, cómo está proyectada a futuro, o si existe otra estrategia que pueda ajustarse mejor a tus objetivos?"
      : "Perfect. What would you like to understand better: how the cash value is growing, the policy costs, how it’s projected going forward, or whether another strategy might fit your goals better?",
    topicAskInactive: es
      ? "Entendido. Aun así podemos aclarar cómo funciona este tipo de póliza. ¿Qué te gustaría entender mejor: el valor acumulado, los costos, la proyección a futuro, u otra estrategia según tus objetivos?"
      : "Understood. We can still clarify how this type of policy works. What would you like to understand better: cash value, costs, the future projection, or another strategy for your goals?",
    topicCash: es
      ? "El valor acumulado es la parte de efectivo de un seguro de vida IUL; puede variar según el índice, el fondeo y los cargos. Para ver cómo está creciendo el tuyo hay que revisar la póliza."
      : "Cash value is the cash-value feature of IUL life insurance; it can vary with the index, funding, and charges. To see how yours is growing, we review the policy.",
    topicCosts: es
      ? "Toda póliza IUL tiene costos (seguro y cargos). No se puede decir si los tuyos están altos o bajos sin ver el contrato y los estados."
      : "Every IUL policy has costs (insurance and charges). We can’t tell if yours are high or low without the contract and statements.",
    topicProjection: es
      ? "Las proyecciones son ilustraciones, no una garantía. Revisamos supuestos y fondeo para ver cómo está planteada a futuro."
      : "Projections are illustrations, not a guarantee. We review assumptions and funding to see how yours is set up going forward.",
    topicAlternative: es
      ? "Puede existir otra estrategia según tus objetivos. Eso se ve en una revisión de tu póliza, no con una recomendación genérica."
      : "Another strategy may fit your goals. That comes from reviewing your policy — not a generic recommendation.",
    infoOnly: es
      ? "Claro. Un IUL es un seguro de vida con valor en efectivo; no es “solo una inversión”. Te explicamos lo básico con tu póliza delante."
      : "Of course. An IUL is life insurance with cash-value features — not “just an investment.” We explain the basics with your policy in front of us.",
    noReplace: es
      ? "La revisión es informativa y no te obliga a cambiar ni reemplazar nada. Solo vemos cómo está estructurada tu póliza."
      : "The review is informational and doesn’t obligate you to change or replace anything. We just look at how your policy is structured.",
    agentInvestment: es
      ? "La póliza combina seguro de vida con características de valor en efectivo. No discutimos con tu agente; si quieres, revisamos cómo está estructurada la tuya."
      : "The policy combines life insurance with cash-value features. We won’t argue with your agent; if you’d like, we can review how yours is structured.",
    sendHere: es
      ? "En WhatsApp: es un seguro de vida con valor en efectivo, costos internos y una ilustración a futuro. Sin ver tu póliza no hacemos una recomendación personalizada."
      : "Over WhatsApp: it’s life insurance with cash-value features, internal costs, and a future illustration. We don’t make a personalized recommendation without reviewing your policy.",
    primerica: es
      ? "Sí: trabajamos con Primerica. La revisión es para entender tu póliza IUL con claridad, sin compromiso."
      : "Yes — we work with Primerica. The review is to understand your IUL policy clearly, with no obligation.",
    cost: es
      ? "La revisión es gratis. Cualquier recomendación financiera depende de tu situación y necesidades, después de ver la póliza."
      : "The review is free. Any financial recommendation depends on your needs and situation, after we look at the policy.",
    softAsk: es
      ? "Podemos hacer una revisión contigo sin compromiso y mostrarte lo que vemos. ¿Te funciona mejor conversar durante el día o en la tarde/noche?"
      : "We can do a no-obligation review with you and show you what we see. Does daytime or evening/night work better to talk?",
    dayPartAck: es
      ? "Perfecto. Coordinamos la revisión en ese horario, sin compromiso."
      : "Perfect. We’ll coordinate the review in that window, with no obligation.",
    clarify: es
      ? "Para seguir con claridad: ¿tu póliza IUL está activa ahora?"
      : "To keep this clear: is your IUL policy active now?"
  };
}

function composeEducateThenAsk(body, ask) {
  return `${body} ${ask}`.replace(/\s+/g, " ").trim();
}

function renderIulAdReply(templateKey, language) {
  const c = copy(language);
  const map = {
    iul_ad_opener: c.opener,
    iul_ask_review_topic: c.topicAsk,
    iul_ask_review_topic_inactive: c.topicAskInactive,
    iul_topic_cash_value_then_review: composeEducateThenAsk(c.topicCash, c.softAsk),
    iul_topic_costs_then_review: composeEducateThenAsk(c.topicCosts, c.softAsk),
    iul_topic_projection_then_review: composeEducateThenAsk(c.topicProjection, c.softAsk),
    iul_topic_alternative_then_review: composeEducateThenAsk(c.topicAlternative, c.softAsk),
    iul_info_only_then_review: composeEducateThenAsk(c.infoOnly, c.softAsk),
    iul_no_replace_then_review: composeEducateThenAsk(c.noReplace, c.softAsk),
    iul_agent_investment_then_review: composeEducateThenAsk(c.agentInvestment, c.softAsk),
    iul_send_info_then_review: composeEducateThenAsk(c.sendHere, c.softAsk),
    iul_primerica_then_continue: composeEducateThenAsk(c.primerica, c.softAsk),
    iul_review_cost_then_continue: composeEducateThenAsk(c.cost, c.softAsk),
    iul_review_day_part_ack: c.dayPartAck,
    iul_clarify_policy_active: c.clarify
  };
  return map[templateKey] || c.opener;
}

function iulContextPatch(context, {
  lastQuestionAsked,
  knownFacts = {},
  lastProspectIntent
} = {}) {
  return {
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    currentStage: STAGES.QUALIFICATION,
    knownFacts,
    conversation: {
      lastQuestionAsked,
      lastProspectIntent,
      pendingClarification: null,
      clarificationCount: 0
    }
  };
}

function finishIulDecision(structured, context, {
  templateKey,
  nextAction,
  lastQuestionAsked,
  knownFacts = {},
  reasonCodes = []
}) {
  structured.decision.nextAction = nextAction;
  structured.decision.mayCreateAppointment = false;
  structured.decision.shouldEscalate = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = templateKey;
  structured.reasonCodes.push(REASON_CODES.IUL_AD_CONVERSATION);
  structured.reasonCodes.push(REASON_CODES.POLICY_REVIEW_GOAL);
  structured.reasonCodes.push(REASON_CODES.NO_IUL_ATTACK);
  for (const code of reasonCodes) {
    structured.reasonCodes.push(code);
  }
  structured.contextPatch = iulContextPatch(context, {
    lastQuestionAsked,
    knownFacts,
    lastProspectIntent: structured.intent
  });
  return structured;
}

function applyIulAdDecision({ structured, context, interpretation } = {}) {
  const intent = interpretation?.intent;
  if (SAFETY_INTENTS.has(intent)) {
    return null;
  }
  const inboundText =
    interpretation?.normalization?.trimmedText ||
    interpretation?.normalization?.rawText ||
    "";
  const iulIntents = new Set([
    INTENTS.IUL_GREETING,
    INTENTS.IUL_POLICY_ACTIVE_YES,
    INTENTS.IUL_POLICY_ACTIVE_NO,
    INTENTS.IUL_CHOOSE_REVIEW_TOPIC,
    INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
    INTENTS.IUL_INFO_ONLY,
    INTENTS.IUL_NO_REPLACE,
    INTENTS.IUL_AGENT_SAID_INVESTMENT,
    INTENTS.IUL_SEND_INFO_HERE,
    INTENTS.IUL_PRIMERICA_QUESTION,
    INTENTS.IUL_REVIEW_COST_QUESTION
  ]);
  if (
    !isIulReviewAdTurn({ context, text: inboundText }) &&
    !iulIntents.has(intent)
  ) {
    return null;
  }

  if (intent === INTENTS.REQUEST_LANGUAGE_SWITCH) {
    const requested = interpretation.entities?.requestedLanguage || interpretation.preferredLanguage;
    structured.preferredLanguage = requested;
    structured.customerReplyPlan.language = requested;
    structured.decision.nextAction = NEXT_ACTIONS.SWITCH_LANGUAGE_CONTINUE;
    structured.decision.mayCreateAppointment = false;
    const pending = context.conversation?.lastQuestionAsked;
    structured.customerReplyPlan.templateKey =
      pending === ASK.REVIEW_TOPIC
        ? "iul_ask_review_topic"
        : pending === ASK.REVIEW_DAY_PART
          ? "iul_info_only_then_review"
          : "iul_ad_opener";
    structured.reasonCodes.push(REASON_CODES.IUL_AD_CONVERSATION);
    structured.reasonCodes.push(REASON_CODES.LANGUAGE_EXPLICIT_SWITCH);
    structured.contextPatch = {
      ...iulContextPatch(context, {
        lastQuestionAsked: context.conversation?.lastQuestionAsked || ASK.POLICY_ACTIVE,
        lastProspectIntent: intent
      }),
      preferredLanguage: requested,
      languageMeta: { source: "explicit", lastMessageLanguage: requested }
    };
    return structured;
  }

  const topicKey = interpretation.entities?.iulReviewTopic;
  const topicTemplates = {
    [TOPICS.CASH_VALUE]: "iul_topic_cash_value_then_review",
    [TOPICS.COSTS]: "iul_topic_costs_then_review",
    [TOPICS.PROJECTION]: "iul_topic_projection_then_review",
    [TOPICS.ALTERNATIVE]: "iul_topic_alternative_then_review"
  };

  if (intent === INTENTS.IUL_POLICY_ACTIVE_YES) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_review_topic",
      nextAction: NEXT_ACTIONS.IUL_ASK_REVIEW_TOPIC,
      lastQuestionAsked: ASK.REVIEW_TOPIC,
      knownFacts: { iulPolicyActive: true },
      reasonCodes: [REASON_CODES.IUL_POLICY_ACTIVE_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_POLICY_ACTIVE_NO) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_review_topic_inactive",
      nextAction: NEXT_ACTIONS.IUL_ASK_REVIEW_TOPIC,
      lastQuestionAsked: ASK.REVIEW_TOPIC,
      knownFacts: { iulPolicyActive: false },
      reasonCodes: [REASON_CODES.IUL_POLICY_ACTIVE_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_CHOOSE_REVIEW_TOPIC && topicTemplates[topicKey]) {
    return finishIulDecision(structured, context, {
      templateKey: topicTemplates[topicKey],
      nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      knownFacts: { iulReviewTopic: topicKey },
      reasonCodes: [REASON_CODES.IUL_TOPIC_CAPTURED, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }

  if (intent === INTENTS.IUL_CHOOSE_REVIEW_DAY_PART) {
    const dayPart = interpretation.entities?.iulReviewDayPart || null;
    return finishIulDecision(structured, context, {
      templateKey: "iul_review_day_part_ack",
      nextAction: NEXT_ACTIONS.IUL_CAPTURE_REVIEW_DAY_PART,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      knownFacts: {
        iulReviewDayPart: dayPart,
        preferredDayPart: dayPart === "day" ? "morning" : "evening"
      },
      reasonCodes: [REASON_CODES.IUL_REVIEW_WINDOW_CAPTURED, REASON_CODES.PREMATURE_BOOKING_BLOCKED]
    });
  }

  if (intent === INTENTS.IUL_INFO_ONLY) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_info_only_then_review",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_INFO_THEN_REVIEW, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }

  if (intent === INTENTS.IUL_NO_REPLACE) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_no_replace_then_review",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_NO_OBLIGATION, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }

  if (intent === INTENTS.IUL_AGENT_SAID_INVESTMENT) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_agent_investment_then_review",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      reasonCodes: [
        REASON_CODES.IUL_NOT_JUST_INVESTMENT,
        REASON_CODES.IUL_NO_AGENT_ARGUMENT,
        REASON_CODES.IUL_SOFT_APPOINTMENT_ASK
      ]
    });
  }

  if (intent === INTENTS.IUL_SEND_INFO_HERE) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_send_info_then_review",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      reasonCodes: [
        REASON_CODES.IUL_WHATSAPP_BASICS_ONLY,
        REASON_CODES.IUL_SOFT_APPOINTMENT_ASK
      ]
    });
  }

  if (intent === INTENTS.IUL_PRIMERICA_QUESTION) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_primerica_then_continue",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_PRIMERICA_TRANSPARENT, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }

  if (intent === INTENTS.IUL_REVIEW_COST_QUESTION) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_review_cost_then_continue",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_REVIEW_IS_FREE, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }

  if (context.conversation?.lastQuestionAsked === ASK.REVIEW_TOPIC) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_review_topic",
      nextAction: NEXT_ACTIONS.IUL_ASK_REVIEW_TOPIC,
      lastQuestionAsked: ASK.REVIEW_TOPIC
    });
  }

  if (context.conversation?.lastQuestionAsked === ASK.REVIEW_DAY_PART) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_info_only_then_review",
      nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
      lastQuestionAsked: ASK.REVIEW_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }

  return finishIulDecision(structured, context, {
    templateKey: "iul_ad_opener",
    nextAction: NEXT_ACTIONS.IUL_ASK_POLICY_ACTIVE,
    lastQuestionAsked: ASK.POLICY_ACTIVE,
    reasonCodes: [REASON_CODES.IUL_SPANISH_FIRST_OPENER]
  });
}

function resolveIulCampaignFields({
  conversationGoal = null,
  campaignKind = null,
  ctwaReferral = null,
  leadSource = null
} = {}) {
  const goal =
    conversationGoal ||
    leadSource?.conversationGoal ||
    (looksLikeIulReferral(ctwaReferral) ? CONVERSATION_GOAL : null);
  const kind =
    campaignKind ||
    leadSource?.campaignKind ||
    (looksLikeIulReferral(ctwaReferral) || goal === CONVERSATION_GOAL
      ? CAMPAIGN_KIND
      : null);
  return {
    conversationGoal: goal,
    campaignKind: kind,
    ctwaReferral: ctwaReferral || null
  };
}

module.exports = {
  CAMPAIGN_KIND,
  CONVERSATION_GOAL,
  ASK,
  TOPICS,
  IUL_SOURCE_IDS_ENV,
  isIulReviewAdContext,
  isIulReviewAdTurn,
  looksLikeIulReferral,
  looksLikeIulPolicyLanguage,
  looksLikeEnglishIulUtterance,
  classifyIulAdInbound,
  applyIulAdDecision,
  renderIulAdReply,
  resolveIulCampaignFields,
  looksLikeInfoOnly,
  looksLikeNoReplace,
  looksLikeAgentSaidInvestment,
  looksLikeSendInfoHere,
  looksLikePrimericaQuestion,
  looksLikeReviewCostQuestion
};
