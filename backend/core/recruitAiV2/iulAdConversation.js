/**
 * BR-143 / BR-157 — IUL Policy Review: button-first qualification + Zoom scheduling.
 * Fresh IUL_REVIEW leads: two taps (status → intent) then Zoom. Formal Spanish.
 * Legacy A→G discovery remains for in-flight lastQuestionAsked keys only.
 * Does not change BR-142 eligibility. Never routes to Recruit AI.
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
const {
  IUL_OPTION_IDS,
  resolveIulOption,
  buildIulInteractive
} = require("./iulQualificationOptions");

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
  REVIEW_DAY_PART: "iul_ask_review_day_part",
  QUALIFICATION_STATUS: "iul_ask_qualification_status",
  REVIEW_INTENT: "iul_ask_review_intent",
  RESEARCH_INTENT: "iul_ask_research_intent",
  POLICY_IN_HAND: "iul_ask_policy_in_hand",
  OTHER_DETAIL: "iul_ask_other_detail"
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
  const intakePurpose = String(
    context.campaignIntakePurpose || extras.campaignIntakePurpose || ""
  ).toUpperCase();
  if (intakePurpose === "IUL" || intakePurpose === "IUL_REVIEW") {
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

function isCampaignIntakeIulFirstTurn(context = {}) {
  const purpose = String(context.campaignIntakePurpose || "").toUpperCase();
  if (purpose !== "IUL" && purpose !== "IUL_REVIEW") {
    return false;
  }
  return !context?.conversation?.lastQuestionAsked;
}

function resolveIulFirstName(context = {}, extras = {}) {
  const raw =
    extras.firstName ||
    context.name ||
    context.displayName ||
    context.knownFacts?.name ||
    context.knownFacts?.fullName ||
    "";
  const first = String(raw)
    .trim()
    .split(/\s+/)
    .find(Boolean);
  if (!first || /unknown|prospect/i.test(first)) {
    return "";
  }
  return first;
}

function matchQualificationInput(catalog, { text, interactiveReply } = {}) {
  return resolveIulOption(catalog, {
    id: interactiveReply?.id || null,
    title: interactiveReply?.title || null,
    text
  });
}

function classifyIulAdInbound({ text, context, interactiveReply = null } = {}) {
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

  if (lastAsk === ASK.QUALIFICATION_STATUS || !lastAsk) {
    const status = matchQualificationInput("status", { text, interactiveReply });
    if (status?.id === IUL_OPTION_IDS.STATUS_ACTIVE) {
      return {
        intent: INTENTS.IUL_STATUS_ACTIVE,
        confidence: 0.96,
        entities: {
          iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
          iulPolicyActive: true,
          policyType: "IUL"
        }
      };
    }
    if (status?.id === IUL_OPTION_IDS.STATUS_RESEARCH) {
      return {
        intent: INTENTS.IUL_STATUS_RESEARCH,
        confidence: 0.96,
        entities: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_RESEARCH }
      };
    }
    if (status?.id === IUL_OPTION_IDS.STATUS_UNSURE) {
      return {
        intent: INTENTS.IUL_STATUS_UNSURE,
        confidence: 0.96,
        entities: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_UNSURE }
      };
    }
  }

  if (lastAsk === ASK.REVIEW_INTENT || lastAsk === ASK.RESEARCH_INTENT) {
    const catalog = lastAsk === ASK.RESEARCH_INTENT ? "researchIntent" : "reviewIntent";
    const picked = matchQualificationInput(catalog, { text, interactiveReply });
    if (picked) {
      if (picked.id === IUL_OPTION_IDS.REVIEW_OTHER) {
        return {
          intent: INTENTS.IUL_REVIEW_INTENT,
          confidence: 0.95,
          entities: {
            iulReviewIntent: picked.id,
            wantsOtherDetail: true
          }
        };
      }
      return {
        intent: INTENTS.IUL_REVIEW_INTENT,
        confidence: 0.95,
        entities: { iulReviewIntent: picked.id }
      };
    }
  }

  if (lastAsk === ASK.POLICY_IN_HAND) {
    const picked = matchQualificationInput("policyInHand", { text, interactiveReply });
    if (picked) {
      return {
        intent: INTENTS.IUL_POLICY_IN_HAND,
        confidence: 0.95,
        entities: {
          iulPolicyInHand: picked.id === IUL_OPTION_IDS.POLICY_IN_HAND_YES
        }
      };
    }
  }

  if (lastAsk === ASK.OTHER_DETAIL) {
    const detail = String(text || "").trim();
    if (detail) {
      return {
        intent: INTENTS.IUL_OTHER_FREE_TEXT,
        confidence: 0.9,
        entities: { iulOtherDetail: detail, reviewReasonRaw: detail }
      };
    }
  }

  if (lastAsk === ASK.SCHEDULING_DAY_PART || lastAsk === ASK.REVIEW_DAY_PART) {
    const day = matchQualificationInput("dayPart", { text, interactiveReply });
    if (day?.id === IUL_OPTION_IDS.DAY_MORNING) {
      return {
        intent: INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
        confidence: 0.95,
        entities: { iulReviewDayPart: "day", reviewPreferredDayPart: "day" }
      };
    }
    if (day?.id === IUL_OPTION_IDS.DAY_AFTERNOON) {
      return {
        intent: INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
        confidence: 0.95,
        entities: { iulReviewDayPart: "evening", reviewPreferredDayPart: "evening" }
      };
    }
  }

  if (looksLikeInfoOnly(text) && lastAsk === ASK.QUALIFICATION_STATUS) {
    return {
      intent: INTENTS.IUL_STATUS_RESEARCH,
      confidence: 0.93,
      entities: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_RESEARCH }
    };
  }

  if (isCampaignIntakeIulFirstTurn(context) || !lastAsk) {
    if (isIulReviewAdContext(context) && !lastAsk) {
      return { intent: INTENTS.IUL_GREETING, confidence: 0.92, entities: {} };
    }
  }
  if (isCampaignIntakeIulFirstTurn(context)) {
    return { intent: INTENTS.IUL_GREETING, confidence: 0.92, entities: {} };
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

  if (lastAsk === ASK.POLICY_ACTIVE) {
    const t = fold(text);
    if (/^(si|sí|yes|yeah|yep|claro|activa|active)\b/.test(t)) {
      return {
        intent: INTENTS.IUL_POLICY_ACTIVE_YES,
        confidence: 0.92,
        entities: { iulPolicyActive: true, policyType: "IUL" }
      };
    }
    if (/^(no|not|inactive|cancelada|cancelled|inactiva)\b/.test(t)) {
      return {
        intent: INTENTS.IUL_POLICY_ACTIVE_NO,
        confidence: 0.9,
        entities: { iulPolicyActive: false }
      };
    }
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
      ? "Hola{firstNameGreeting} 👋 Gracias por escribirnos. Para orientarle mejor, ¿cuál describe su situación?"
      : "Hi{firstNameGreeting} 👋 Thanks for writing. To help you better, which describes your situation?",
    intakeOpener: es
      ? "Hola{firstNameGreeting} 👋 Gracias por escribirnos. Para orientarle mejor, ¿cuál describe su situación?"
      : "Hi{firstNameGreeting} 👋 Thanks for writing. To help you better, which describes your situation?",
    qualificationAsk: es
      ? "Hola{firstNameGreeting} 👋 Gracias por escribirnos. Para orientarle mejor, ¿cuál describe su situación?"
      : "Hi{firstNameGreeting} 👋 Thanks for writing. To help you better, which describes your situation?",
    reviewIntentAsk: es
      ? "Perfecto. ¿Qué le gustaría revisar principalmente?"
      : "Perfect. What would you most like to review?",
    researchIntentAsk: es
      ? "Claro. ¿Qué le interesa entender mejor?"
      : "Of course. What would you like to understand better?",
    unsureAsk: es
      ? "No hay problema. Podemos ayudarle a identificar qué tipo de póliza tiene."
      : "No problem. We can help you identify what type of policy you have.",
    otherAsk: es
      ? "Cuénteme brevemente qué le gustaría revisar."
      : "Please tell me briefly what you would like to review.",
    briefHow: es
      ? "Un IUL es un seguro de vida con valor en efectivo. En la revisión le explicamos cómo está estructurada su póliza."
      : "An IUL is life insurance with cash-value features. In the review we explain how your policy is structured.",
    briefCosts: es
      ? "Los costos internos varían según cada póliza. Lo correcto es revisarlos con usted."
      : "Internal costs vary by policy. The right next step is to review them with you.",
    briefGrowth: es
      ? "El crecimiento del valor en efectivo depende de cómo está diseñada su póliza. Podemos revisarlo juntos."
      : "Cash-value growth depends on how your policy is designed. We can review it together.",
    briefBenefits: es
      ? "Los beneficios dependen de la estructura de su póliza. Podemos explicárselos con claridad en la revisión."
      : "Benefits depend on how your policy is structured. We can explain them clearly in the review.",
    briefUnderstand: es
      ? "Con gusto le ayudamos a entender su póliza con claridad, sin compromiso."
      : "We are happy to help you understand your policy clearly, with no obligation.",
    policyActiveAsk: es
      ? "¿Su póliza IUL está actualmente activa?"
      : "Is your IUL policy currently active?",
    policyTypeAsk: es
      ? "¿Qué tipo de póliza tiene: IUL, otro seguro de vida, o no está seguro?"
      : "What type of policy do you have: IUL, other life insurance, or not sure?",
    carrierAsk: es
      ? "¿Recuerda con qué compañía o aseguradora está la póliza? Si no lo sabe, no hay problema."
      : "Do you remember which company or carrier the policy is with? If you don't know, that's okay.",
    originalPurposeAsk: es
      ? "¿Cuál fue la razón principal por la que adquirió esa póliza originalmente?"
      : "What was the main reason you originally bought that policy?",
    policyAgeAsk: es
      ? "¿Hace aproximadamente cuánto tiempo la adquirió?"
      : "Approximately how long ago did you get it?",
    reviewReasonAsk: es
      ? "¿Qué le gustaría entender o revisar ahora mismo sobre la póliza?"
      : "What would you most like to understand or review about the policy right now?",
    documentsAsk: es
      ? "¿Tiene a mano una ilustración reciente, estado de cuenta o resumen de la póliza?"
      : "Do you have a recent illustration, statement, or policy summary handy?",
    schedulingTransition: es
      ? "Gracias. Con eso ya tengo una mejor idea. Lo ideal es revisar su póliza con usted y explicarle exactamente lo que tiene. ¿Qué horario le funciona mejor?"
      : "Thank you. That gives me a better idea. The best next step is to review your policy with you and explain exactly what you have. What time of day works best?",
    policyIsBadSafe: es
      ? "Eso no se puede determinar correctamente sin revisar los detalles de la póliza. Podemos verla con usted y explicarle cómo está funcionando."
      : "That can't be determined correctly without reviewing the policy details. We can look at it with you and explain how it's working.",
    infoOnly: es
      ? "Claro. Un IUL es un seguro de vida con valor en efectivo; no es “solo una inversión”. Le explicamos lo básico con su póliza delante."
      : "Of course. An IUL is life insurance with cash-value features — not “just an investment.” We explain the basics with your policy in front of us.",
    noReplace: es
      ? "La revisión es informativa y no le obliga a cambiar ni reemplazar nada. Solo vemos cómo está estructurada su póliza."
      : "The review is informational and doesn't obligate you to change or replace anything. We just look at how your policy is structured.",
    agentInvestment: es
      ? "La póliza combina seguro de vida con características de valor en efectivo. No discutimos con su agente; si desea, revisamos cómo está estructurada la suya."
      : "The policy combines life insurance with cash-value features. We won't argue with your agent; if you’d like, we can review how yours is structured.",
    sendHere: es
      ? "En WhatsApp: es un seguro de vida con valor en efectivo, costos internos y una ilustración a futuro. Sin ver su póliza no hacemos una recomendación personalizada."
      : "Over WhatsApp: it's life insurance with cash-value features, internal costs, and a future illustration. We don't make a personalized recommendation without reviewing your policy.",
    primerica: es
      ? "Sí: trabajamos con Primerica. La revisión es para entender su póliza IUL con claridad, sin compromiso."
      : "Yes — we work with Primerica. The review is to understand your IUL policy clearly, with no obligation.",
    cost: es
      ? "La revisión es gratis. Cualquier recomendación financiera depende de su situación y necesidades, después de ver la póliza."
      : "The review is free. Any financial recommendation depends on your needs and situation, after we look at the policy.",
    dayPartAck: es
      ? "Perfecto. Le comparto opciones para la revisión por Zoom."
      : "Perfect. I'll share options for the Zoom review.",
    offerSlots: es
      ? "Tengo estos horarios disponibles para la revisión por Zoom. ¿Cuál le funciona mejor?"
      : "I have these times available for the Zoom review. Which works best for you?",
    zeroSlots: es
      ? "Por ahora no veo un horario disponible en ese rango. ¿Le funciona mejor otro día u horario?"
      : "I don't see an available time in that range right now. Would another day or time work better?",
    confirmDeferred: es
      ? "Perfecto. Confirmo la revisión por Zoom en ese horario."
      : "Perfect. I'll confirm the Zoom review at that time.",
    clarify: es
      ? "Para seguir con claridad: ¿cuál describe su situación?"
      : "To keep this clear: which describes your situation?"
  };
}

function renderIulAdReply(templateKey, language, entities = {}) {
  const c = copy(language);
  const firstName = String(entities.firstName || "").trim();
  const firstNameGreeting = firstName ? `, ${firstName}` : "";
  const map = {
    iul_ad_opener: c.qualificationAsk,
    iul_intake_opener: c.qualificationAsk,
    iul_ask_qualification_status: c.qualificationAsk,
    iul_ask_review_intent: c.reviewIntentAsk,
    iul_ask_research_intent: c.researchIntentAsk,
    iul_ask_policy_in_hand: c.unsureAsk,
    iul_ask_other_detail: c.otherAsk,
    iul_brief_how_then_review: `${c.briefHow} ${c.schedulingTransition}`,
    iul_brief_costs_then_review: `${c.briefCosts} ${c.schedulingTransition}`,
    iul_brief_growth_then_review: `${c.briefGrowth} ${c.schedulingTransition}`,
    iul_brief_benefits_then_review: `${c.briefBenefits} ${c.schedulingTransition}`,
    iul_brief_understand_then_review: `${c.briefUnderstand} ${c.schedulingTransition}`,
    iul_ask_policy_active: c.policyActiveAsk,
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
  return String(map[templateKey] || c.qualificationAsk).replace(
    /\{firstNameGreeting\}/g,
    firstNameGreeting
  );
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
    campaignIntakePurpose: context.campaignIntakePurpose || "IUL_REVIEW",
    ctwaReferral: context.ctwaReferral || null,
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

function interactiveCatalogForAsk(lastQuestionAsked) {
  if (lastQuestionAsked === ASK.QUALIFICATION_STATUS) {
    return "status";
  }
  if (lastQuestionAsked === ASK.REVIEW_INTENT) {
    return "reviewIntent";
  }
  if (lastQuestionAsked === ASK.RESEARCH_INTENT) {
    return "researchIntent";
  }
  if (lastQuestionAsked === ASK.POLICY_IN_HAND) {
    return "policyInHand";
  }
  if (
    lastQuestionAsked === ASK.SCHEDULING_DAY_PART ||
    lastQuestionAsked === ASK.REVIEW_DAY_PART
  ) {
    return "dayPart";
  }
  return null;
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
  const firstName = resolveIulFirstName(context);
  const catalog = interactiveCatalogForAsk(lastQuestionAsked);
  const body = renderIulAdReply(templateKey, structured.preferredLanguage, { firstName });
  structured.customerReplyPlan.entities = {
    ...(structured.customerReplyPlan.entities || {}),
    firstName
  };
  if (catalog) {
    const built = buildIulInteractive(catalog, body);
    structured.customerReplyPlan.entities.whatsappInteractive = built.interactive;
    structured.customerReplyPlan.entities.interactiveFallbackText = built.fallbackText;
  }
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
    [ASK.POLICY_ACTIVE]: "iul_ask_policy_active",
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
    [ASK.POLICY_ACTIVE]: NEXT_ACTIONS.IUL_ASK_POLICY_ACTIVE,
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

function beginZoomTransition(structured, context, {
  knownFacts = {},
  reasonCodes = [],
  templateKey = "iul_scheduling_transition"
} = {}) {
  return finishIulDecision(structured, context, {
    templateKey,
    nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
    lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
    knownFacts: {
      ...knownFacts,
      iulWorkflowStage: IUL_STAGES.REVIEW_READY,
      reviewMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM
    },
    reasonCodes: [...reasonCodes, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK],
    iulWorkflowStage: IUL_STAGES.REVIEW_READY
  });
}

function briefTemplateForIntent(intentId) {
  if (intentId === IUL_OPTION_IDS.REVIEW_HOW) {
    return "iul_brief_how_then_review";
  }
  if (intentId === IUL_OPTION_IDS.REVIEW_COSTS) {
    return "iul_brief_costs_then_review";
  }
  if (intentId === IUL_OPTION_IDS.REVIEW_GROWTH) {
    return "iul_brief_growth_then_review";
  }
  if (intentId === IUL_OPTION_IDS.REVIEW_BENEFITS) {
    return "iul_brief_benefits_then_review";
  }
  if (intentId === IUL_OPTION_IDS.REVIEW_UNDERSTAND) {
    return "iul_brief_understand_then_review";
  }
  return "iul_scheduling_transition";
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
    INTENTS.IUL_REVIEW_COST_QUESTION,
    INTENTS.IUL_STATUS_ACTIVE,
    INTENTS.IUL_STATUS_RESEARCH,
    INTENTS.IUL_STATUS_UNSURE,
    INTENTS.IUL_REVIEW_INTENT,
    INTENTS.IUL_OTHER_FREE_TEXT,
    INTENTS.IUL_POLICY_IN_HAND
  ]);
  if (
    !isIulReviewAdTurn({ context, text: inboundText }) &&
    !iulIntents.has(intent)
  ) {
    return null;
  }

  if (intent === INTENTS.IUL_STATUS_ACTIVE) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_review_intent",
      nextAction: NEXT_ACTIONS.IUL_ASK_REVIEW_INTENT,
      lastQuestionAsked: ASK.REVIEW_INTENT,
      knownFacts: {
        iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
        iulPolicyActive: true,
        policyType: "IUL",
        iulWorkflowStage: IUL_STAGES.ENGAGED
      },
      reasonCodes: [
        REASON_CODES.IUL_BUTTON_FIRST_QUALIFICATION,
        REASON_CODES.IUL_STATUS_CAPTURED
      ],
      iulWorkflowStage: IUL_STAGES.ENGAGED
    });
  }

  if (intent === INTENTS.IUL_STATUS_RESEARCH) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_research_intent",
      nextAction: NEXT_ACTIONS.IUL_ASK_RESEARCH_INTENT,
      lastQuestionAsked: ASK.RESEARCH_INTENT,
      knownFacts: {
        iulQualificationStatus: IUL_OPTION_IDS.STATUS_RESEARCH,
        iulWorkflowStage: IUL_STAGES.ENGAGED
      },
      reasonCodes: [
        REASON_CODES.IUL_BUTTON_FIRST_QUALIFICATION,
        REASON_CODES.IUL_STATUS_CAPTURED
      ],
      iulWorkflowStage: IUL_STAGES.ENGAGED
    });
  }

  if (intent === INTENTS.IUL_STATUS_UNSURE) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_policy_in_hand",
      nextAction: NEXT_ACTIONS.IUL_ASK_POLICY_IN_HAND,
      lastQuestionAsked: ASK.POLICY_IN_HAND,
      knownFacts: {
        iulQualificationStatus: IUL_OPTION_IDS.STATUS_UNSURE,
        iulWorkflowStage: IUL_STAGES.ENGAGED
      },
      reasonCodes: [
        REASON_CODES.IUL_BUTTON_FIRST_QUALIFICATION,
        REASON_CODES.IUL_STATUS_CAPTURED
      ],
      iulWorkflowStage: IUL_STAGES.ENGAGED
    });
  }

  if (intent === INTENTS.IUL_REVIEW_INTENT) {
    const reviewIntent = interpretation.entities?.iulReviewIntent || null;
    if (interpretation.entities?.wantsOtherDetail || reviewIntent === IUL_OPTION_IDS.REVIEW_OTHER) {
      return finishIulDecision(structured, context, {
        templateKey: "iul_ask_other_detail",
        nextAction: NEXT_ACTIONS.IUL_ASK_OTHER_DETAIL,
        lastQuestionAsked: ASK.OTHER_DETAIL,
        knownFacts: {
          iulReviewIntent: IUL_OPTION_IDS.REVIEW_OTHER,
          iulWorkflowStage: IUL_STAGES.REVIEW_QUALIFICATION
        },
        reasonCodes: [REASON_CODES.IUL_REVIEW_INTENT_CAPTURED],
        iulWorkflowStage: IUL_STAGES.REVIEW_QUALIFICATION
      });
    }
    const researchPath =
      context.knownFacts?.iulQualificationStatus === IUL_OPTION_IDS.STATUS_RESEARCH ||
      context.conversation?.lastQuestionAsked === ASK.RESEARCH_INTENT;
    return beginZoomTransition(structured, context, {
      templateKey: researchPath
        ? briefTemplateForIntent(reviewIntent)
        : "iul_scheduling_transition",
      knownFacts: {
        iulReviewIntent: reviewIntent,
        reviewReason: reviewIntent,
        iulWorkflowStage: IUL_STAGES.REVIEW_READY
      },
      reasonCodes: [REASON_CODES.IUL_REVIEW_INTENT_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_OTHER_FREE_TEXT) {
    return beginZoomTransition(structured, context, {
      knownFacts: {
        iulOtherDetail: interpretation.entities?.iulOtherDetail || null,
        reviewReasonRaw: interpretation.entities?.reviewReasonRaw || null,
        iulWorkflowStage: IUL_STAGES.REVIEW_READY
      },
      reasonCodes: [REASON_CODES.IUL_OTHER_DETAIL_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_POLICY_IN_HAND) {
    return beginZoomTransition(structured, context, {
      knownFacts: {
        iulPolicyInHand: interpretation.entities?.iulPolicyInHand === true,
        iulWorkflowStage: IUL_STAGES.REVIEW_READY
      },
      reasonCodes: [REASON_CODES.IUL_REVIEW_INTENT_CAPTURED]
    });
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

  if (intent === INTENTS.IUL_POLICY_ACTIVE_YES) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_carrier",
      nextAction: NEXT_ACTIONS.IUL_ASK_CARRIER,
      lastQuestionAsked: ASK.CARRIER,
      knownFacts: {
        iulPolicyActive: true,
        policyType: "IUL",
        iulWorkflowStage: IUL_STAGES.ENGAGED
      },
      iulWorkflowStage: IUL_STAGES.ENGAGED
    });
  }

  if (intent === INTENTS.IUL_POLICY_ACTIVE_NO) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_policy_is_bad_safe",
      nextAction: NEXT_ACTIONS.IUL_ASK_POLICY_TYPE,
      lastQuestionAsked: ASK.POLICY_TYPE,
      knownFacts: { iulPolicyActive: false },
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
  if (
    pending === ASK.QUALIFICATION_STATUS ||
    pending === ASK.REVIEW_INTENT ||
    pending === ASK.RESEARCH_INTENT ||
    pending === ASK.POLICY_IN_HAND ||
    pending === ASK.OTHER_DETAIL
  ) {
    const replayTemplate =
      pending === ASK.REVIEW_INTENT
        ? "iul_ask_review_intent"
        : pending === ASK.RESEARCH_INTENT
          ? "iul_ask_research_intent"
          : pending === ASK.POLICY_IN_HAND
            ? "iul_ask_policy_in_hand"
            : pending === ASK.OTHER_DETAIL
              ? "iul_ask_other_detail"
              : "iul_ask_qualification_status";
    const replayAction =
      pending === ASK.REVIEW_INTENT
        ? NEXT_ACTIONS.IUL_ASK_REVIEW_INTENT
        : pending === ASK.RESEARCH_INTENT
          ? NEXT_ACTIONS.IUL_ASK_RESEARCH_INTENT
          : pending === ASK.POLICY_IN_HAND
            ? NEXT_ACTIONS.IUL_ASK_POLICY_IN_HAND
            : pending === ASK.OTHER_DETAIL
              ? NEXT_ACTIONS.IUL_ASK_OTHER_DETAIL
              : NEXT_ACTIONS.IUL_ASK_QUALIFICATION_STATUS;
    return finishIulDecision(structured, context, {
      templateKey: replayTemplate,
      nextAction: replayAction,
      lastQuestionAsked: pending
    });
  }

  if (
    pending &&
    pending !== ASK.POLICY_TYPE &&
    pending !== ASK.POLICY_ACTIVE
  ) {
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

  if (isCampaignIntakeIulFirstTurn(context) || !context?.conversation?.lastQuestionAsked) {
    return finishIulDecision(structured, context, {
      templateKey: "iul_ask_qualification_status",
      nextAction: NEXT_ACTIONS.IUL_ASK_QUALIFICATION_STATUS,
      lastQuestionAsked: ASK.QUALIFICATION_STATUS,
      knownFacts: { iulWorkflowStage: IUL_STAGES.NEW_IUL_LEAD },
      reasonCodes: [
        REASON_CODES.IUL_SPANISH_FIRST_OPENER,
        REASON_CODES.IUL_BUTTON_FIRST_QUALIFICATION
      ],
      iulWorkflowStage: IUL_STAGES.NEW_IUL_LEAD
    });
  }

  return finishIulDecision(structured, context, {
    templateKey: "iul_ask_qualification_status",
    nextAction: NEXT_ACTIONS.IUL_ASK_QUALIFICATION_STATUS,
    lastQuestionAsked: ASK.QUALIFICATION_STATUS,
    knownFacts: { iulWorkflowStage: IUL_STAGES.NEW_IUL_LEAD },
    reasonCodes: [
      REASON_CODES.IUL_SPANISH_FIRST_OPENER,
      REASON_CODES.IUL_BUTTON_FIRST_QUALIFICATION
    ],
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
  isCampaignIntakeIulFirstTurn,
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
