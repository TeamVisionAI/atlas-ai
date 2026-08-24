/**
 * BR-143 / IUL Policy Review V1 — discovery A→G + Zoom scheduling.
 * Educate → qualify → schedule policy review. Does not change BR-142 eligibility.
 */

const { INTENTS, NEXT_ACTIONS, REASON_CODES, LANGUAGES, STAGES, APPOINTMENT_STATUS } =
  require("./constants");
const { classifyOriginalPolicyPurpose } = require("./originalPolicyPurpose");
const {
  classifyPolicyType,
  classifyCarrier,
  classifyPolicyAgeRange,
  classifyReviewReason,
  classifyDocumentsAvailable,
  looksLikePolicyIsBadQuestion,
  isDiscoveryComplete
} = require("./iulDiscoveryFacts");
const {
  readPolicyReviewAvailabilitySync,
  READ_STATUS
} = require("./iulPolicyReviewScheduling");
const { IUL_STAGES, IUL_REVIEW_MEETING_TYPE } = require("../iulWorkflowConstants");

const CAMPAIGN_KIND = "iul_review_ad";
const CONVERSATION_GOAL = "policy_review";

const ASK = Object.freeze({
  POLICY_TYPE: "iul_ask_policy_type",
  CARRIER: "iul_ask_carrier",
  ORIGINAL_PURPOSE: "iul_ask_original_purpose",
  POLICY_AGE: "iul_ask_policy_age",
  REVIEW_REASON: "iul_ask_review_reason",
  DOCUMENTS: "iul_ask_documents",
  SCHEDULING_DAY_PART: "iul_ask_scheduling_day_part",
  OFFER_SLOTS: "iul_offer_review_slots",
  CONFIRM_SLOT: "iul_confirm_review_slot",
  /** Legacy keys kept for in-flight threads */
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
  return Object.values(ASK).includes(key);
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

function parseOfferedSlotSelection(text, context) {
  const offered = context.appointment?.previouslyOfferedSlots || [];
  if (!offered.length) {
    return null;
  }
  const t = fold(text);
  if (/^(si|yes|ok|okay|claro|perfecto|perfect)$/.test(t) && offered.length === 1) {
    return offered[0];
  }
  for (const slot of offered) {
    const time = String(slot.time || slot.timeKey || "");
    const date = String(slot.date || slot.dateKey || "");
    if (time && t.includes(fold(time))) {
      return slot;
    }
    if (date && t.includes(fold(date))) {
      return slot;
    }
  }
  return null;
}

function classifyIulAdInbound({ text, context } = {}) {
  const lastAsk = context?.conversation?.lastQuestionAsked || null;
  const known = context?.knownFacts || {};

  if (looksLikePolicyIsBadQuestion(text)) {
    return { intent: INTENTS.IUL_POLICY_IS_BAD_QUESTION, confidence: 0.96, entities: {} };
  }

  if (lastAsk === ASK.CARRIER) {
    const carrier = classifyCarrier(text);
    return {
      intent: INTENTS.IUL_CARRIER,
      confidence: 0.88,
      entities: {
        carrier: carrier.carrier,
        carrierRaw: carrier.carrierRaw,
        carrierResolved: carrier.resolved
      }
    };
  }

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

  if (lastAsk === ASK.OFFER_SLOTS || lastAsk === ASK.CONFIRM_SLOT) {
    const slot = parseOfferedSlotSelection(text, context);
    if (slot) {
      return {
        intent: INTENTS.IUL_SELECT_OFFERED_SLOT,
        confidence: 0.92,
        entities: {
          selectedSlot: slot,
          reviewProposedDate: slot.date || slot.dateKey || null,
          reviewProposedTime: slot.time || slot.timeKey || null
        }
      };
    }
    if (/^(si|yes|confirmo|confirm|ok|okay)$/.test(fold(text))) {
      return {
        intent: INTENTS.IUL_SCHEDULE_CONFIRM,
        confidence: 0.9,
        entities: {}
      };
    }
  }

  if (lastAsk === ASK.SCHEDULING_DAY_PART || lastAsk === ASK.REVIEW_DAY_PART) {
    const dayPart = parseIulReviewDayPart(text);
    if (dayPart) {
      return {
        intent: INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
        confidence: 0.93,
        entities: { iulReviewDayPart: dayPart, reviewPreferredDayPart: dayPart }
      };
    }
  }

  if (lastAsk === ASK.DOCUMENTS) {
    const docs = classifyDocumentsAvailable(text);
    return {
      intent: INTENTS.IUL_DOCUMENTS_AVAILABLE,
      confidence: docs.value ? 0.9 : 0.75,
      entities: { documentsAvailable: docs.value, documentsAvailableRaw: docs.raw }
    };
  }

  if (lastAsk === ASK.REVIEW_REASON) {
    const reason = classifyReviewReason(text);
    return {
      intent: INTENTS.IUL_REVIEW_REASON,
      confidence: reason.value ? 0.9 : 0.75,
      entities: {
        reviewReason: reason.value,
        reviewReasonRaw: reason.raw
      }
    };
  }

  if (lastAsk === ASK.POLICY_AGE) {
    const age = classifyPolicyAgeRange(text);
    return {
      intent: INTENTS.IUL_POLICY_AGE,
      confidence: 0.9,
      entities: { policyAgeRange: age.value, policyAgeRangeRaw: age.raw }
    };
  }

  if (lastAsk === ASK.ORIGINAL_PURPOSE) {
    const purpose = classifyOriginalPolicyPurpose(text);
    return {
      intent: INTENTS.IUL_ORIGINAL_POLICY_PURPOSE,
      confidence: purpose.category ? 0.9 : 0.75,
      entities: {
        originalPolicyPurpose: purpose.category,
        originalPolicyPurposeRaw: purpose.raw
      }
    };
  }

  if (lastAsk === ASK.POLICY_TYPE || lastAsk === ASK.POLICY_ACTIVE) {
    const policyType = classifyPolicyType(text);
    return {
      intent: INTENTS.IUL_POLICY_TYPE,
      confidence: policyType.value ? 0.9 : 0.75,
      entities: {
        policyType: policyType.value,
        policyTypeRaw: policyType.raw,
        iulPolicyActive: policyType.value === "IUL" ? true : null
      }
    };
  }

  if (
    !known.policyType &&
    looksLikeIulPolicyLanguage(text) &&
    classifyPolicyType(text).value
  ) {
    const policyType = classifyPolicyType(text);
    return {
      intent: INTENTS.IUL_POLICY_TYPE,
      confidence: 0.82,
      entities: {
        policyType: policyType.value,
        policyTypeRaw: policyType.raw
      }
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
      ? "¡Hola! 👋 Gracias por escribirnos. Vi que quieres revisar tu póliza. ¿Qué tipo de póliza tienes: IUL, otro seguro de vida, o no estás seguro/a?"
      : "Hi! 👋 Thanks for writing. I saw you want to review your policy. What type of policy do you have: IUL, other life insurance, or not sure?",
    policyTypeAsk: es
      ? "¿Qué tipo de póliza tienes: IUL, otro seguro de vida, o no estás seguro/a?"
      : "What type of policy do you have: IUL, other life insurance, or not sure?",
    carrierAsk: es
      ? "¿Recuerdas con qué compañía o aseguradora está la póliza? Si no lo sabes, no hay problema."
      : "Do you remember which company or carrier the policy is with? If you don't know, that's okay.",
    originalPurposeAsk: es
      ? "¿Cuál fue la razón principal por la que adquiriste esa póliza originalmente?"
      : "What was the main reason you originally bought that policy?",
    policyAgeAsk: es
      ? "¿Hace aproximadamente cuánto tiempo la adquiriste?"
      : "Approximately how long ago did you get it?",
    reviewReasonAsk: es
      ? "¿Qué te gustaría entender o revisar ahora mismo sobre la póliza?"
      : "What would you most like to understand or review about the policy right now?",
    documentsAsk: es
      ? "¿Tienes a mano una ilustración reciente, estado de cuenta o resumen de la póliza?"
      : "Do you have a recent illustration, statement, or policy summary handy?",
    schedulingTransition: es
      ? "Perfecto. Lo mejor es hacer una revisión breve por Zoom para ver la póliza contigo y explicarte lo que estás viendo. ¿Prefieres en la mañana o en la tarde?"
      : "Perfect. The best next step is a brief Zoom review to look at the policy with you and explain what you're seeing. Do you prefer morning or afternoon/evening?",
    policyIsBadSafe: es
      ? "Eso no se puede determinar correctamente sin revisar los detalles de la póliza. Podemos verla contigo y explicarte cómo está funcionando."
      : "That can't be determined correctly without reviewing the policy details. We can look at it with you and explain how it's working.",
    infoOnly: es
      ? "Claro. Un IUL es un seguro de vida con valor en efectivo; no es “solo una inversión”. Te explicamos lo básico con tu póliza delante."
      : "Of course. An IUL is life insurance with cash-value features — not “just an investment.” We explain the basics with your policy in front of us.",
    noReplace: es
      ? "La revisión es informativa y no te obliga a cambiar ni reemplazar nada. Solo vemos cómo está estructurada tu póliza."
      : "The review is informational and doesn't obligate you to change or replace anything. We just look at how your policy is structured.",
    agentInvestment: es
      ? "La póliza combina seguro de vida con características de valor en efectivo. No discutimos con tu agente; si quieres, revisamos cómo está estructurada la tuya."
      : "The policy combines life insurance with cash-value features. We won't argue with your agent; if you’d like, we can review how yours is structured.",
    sendHere: es
      ? "En WhatsApp: es un seguro de vida con valor en efectivo, costos internos y una ilustración a futuro. Sin ver tu póliza no hacemos una recomendación personalizada."
      : "Over WhatsApp: it's life insurance with cash-value features, internal costs, and a future illustration. We don't make a personalized recommendation without reviewing your policy.",
    primerica: es
      ? "Sí: trabajamos con Primerica. La revisión es para entender tu póliza IUL con claridad, sin compromiso."
      : "Yes — we work with Primerica. The review is to understand your IUL policy clearly, with no obligation.",
    cost: es
      ? "La revisión es gratis. Cualquier recomendación financiera depende de tu situación y necesidades, después de ver la póliza."
      : "The review is free. Any financial recommendation depends on your needs and situation, after we look at the policy.",
    dayPartAck: es
      ? "Perfecto. Te comparto opciones para la revisión por Zoom."
      : "Perfect. I'll share options for the Zoom review.",
    offerSlots: es
      ? "Tengo estos horarios disponibles para la revisión por Zoom. ¿Cuál te funciona mejor?"
      : "I have these times available for the Zoom review. Which works best for you?",
    zeroSlots: es
      ? "Por ahora no veo un horario disponible en ese rango. ¿Te funciona mejor otro día u horario?"
      : "I don't see an available time in that range right now. Would another day or time work better?",
    confirmDeferred: es
      ? "Perfecto. Confirmo la revisión por Zoom en ese horario."
      : "Perfect. I'll confirm the Zoom review at that time.",
    clarify: es
      ? "Para seguir con claridad: ¿qué tipo de póliza quieres revisar?"
      : "To keep this clear: what type of policy would you like to review?"
  };
}

function renderIulAdReply(templateKey, language) {
  const c = copy(language);
  const map = {
    iul_ad_opener: c.opener,
    iul_ask_policy_type: c.policyTypeAsk,
    iul_ask_carrier: c.carrierAsk,
    iul_ask_original_purpose: c.originalPurposeAsk,
    iul_ask_policy_age: c.policyAgeAsk,
    iul_ask_review_reason: c.reviewReasonAsk,
    iul_ask_documents: c.documentsAsk,
    iul_scheduling_transition: c.schedulingTransition,
    iul_policy_is_bad_safe: c.policyIsBadSafe,
    iul_info_only_then_review: `${c.infoOnly} ${c.schedulingTransition}`,
    iul_no_replace_then_review: `${c.noReplace} ${c.schedulingTransition}`,
    iul_agent_investment_then_review: `${c.agentInvestment} ${c.schedulingTransition}`,
    iul_send_info_then_review: `${c.sendHere} ${c.schedulingTransition}`,
    iul_primerica_then_continue: `${c.primerica} ${c.schedulingTransition}`,
    iul_review_cost_then_continue: `${c.cost} ${c.schedulingTransition}`,
    iul_review_day_part_ack: c.dayPartAck,
    iul_offer_review_slots: c.offerSlots,
    iul_zero_review_slots: c.zeroSlots,
    iul_confirm_review_deferred: c.confirmDeferred,
    iul_clarify_policy_type: c.clarify
  };
  return map[templateKey] || c.opener;
}

function iulContextPatch(context, {
  lastQuestionAsked,
  knownFacts = {},
  lastProspectIntent,
  iulWorkflowStage = null,
  appointmentPatch = null
} = {}) {
  const mergedFacts = {
    ...(context.knownFacts || {}),
    ...knownFacts
  };
  if (knownFacts.originalPolicyPurpose != null || knownFacts.originalPolicyPurposeRaw) {
    mergedFacts.originalPurposeAsked = true;
  }
  const patch = {
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    currentStage: STAGES.QUALIFICATION,
    knownFacts: mergedFacts,
    conversation: {
      lastQuestionAsked,
      lastProspectIntent,
      pendingClarification: null,
      clarificationCount: 0
    }
  };
  if (iulWorkflowStage) {
    patch.knownFacts.iulWorkflowStage = iulWorkflowStage;
  }
  if (appointmentPatch) {
    patch.appointment = {
      ...(context.appointment || {}),
      ...appointmentPatch
    };
  }
  return patch;
}

function finishIulDecision(structured, context, {
  templateKey,
  nextAction,
  lastQuestionAsked,
  knownFacts = {},
  reasonCodes = [],
  mayCreateAppointment = false,
  iulWorkflowStage = null,
  appointmentPatch = null
}) {
  structured.decision.nextAction = nextAction;
  structured.decision.mayCreateAppointment = mayCreateAppointment;
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
    lastProspectIntent: structured.intent,
    iulWorkflowStage,
    appointmentPatch
  });
  return structured;
}

function nextDiscoveryAsk(knownFacts = {}) {
  if (!knownFacts.policyType) {
    return ASK.POLICY_TYPE;
  }
  if (!knownFacts.carrierResolved) {
    return ASK.CARRIER;
  }
  if (!knownFacts.originalPurposeAsked && knownFacts.originalPolicyPurpose == null) {
    return ASK.ORIGINAL_PURPOSE;
  }
  if (!knownFacts.policyAgeRange) {
    return ASK.POLICY_AGE;
  }
  if (!knownFacts.reviewReason) {
    return ASK.REVIEW_REASON;
  }
  if (!knownFacts.documentsAvailable) {
    return ASK.DOCUMENTS;
  }
  return ASK.SCHEDULING_DAY_PART;
}

function discoveryTemplateForAsk(ask) {
  const map = {
    [ASK.POLICY_TYPE]: "iul_ask_policy_type",
    [ASK.CARRIER]: "iul_ask_carrier",
    [ASK.ORIGINAL_PURPOSE]: "iul_ask_original_purpose",
    [ASK.POLICY_AGE]: "iul_ask_policy_age",
    [ASK.REVIEW_REASON]: "iul_ask_review_reason",
    [ASK.DOCUMENTS]: "iul_ask_documents",
    [ASK.SCHEDULING_DAY_PART]: "iul_scheduling_transition"
  };
  return map[ask] || "iul_ad_opener";
}

function discoveryNextActionForAsk(ask) {
  const map = {
    [ASK.POLICY_TYPE]: NEXT_ACTIONS.IUL_ASK_POLICY_TYPE,
    [ASK.CARRIER]: NEXT_ACTIONS.IUL_ASK_CARRIER,
    [ASK.ORIGINAL_PURPOSE]: NEXT_ACTIONS.IUL_ASK_ORIGINAL_PURPOSE,
    [ASK.POLICY_AGE]: NEXT_ACTIONS.IUL_ASK_POLICY_AGE,
    [ASK.REVIEW_REASON]: NEXT_ACTIONS.IUL_ASK_REVIEW_REASON,
    [ASK.DOCUMENTS]: NEXT_ACTIONS.IUL_ASK_DOCUMENTS,
    [ASK.SCHEDULING_DAY_PART]: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE
  };
  return map[ask] || NEXT_ACTIONS.IUL_ASK_POLICY_TYPE;
}

function advanceDiscovery(structured, context, {
  knownFacts = {},
  reasonCodes = [],
  iulWorkflowStage = IUL_STAGES.REVIEW_QUALIFICATION
} = {}) {
  const merged = { ...(context.knownFacts || {}), ...knownFacts };
  const nextAsk = nextDiscoveryAsk(merged);
  if (nextAsk === ASK.SCHEDULING_DAY_PART && isDiscoveryComplete(merged)) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_scheduling_transition",
      nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
      lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
      knownFacts: {
        ...merged,
        iulWorkflowStage: IUL_STAGES.REVIEW_READY,
        reviewMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM
      },
      reasonCodes: [...reasonCodes, REASON_CODES.IUL_DISCOVERY_COMPLETE],
      iulWorkflowStage: IUL_STAGES.REVIEW_READY
    });
  }
  return finishIulDecision(structured, context, {
    templateKey: discoveryTemplateForAsk(nextAsk),
    nextAction: discoveryNextActionForAsk(nextAsk),
    lastQuestionAsked: nextAsk,
    knownFacts: merged,
    reasonCodes,
    iulWorkflowStage
  });
}

function applySlotOfferDecision(structured, context, availability) {
  const offered =
    availability?.offeredSlots ||
    availability?.nearestAlternatives ||
    availability?.alternatives ||
    [];
  const status =
    availability?.status ||
    availability?.readResult?.status ||
    null;
  if (status === READ_STATUS.AVAILABLE && offered.length > 0) {
    const isNearest = Boolean(availability?.alternativeToConstraint);
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      offeredSlots: offered,
      slotA: offered[0]?.time || null,
      slotB: offered[1]?.time || null,
      nearestAlternatives: isNearest
    };
    return finishIulDecision(structured, context, {
      templateKey: isNearest ? "iul_offer_nearest_review_slots" : "iul_offer_review_slots",
      nextAction: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS,
      lastQuestionAsked: ASK.OFFER_SLOTS,
      knownFacts: {
        reviewMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM,
        iulWorkflowStage: IUL_STAGES.REVIEW_READY
      },
      reasonCodes: [
        REASON_CODES.IUL_POLICY_REVIEW_SCHEDULING,
        REASON_CODES.AVAILABLE_SLOTS_OFFERED
      ],
      appointmentPatch: {
        status: APPOINTMENT_STATUS.PROPOSED,
        previouslyOfferedSlots: offered,
        meetingType: IUL_REVIEW_MEETING_TYPE.ZOOM
      },
      iulWorkflowStage: IUL_STAGES.REVIEW_READY
    });
  }
  return finishIulDecision(structured, context, {
    templateKey: "iul_zero_review_slots",
    nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
    lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
    reasonCodes: [REASON_CODES.ZERO_QUALIFYING_SLOTS, REASON_CODES.IUL_POLICY_REVIEW_SCHEDULING]
  });
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
    INTENTS.IUL_POLICY_TYPE,
    INTENTS.IUL_CARRIER,
    INTENTS.IUL_ORIGINAL_POLICY_PURPOSE,
    INTENTS.IUL_POLICY_AGE,
    INTENTS.IUL_REVIEW_REASON,
    INTENTS.IUL_DOCUMENTS_AVAILABLE,
    INTENTS.IUL_POLICY_IS_BAD_QUESTION,
    INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
    INTENTS.IUL_SELECT_OFFERED_SLOT,
    INTENTS.IUL_SCHEDULE_CONFIRM,
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

  if (intent === INTENTS.IUL_POLICY_IS_BAD_QUESTION) {
    const merged = { ...(context.knownFacts || {}) };
    if (isDiscoveryComplete(merged)) {
      return finishIulDecision(structured, context, {
        templateKey: "iul_policy_is_bad_safe",
        nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
        lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
        reasonCodes: [REASON_CODES.IUL_POLICY_IS_BAD_SAFE_RESPONSE]
      });
    }
    const nextAsk = nextDiscoveryAsk(merged);
    return finishIulDecision(structured, context, {
      templateKey: "iul_policy_is_bad_safe",
      nextAction: discoveryNextActionForAsk(nextAsk),
      lastQuestionAsked: nextAsk,
      reasonCodes: [REASON_CODES.IUL_POLICY_IS_BAD_SAFE_RESPONSE]
    });
  }

  if (intent === INTENTS.IUL_INFO_ONLY) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_info_only_then_review",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_INFO_THEN_REVIEW, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }
  if (intent === INTENTS.IUL_NO_REPLACE) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_no_replace_then_review",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_NO_OBLIGATION, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }
  if (intent === INTENTS.IUL_AGENT_SAID_INVESTMENT) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_agent_investment_then_review",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
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
      lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
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
      lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_PRIMERICA_TRANSPARENT, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }
  if (intent === INTENTS.IUL_REVIEW_COST_QUESTION) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_review_cost_then_continue",
      nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
      lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
      reasonCodes: [REASON_CODES.IUL_REVIEW_IS_FREE, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }

  if (intent === INTENTS.IUL_POLICY_TYPE) {
    return advanceDiscovery(structured, context, {
      knownFacts: {
        policyType: interpretation.entities?.policyType || null,
        iulPolicyActive: interpretation.entities?.iulPolicyActive ?? null,
        iulWorkflowStage: IUL_STAGES.ENGAGED
      },
      reasonCodes: [REASON_CODES.IUL_POLICY_TYPE_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_CARRIER) {
    return advanceDiscovery(structured, context, {
      knownFacts: {
        carrier: interpretation.entities?.carrier ?? null,
        carrierRaw: interpretation.entities?.carrierRaw ?? null,
        carrierResolved: true
      },
      reasonCodes: [REASON_CODES.IUL_CARRIER_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_ORIGINAL_POLICY_PURPOSE) {
    return advanceDiscovery(structured, context, {
      knownFacts: {
        originalPolicyPurpose: interpretation.entities?.originalPolicyPurpose ?? null,
        originalPolicyPurposeRaw: interpretation.entities?.originalPolicyPurposeRaw ?? null,
        originalPurposeAsked: true
      },
      reasonCodes: [REASON_CODES.IUL_ORIGINAL_PURPOSE_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_POLICY_AGE) {
    return advanceDiscovery(structured, context, {
      knownFacts: {
        policyAgeRange: interpretation.entities?.policyAgeRange || null
      },
      reasonCodes: [REASON_CODES.IUL_POLICY_AGE_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_REVIEW_REASON) {
    return advanceDiscovery(structured, context, {
      knownFacts: {
        reviewReason: interpretation.entities?.reviewReason || null,
        reviewReasonRaw: interpretation.entities?.reviewReasonRaw || null
      },
      reasonCodes: [REASON_CODES.IUL_REVIEW_REASON_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_DOCUMENTS_AVAILABLE) {
    return advanceDiscovery(structured, context, {
      knownFacts: {
        documentsAvailable: interpretation.entities?.documentsAvailable || null
      },
      reasonCodes: [REASON_CODES.IUL_DOCUMENTS_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_CHOOSE_REVIEW_DAY_PART) {
    const dayPart = interpretation.entities?.iulReviewDayPart || null;
    const mergedFacts = {
      iulReviewDayPart: dayPart,
      reviewPreferredDayPart: dayPart,
      preferredDayPart: dayPart === "day" ? "morning" : dayPart,
      reviewMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM
    };
    const schedulingContext = {
      ...context,
      knownFacts: { ...(context.knownFacts || {}), ...mergedFacts }
    };
    const availability = readPolicyReviewAvailabilitySync({
      context: schedulingContext,
      interpretation,
      options: {
        availabilityFixture: context._availabilityFixture,
        organizationId: context.organizationId || null
      }
    });
    structured.customerReplyPlan.templateKey = "iul_review_day_part_ack";
    return applySlotOfferDecision(structured, schedulingContext, availability);
  }

  if (intent === INTENTS.IUL_SELECT_OFFERED_SLOT) {
    const slot = interpretation.entities?.selectedSlot || null;
    return finishIulDecision(structured, context, {
      templateKey: "iul_confirm_review_deferred",
      nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT,
      lastQuestionAsked: ASK.CONFIRM_SLOT,
      mayCreateAppointment: true,
      knownFacts: {
        reviewProposedDate:
          interpretation.entities?.reviewProposedDate ||
          slot?.date ||
          slot?.dateKey ||
          null,
        reviewProposedTime:
          interpretation.entities?.reviewProposedTime ||
          slot?.time ||
          slot?.timeKey ||
          null,
        reviewMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM,
        iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
      },
      reasonCodes: [
        REASON_CODES.IUL_POLICY_REVIEW_SCHEDULING,
        REASON_CODES.APPOINTMENT_CREATE_PROPOSED
      ],
      appointmentPatch: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: slot?.date || slot?.dateKey || null,
        proposedTime: slot?.time || slot?.timeKey || null,
        meetingType: IUL_REVIEW_MEETING_TYPE.ZOOM,
        previouslyOfferedSlots: context.appointment?.previouslyOfferedSlots || []
      },
      iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
    });
  }

  if (intent === INTENTS.IUL_SCHEDULE_CONFIRM) {
    const offered = context.appointment?.previouslyOfferedSlots || [];
    const slot = offered.length === 1 ? offered[0] : null;
    if (!slot) {
      return finishIulDecision(structured, context, {
        templateKey: "iul_offer_review_slots",
        nextAction: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS,
        lastQuestionAsked: ASK.OFFER_SLOTS
      });
    }
    return finishIulDecision(structured, context, {
      templateKey: "iul_confirm_review_deferred",
      nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT,
      lastQuestionAsked: ASK.CONFIRM_SLOT,
      mayCreateAppointment: true,
      knownFacts: {
        reviewProposedDate: slot.date || slot.dateKey || null,
        reviewProposedTime: slot.time || slot.timeKey || null,
        reviewMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM,
        iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
      },
      reasonCodes: [
        REASON_CODES.IUL_POLICY_REVIEW_SCHEDULING,
        REASON_CODES.APPOINTMENT_CREATE_PROPOSED,
        REASON_CODES.EXPLICIT_CONFIRMATION_RECEIVED
      ],
      appointmentPatch: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: slot.date || slot.dateKey || null,
        proposedTime: slot.time || slot.timeKey || null,
        meetingType: IUL_REVIEW_MEETING_TYPE.ZOOM
      },
      iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
    });
  }

  const pending = context.conversation?.lastQuestionAsked;
  if (pending && pending !== ASK.POLICY_TYPE) {
    const replayAsk =
      pending === ASK.CARRIER
        ? ASK.CARRIER
        : pending === ASK.ORIGINAL_PURPOSE
          ? ASK.ORIGINAL_PURPOSE
          : pending === ASK.POLICY_AGE
            ? ASK.POLICY_AGE
            : pending === ASK.REVIEW_REASON
              ? ASK.REVIEW_REASON
              : pending === ASK.DOCUMENTS
                ? ASK.DOCUMENTS
                : pending === ASK.SCHEDULING_DAY_PART
                  ? ASK.SCHEDULING_DAY_PART
                  : pending === ASK.OFFER_SLOTS
                    ? ASK.OFFER_SLOTS
                    : nextDiscoveryAsk(context.knownFacts || {});
    return finishIulDecision(structured, context, {
      templateKey: discoveryTemplateForAsk(replayAsk),
      nextAction: discoveryNextActionForAsk(replayAsk),
      lastQuestionAsked: replayAsk
    });
  }

  return finishIulDecision(structured, context, {
    templateKey: "iul_ad_opener",
    nextAction: NEXT_ACTIONS.IUL_ASK_POLICY_TYPE,
    lastQuestionAsked: ASK.POLICY_TYPE,
    knownFacts: { iulWorkflowStage: IUL_STAGES.NEW_IUL_LEAD },
    reasonCodes: [REASON_CODES.IUL_SPANISH_FIRST_OPENER],
    iulWorkflowStage: IUL_STAGES.NEW_IUL_LEAD
  });
}

function resolveIulCampaignFields({
  conversationGoal = null,
  campaignKind = null,
  ctwaReferral = null,
  leadSource = null,
  campaignIntakePurpose = null
} = {}) {
  const intakeIul =
    String(campaignIntakePurpose || "").toUpperCase() === "IUL" ||
    String(campaignIntakePurpose || "").toUpperCase() === "IUL_REVIEW";
  const goal =
    conversationGoal ||
    leadSource?.conversationGoal ||
    (intakeIul ? CONVERSATION_GOAL : null) ||
    (looksLikeIulReferral(ctwaReferral) ? CONVERSATION_GOAL : null);
  const kind =
    campaignKind ||
    leadSource?.campaignKind ||
    (intakeIul || looksLikeIulReferral(ctwaReferral) || goal === CONVERSATION_GOAL
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
  nextDiscoveryAsk,
  isDiscoveryComplete,
  looksLikeInfoOnly,
  looksLikeNoReplace,
  looksLikeAgentSaidInvestment,
  looksLikeSendInfoHere,
  looksLikePrimericaQuestion,
  looksLikeReviewCostQuestion,
  looksLikePolicyIsBadQuestion
};
