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
  READ_STATUS,
  normalizeIulDayPart,
  dayPartConstraints,
  enrichIulDaypartAvailability
} = require("./iulPolicyReviewScheduling");
const { IUL_STAGES, IUL_REVIEW_MEETING_TYPE } = require("../iulWorkflowConstants");
const {
  IUL_OPTION_IDS,
  MEETING_MODE_OPTIONS,
  resolveIulOption,
  buildIulInteractive
} = require("./iulQualificationOptions");
const {
  buildInteractiveFromOptions,
  formatNumberedFallback
} = require("../whatsappInteractiveMessage");
const {
  attachIulSlotSelectionIds,
  collectIulSlotPool,
  chooseIulSlotPresentation,
  buildIulSlotInteractive,
  resolveIulSlotBySelectionId,
  isIulSlotMoreId,
  isIulSlotMoreLabel,
  isIulSlotSelectionId,
  isIulSlotExpired,
  parseIulFreeTextSlot,
  rejectIdsForShown,
  excludeRejectedSlots,
  selectIulCrossDatePage
} = require("./iulSlotSelection");
const { isCompleteOfficeAddress } = require("../officeAddressResolver");
const { getOfficeLocation } = require("../businessRulesEngine");
const { isTeamVisionSeedTenant } = require("../teamVisionSeedTenant");

const CAMPAIGN_KIND = "iul_review_ad";
const CONVERSATION_GOAL = "policy_review";

const ASK = Object.freeze({
  POLICY_TYPE: "iul_ask_policy_type",
  CARRIER: "iul_ask_carrier",
  ORIGINAL_PURPOSE: "iul_ask_original_purpose",
  POLICY_AGE: "iul_ask_policy_age",
  REVIEW_REASON: "iul_ask_review_reason",
  DOCUMENTS: "iul_ask_documents",
  MEETING_MODE: "iul_ask_meeting_mode",
  SCHEDULING_DAY_PART: "iul_ask_scheduling_day_part",
  OFFER_SLOTS: "iul_offer_review_slots",
  CONFIRM_SLOT: "iul_confirm_review_slot",
  SCHEDULING_UNAVAILABLE: "iul_scheduling_unavailable",
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

function looksLikeWeekendPreference(text) {
  const t = fold(text);
  return (
    /\bfin de semana\b/.test(t) ||
    /\bfinde\b/.test(t) ||
    /\bsabado\b/.test(t) ||
    /\bdomingo\b/.test(t) ||
    /\bweekend\b/.test(t) ||
    /\bsaturday\b/.test(t) ||
    /\bsunday\b/.test(t)
  );
}

function parseIulReviewDayPart(text) {
  const t = fold(text);
  if (/\bnoche\b/.test(t) || /\bevening\b/.test(t) || /\bnight\b/.test(t)) {
    return "evening";
  }
  if (/\btarde\b/.test(t) || /\bafternoon\b/.test(t)) {
    return "afternoon";
  }
  if (
    /\bdia\b/.test(t) ||
    /\bmanana\b/.test(t) ||
    /\bmorning\b/.test(t) ||
    /\bduring the day\b/.test(t) ||
    /\bdaytime\b/.test(t)
  ) {
    return "morning";
  }
  return null;
}

function formatIulClock(timeKey) {
  const [hRaw, mRaw] = String(timeKey || "").split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw || 0);
  if (!Number.isFinite(hour)) {
    return String(timeKey || "");
  }
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function formatIulSlotLine(slot, language) {
  const { WEEKDAY_LABELS } = require("./dateResolution");
  const dateKey = String(slot?.date || slot?.dateKey || "");
  const time = formatIulClock(slot?.time || slot?.timeKey);
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekdayIndex = y && m && d ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay() : null;
  const weekday =
    weekdayIndex == null
      ? ""
      : language === LANGUAGES.ENGLISH
        ? WEEKDAY_LABELS.en[weekdayIndex]
        : WEEKDAY_LABELS.es[weekdayIndex];
  if (!weekday) {
    return time;
  }
  return language === LANGUAGES.ENGLISH ? `${weekday} at ${time}` : `${weekday} a las ${time}`;
}

function formatIulSlotLines(slots, language) {
  return (slots || [])
    .map((slot) => formatIulSlotLine(slot, language))
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function iulDayPartEntities(dayPart, { preferredWeekend = false } = {}) {
  const part = normalizeIulDayPart(dayPart);
  const constraints = dayPartConstraints(part);
  return {
    dayPart: part,
    iulReviewDayPart: part,
    reviewPreferredDayPart: part,
    preferredDayPart: part,
    availabilityConstraint: constraints.dayPart
      ? {
          type: "day_part",
          dayPart: constraints.dayPart,
          earliestTime: constraints.earliestTime || null,
          latestTime: constraints.latestTime || null
        }
      : null,
    preferredWeekend: preferredWeekend || undefined
  };
}

function dayPartPhrase(dayPart, language) {
  const part = normalizeIulDayPart(dayPart);
  if (language === LANGUAGES.ENGLISH || language === "en") {
    if (part === "afternoon") return "afternoon";
    if (part === "evening") return "evening";
    return "morning";
  }
  if (part === "afternoon") return "en la tarde";
  if (part === "evening") return "en la noche";
  return "en la mañana";
}

function parseOfferedSlotSelection(text, context) {
  return parseIulFreeTextSlot(text, context.appointment?.previouslyOfferedSlots || []);
}

function resolveSelectedIulSlot(context, interpretation = {}) {
  const offered = context.appointment?.previouslyOfferedSlots || [];
  const selected = interpretation.entities?.selectedSlot || null;
  if (selected) {
    return selected;
  }
  const dateKey =
    interpretation.entities?.reviewProposedDate ||
    context.appointment?.proposedDate ||
    context.knownFacts?.reviewProposedDate ||
    null;
  const timeKey =
    interpretation.entities?.reviewProposedTime ||
    context.appointment?.proposedTime ||
    context.knownFacts?.reviewProposedTime ||
    null;
  if (dateKey && timeKey) {
    const match = offered.find(
      (row) =>
        String(row.date || row.dateKey || "") === String(dateKey) &&
        String(row.time || row.timeKey || "") === String(timeKey)
    );
    if (match) {
      return match;
    }
    return { date: dateKey, time: timeKey, dateKey, timeKey };
  }
  if (offered.length === 1) {
    return offered[0];
  }
  return null;
}

function seedIulCreateEntities(structured, slot) {
  const dateKey = slot?.date || slot?.dateKey || null;
  const timeKey = slot?.time || slot?.timeKey || null;
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    selectedSlot: slot,
    requestedDate: dateKey,
    requestedTime: timeKey,
    reviewProposedDate: dateKey,
    reviewProposedTime: timeKey
  };
  structured.entities = {
    ...(structured.entities || {}),
    selectedSlot: slot,
    requestedDate: dateKey,
    requestedTime: timeKey,
    reviewProposedDate: dateKey,
    reviewProposedTime: timeKey
  };
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

  if (lastAsk === ASK.MEETING_MODE) {
    const picked = matchQualificationInput("meetingMode", { text, interactiveReply });
    if (picked?.id === IUL_OPTION_IDS.MEET_OFFICE) {
      return {
        intent: INTENTS.IUL_CHOOSE_MEETING_MODE,
        confidence: 0.96,
        entities: { meetingMode: "in_person" }
      };
    }
    if (picked?.id === IUL_OPTION_IDS.MEET_ZOOM) {
      return {
        intent: INTENTS.IUL_CHOOSE_MEETING_MODE,
        confidence: 0.96,
        entities: { meetingMode: "zoom" }
      };
    }
  }

  if (lastAsk === ASK.OFFER_SLOTS || lastAsk === ASK.CONFIRM_SLOT) {
    if (
      isIulSlotMoreId(interactiveReply?.id) ||
      isIulSlotMoreLabel(interactiveReply?.title) ||
      isIulSlotMoreLabel(text)
    ) {
      return {
        intent: INTENTS.IUL_REQUEST_MORE_SLOTS,
        confidence: 0.96,
        entities: { iulRequestMoreSlots: true }
      };
    }
    if (isIulSlotSelectionId(interactiveReply?.id)) {
      const offered = context.appointment?.previouslyOfferedSlots || [];
      const slot = resolveIulSlotBySelectionId(interactiveReply.id, offered);
      if (!slot || isIulSlotExpired(slot, context._testNow)) {
        return {
          intent: INTENTS.IUL_STALE_SLOT_SELECTION,
          confidence: 0.96,
          entities: { staleSlotSelectionId: interactiveReply.id }
        };
      }
      return {
        intent: INTENTS.IUL_SELECT_OFFERED_SLOT,
        confidence: 0.97,
        entities: {
          selectedSlot: slot,
          reviewProposedDate: slot.date || slot.dateKey || null,
          reviewProposedTime: slot.time || slot.timeKey || null,
          iulSlotSelectionId: slot.selectionId,
          requestedDate: slot.date || slot.dateKey || null,
          requestedTime: slot.time || slot.timeKey || null
        }
      };
    }
  }

  if (isIulDayPartAnswerContext(lastAsk)) {
    const weekend = looksLikeWeekendPreference(text);
    const day = matchQualificationInput("dayPart", { text, interactiveReply });
    if (day?.id === IUL_OPTION_IDS.DAY_MORNING) {
      return {
        intent: INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
        confidence: 0.95,
        entities: iulDayPartEntities("morning", { preferredWeekend: weekend })
      };
    }
    if (day?.id === IUL_OPTION_IDS.DAY_AFTERNOON) {
      return {
        intent: INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
        confidence: 0.95,
        entities: iulDayPartEntities("afternoon", { preferredWeekend: weekend })
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
          reviewProposedTime: slot.time || slot.timeKey || null,
          requestedDate: slot.date || slot.dateKey || null,
          requestedTime: slot.time || slot.timeKey || null
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

  if (isIulDayPartAnswerContext(lastAsk)) {
    const dayPart = parseIulReviewDayPart(text);
    if (dayPart) {
      return {
        intent: INTENTS.IUL_CHOOSE_REVIEW_DAY_PART,
        confidence: 0.93,
        entities: iulDayPartEntities(dayPart, {
          preferredWeekend: looksLikeWeekendPreference(text)
        })
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
      ? "Gracias. Con eso ya tengo una mejor idea. Lo ideal es revisar su póliza con usted y explicarle exactamente lo que tiene. ¿Cómo prefiere hacer su revisión de póliza?"
      : "Thank you. That gives me a better idea. The best next step is to review your policy with you and explain exactly what you have. How would you prefer to do your policy review?",
    meetingModeAsk: es
      ? "¿Cómo prefiere hacer su revisión de póliza?"
      : "How would you prefer to do your policy review?",
    dayPartAsk: es
      ? "¿Qué horario prefiere para su revisión {modePhrase}?"
      : "What time of day do you prefer for your {modePhrase} review?",
    officeUnavailable: es
      ? "Por ahora no tengo una dirección de oficina configurada. Podemos hacer la revisión por Zoom."
      : "I don't have a configured office address right now. We can do the review on Zoom.",
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
      ? "Perfecto. Le comparto opciones para la revisión {modePhrase}."
      : "Perfect. I'll share options for the {modePhrase} review.",
    offerSlots: es
      ? "Tengo estos horarios disponibles para su revisión {modePhrase}. ¿Cuál le funciona mejor?"
      : "I have these times available for your {modePhrase} review. Which works best for you?",
    nearestDaypart: es
      ? "No tengo disponibilidad {dayPartPhrase} en los próximos días. Tengo disponibilidad:"
      : "I don't have {dayPartPhrase} availability in the coming days. I do have:",
    nearestWeekend: es
      ? "No tengo disponibilidad de fin de semana {dayPartPhrase}. Tengo estos horarios:"
      : "I don't have weekend {dayPartPhrase} availability. I do have these times:",
    noMoreSlots: es
      ? "Esos son los horarios disponibles que tengo por ahora. ¿Desea elegir uno de ellos?"
      : "Those are the available times I have for now. Would you like to choose one of them?",
    createFailed: es
      ? "No pude reservar ese horario ahora. Si desea, confirme de nuevo o elija otro de los horarios disponibles."
      : "I could not book that time just now. Please confirm again or choose another available time.",
    noAvailability: es
      ? "Por ahora no tengo horarios disponibles para la revisión {modePhrase}. Un asesor le contactará para coordinar."
      : "I don't have {modePhrase} review times available right now. An advisor will contact you to coordinate.",
    zeroSlots: es
      ? "Por ahora no veo un horario disponible en ese rango. ¿Le funciona mejor otro día u horario?"
      : "I don't see an available time in that range right now. Would another day or time work better?",
    confirmDeferred: es
      ? "Perfecto. Estoy reservando su revisión {modePhrase} para el {slotLabel}. Le confirmo cuando quede agendada."
      : "Perfect. I'm booking your {modePhrase} review for {slotLabel}. I'll confirm once it is scheduled.",
    confirmedZoom: es
      ? "Listo. Su revisión por Zoom quedó agendada para el {slotLabel}. Le enviaré el enlace de Zoom."
      : "Done. Your Zoom review is scheduled for {slotLabel}. I will send the Zoom link.",
    confirmedOffice: es
      ? "Listo. Su revisión en la oficina quedó agendada para el {slotLabel}.{officeAddressLine}"
      : "Done. Your in-office review is scheduled for {slotLabel}.{officeAddressLine}",
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
    iul_ask_meeting_mode: c.meetingModeAsk,
    iul_ask_scheduling_day_part: c.dayPartAsk,
    iul_office_unavailable: `${c.officeUnavailable} ${c.meetingModeAsk}`,
    iul_policy_is_bad_safe: c.policyIsBadSafe,
    iul_info_only_then_review: `${c.infoOnly} ${c.schedulingTransition}`,
    iul_no_replace_then_review: `${c.noReplace} ${c.schedulingTransition}`,
    iul_agent_investment_then_review: `${c.agentInvestment} ${c.schedulingTransition}`,
    iul_send_info_then_review: `${c.sendHere} ${c.schedulingTransition}`,
    iul_primerica_then_continue: `${c.primerica} ${c.schedulingTransition}`,
    iul_review_cost_then_continue: `${c.cost} ${c.schedulingTransition}`,
    iul_review_day_part_ack: c.dayPartAck,
    iul_offer_review_slots: c.offerSlots,
    iul_no_more_review_slots: c.noMoreSlots,
    iul_review_create_failed: c.createFailed,
    iul_offer_nearest_review_slots: c.nearestDaypart,
    iul_offer_weekend_fallback_slots: c.nearestWeekend,
    iul_zero_review_slots: c.zeroSlots,
    iul_no_review_availability: c.noAvailability,
    iul_confirm_review_deferred: c.confirmDeferred,
    iul_review_confirmed_zoom: c.confirmedZoom,
    iul_review_confirmed_office: c.confirmedOffice,
    iul_clarify_policy_type: c.clarify
  };
  const phrase = dayPartPhrase(entities.fallbackDayPart || entities.dayPart, language);
  const officeAddress = String(entities.officeAddress || "").trim();
  const officeAddressLine = officeAddress
    ? localeCode(language) === "en"
      ? ` Address: ${officeAddress}`
      : ` Dirección: ${officeAddress}`
    : "";
  return String(map[templateKey] || c.qualificationAsk)
    .replace(/\{firstNameGreeting\}/g, firstNameGreeting)
    .replace(/\{dayPartPhrase\}/g, phrase)
    .replace(/\{modePhrase\}/g, iulModePhrase(entities, language))
    .replace(/\{slotLabel\}/g, String(entities.slotLabel || entities.requestedTime || "ese horario"))
    .replace(/\{officeAddressLine\}/g, officeAddressLine);
}

function isIulInPersonMode(facts = {}) {
  const mode = String(facts.meetingMode || facts.reviewMeetingMode || "").toLowerCase();
  const meetingType = String(facts.preferredMeetingType || facts.reviewMeetingType || "").toLowerCase();
  return mode === "in_person" || meetingType === "in_person" || meetingType === "office";
}

function iulModePhrase(entities = {}, language) {
  const es = localeCode(language) !== "en";
  if (isIulInPersonMode(entities) || entities.meetingMode === "in_person") {
    return es ? "en la oficina" : "in the office";
  }
  return es ? "por Zoom" : "via Zoom";
}

function resolveIulOfficeLocation(context = {}) {
  if (context._officeUnavailable === true) {
    return null;
  }
  const fixture = context._officeLocation;
  if (fixture) {
    const address = typeof fixture === "string" ? fixture : fixture.fullAddress;
    return isCompleteOfficeAddress(address) ? { fullAddress: String(address).trim() } : null;
  }
  const known = context.knownFacts?.reviewOfficeAddress || context.knownFacts?.officeAddress;
  if (isCompleteOfficeAddress(known)) {
    return { fullAddress: String(known).trim() };
  }
  if (isTeamVisionSeedTenant(context.organizationId)) {
    const office = getOfficeLocation();
    if (isCompleteOfficeAddress(office?.fullAddress)) {
      return office;
    }
  }
  return null;
}

function meetingModeFacts(mode, context = {}) {
  const office = mode === "in_person" ? resolveIulOfficeLocation(context) : null;
  return {
    meetingMode: mode,
    reviewMeetingMode: mode,
    preferredMeetingType:
      mode === "in_person" ? IUL_REVIEW_MEETING_TYPE.IN_PERSON : IUL_REVIEW_MEETING_TYPE.ZOOM,
    reviewMeetingType:
      mode === "in_person" ? IUL_REVIEW_MEETING_TYPE.IN_PERSON : IUL_REVIEW_MEETING_TYPE.ZOOM,
    reviewOfficeAddress: office?.fullAddress || null
  };
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
  if (lastQuestionAsked === ASK.MEETING_MODE) {
    return "meetingMode";
  }
  if (
    lastQuestionAsked === ASK.SCHEDULING_DAY_PART ||
    lastQuestionAsked === ASK.REVIEW_DAY_PART
  ) {
    return "dayPart";
  }
  return null;
}

function isIulDayPartAnswerContext(lastAsk) {
  return (
    lastAsk === ASK.SCHEDULING_DAY_PART ||
    lastAsk === ASK.REVIEW_DAY_PART ||
    lastAsk === ASK.OFFER_SLOTS ||
    lastAsk === ASK.CONFIRM_SLOT ||
    lastAsk === ASK.SCHEDULING_UNAVAILABLE
  );
}

function resolveOfferedSlotsForInteractive(priorEntities, context) {
  if (Array.isArray(priorEntities?.offeredSlots) && priorEntities.offeredSlots.length) {
    return priorEntities.offeredSlots;
  }
  return context?.appointment?.previouslyOfferedSlots || [];
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
  const priorEntities = structured.customerReplyPlan.entities || {};
  const offeredSlots = attachIulSlotSelectionIds(
    resolveOfferedSlotsForInteractive(priorEntities, context)
  );
  const includeMoreSlots =
    priorEntities.includeMoreSlots === true ||
    (lastQuestionAsked === ASK.OFFER_SLOTS &&
      offeredSlots.length === 2 &&
      priorEntities.includeMoreSlots !== false &&
      context.knownFacts?.iulIncludeMoreSlots !== false);
  const modeFacts = {
    meetingMode:
      priorEntities.meetingMode ||
      knownFacts.meetingMode ||
      context.knownFacts?.meetingMode ||
      null,
    preferredMeetingType:
      knownFacts.preferredMeetingType ||
      context.knownFacts?.preferredMeetingType ||
      null,
    reviewMeetingType:
      knownFacts.reviewMeetingType ||
      context.knownFacts?.reviewMeetingType ||
      null,
    slotLabel: priorEntities.slotLabel || null,
    officeAddress:
      priorEntities.officeAddress ||
      knownFacts.reviewOfficeAddress ||
      context.knownFacts?.reviewOfficeAddress ||
      null
  };
  const body = renderIulAdReply(templateKey, structured.preferredLanguage, {
    firstName,
    offeredSlots,
    fallbackDayPart: priorEntities.fallbackDayPart,
    dayPart: priorEntities.dayPart,
    ...modeFacts
  });
  structured.customerReplyPlan.entities = {
    ...priorEntities,
    firstName,
    ...modeFacts,
    ...(lastQuestionAsked === ASK.OFFER_SLOTS && offeredSlots.length
      ? { offeredSlots, includeMoreSlots }
      : lastQuestionAsked === ASK.CONFIRM_SLOT
        ? { offeredSlots: undefined, whatsappInteractive: undefined }
        : {})
  };
  if (lastQuestionAsked === ASK.CONFIRM_SLOT) {
    delete structured.customerReplyPlan.entities.offeredSlots;
    delete structured.customerReplyPlan.entities.whatsappInteractive;
    delete structured.customerReplyPlan.entities.interactiveFallbackText;
    delete structured.customerReplyPlan.entities.includeMoreSlots;
  }
  if (catalog && lastQuestionAsked === ASK.MEETING_MODE) {
    const office = resolveIulOfficeLocation(context);
    const options = office
      ? MEETING_MODE_OPTIONS
      : MEETING_MODE_OPTIONS.filter((row) => row.id === IUL_OPTION_IDS.MEET_ZOOM);
    const built = {
      interactive: buildInteractiveFromOptions({
        body,
        options,
        listButtonText: "Ver opciones",
        listSectionTitle: "Opciones"
      }),
      fallbackText: formatNumberedFallback(body, options)
    };
    structured.customerReplyPlan.entities.whatsappInteractive = built.interactive;
    structured.customerReplyPlan.entities.interactiveFallbackText = built.fallbackText;
  } else if (catalog) {
    const built = buildIulInteractive(catalog, body);
    structured.customerReplyPlan.entities.whatsappInteractive = built.interactive;
    structured.customerReplyPlan.entities.interactiveFallbackText = built.fallbackText;
  } else if (lastQuestionAsked === ASK.OFFER_SLOTS && offeredSlots.length) {
    const language =
      structured.preferredLanguage === LANGUAGES.ENGLISH ||
      structured.preferredLanguage === "english" ||
      structured.preferredLanguage === "en"
        ? "en"
        : "es";
    const built = buildIulSlotInteractive(offeredSlots, body, {
      includeMore: includeMoreSlots,
      language
    });
    structured.customerReplyPlan.entities.whatsappInteractive = built.interactive;
    structured.customerReplyPlan.entities.interactiveFallbackText = built.fallbackText;
    structured.customerReplyPlan.entities.offeredSlots = offeredSlots;
    structured.contextPatch.appointment = {
      ...(structured.contextPatch.appointment || context.appointment || {}),
      previouslyOfferedSlots: offeredSlots,
      meetingType: isIulInPersonMode({ ...context.knownFacts, ...knownFacts, ...modeFacts })
        ? IUL_REVIEW_MEETING_TYPE.IN_PERSON
        : IUL_REVIEW_MEETING_TYPE.ZOOM
    };
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
  return ASK.MEETING_MODE;
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
    [ASK.MEETING_MODE]: "iul_ask_meeting_mode",
    [ASK.SCHEDULING_DAY_PART]: "iul_scheduling_transition",
    [ASK.OFFER_SLOTS]: "iul_offer_review_slots",
    [ASK.SCHEDULING_UNAVAILABLE]: "iul_no_review_availability"
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
    [ASK.MEETING_MODE]: NEXT_ACTIONS.IUL_ASK_MEETING_MODE,
    [ASK.SCHEDULING_DAY_PART]: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
    [ASK.OFFER_SLOTS]: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS,
    [ASK.SCHEDULING_UNAVAILABLE]: NEXT_ACTIONS.IUL_SCHEDULING_UNAVAILABLE
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
  if (
    (nextAsk === ASK.SCHEDULING_DAY_PART || nextAsk === ASK.MEETING_MODE) &&
    isDiscoveryComplete(merged)
  ) {
    return beginMeetingModeAsk(structured, context, {
      knownFacts: merged,
      reasonCodes: [...reasonCodes, REASON_CODES.IUL_DISCOVERY_COMPLETE],
      templateKey: "iul_scheduling_transition"
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

function iulMeetingTypeFromFacts(facts = {}) {
  return isIulInPersonMode(facts)
    ? IUL_REVIEW_MEETING_TYPE.IN_PERSON
    : IUL_REVIEW_MEETING_TYPE.ZOOM;
}

function hasSelectedIulSlot(context = {}) {
  const facts = context.knownFacts || {};
  const appointment = context.appointment || {};
  return Boolean(
    (facts.reviewProposedDate && facts.reviewProposedTime) ||
      (appointment.proposedDate && appointment.proposedTime)
  );
}

function resolveIulSchedulingResume(context = {}) {
  const facts = context.knownFacts || {};
  const lastAsk = context.conversation?.lastQuestionAsked;
  const offered = context.appointment?.previouslyOfferedSlots || [];
  if (lastAsk === ASK.CONFIRM_SLOT && hasSelectedIulSlot(context)) {
    return {
      ask: ASK.CONFIRM_SLOT,
      templateKey: "iul_confirm_review_deferred",
      nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT
    };
  }
  if (offered.length && (facts.iulDaypartSearchAttempted || facts.iulSelectedDayPart)) {
    return {
      ask: ASK.OFFER_SLOTS,
      templateKey: facts.iulDaypartFallbackAttempted
        ? "iul_offer_nearest_review_slots"
        : "iul_offer_review_slots",
      nextAction: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS
    };
  }
  if (facts.iulSchedulingUnavailable) {
    return {
      ask: ASK.SCHEDULING_UNAVAILABLE,
      templateKey: "iul_no_review_availability",
      nextAction: NEXT_ACTIONS.IUL_SCHEDULING_UNAVAILABLE
    };
  }
  if (facts.iulSelectedDayPart || lastAsk === ASK.SCHEDULING_DAY_PART) {
    return {
      ask: ASK.SCHEDULING_DAY_PART,
      templateKey: "iul_ask_scheduling_day_part",
      nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE
    };
  }
  if (facts.meetingMode) {
    return {
      ask: ASK.SCHEDULING_DAY_PART,
      templateKey: "iul_ask_scheduling_day_part",
      nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE
    };
  }
  return {
    ask: ASK.MEETING_MODE,
    templateKey: "iul_ask_meeting_mode",
    nextAction: NEXT_ACTIONS.IUL_ASK_MEETING_MODE
  };
}

function resumeIulAfterFaq(structured, context, { templateKey, reasonCodes }) {
  const resume = resolveIulSchedulingResume(context);
  if (resume.ask === ASK.OFFER_SLOTS) {
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      offeredSlots: context.appointment?.previouslyOfferedSlots || [],
      fallbackDayPart: context.knownFacts?.iulSelectedDayPart || null
    };
  }
  if (resume.ask === ASK.CONFIRM_SLOT) {
    const slot = resolveSelectedIulSlot(context, {});
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      slotLabel: slot ? formatIulSlotLine(slot, structured.preferredLanguage) : null,
      meetingMode: context.knownFacts?.meetingMode || "zoom"
    };
  }
  return finishIulDecision(structured, context, {
    templateKey,
    nextAction: NEXT_ACTIONS.IUL_ANSWER_THEN_REVIEW,
    lastQuestionAsked: resume.ask,
    reasonCodes
  });
}

function reofferExistingIulSlots(structured, context, shown, extras = {}) {
  const attached = attachIulSlotSelectionIds(shown);
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    offeredSlots: attached,
    includeMoreSlots: false
  };
  return finishIulDecision(structured, context, {
    templateKey: extras.templateKey || "iul_no_more_review_slots",
    nextAction: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS,
    lastQuestionAsked: ASK.OFFER_SLOTS,
    knownFacts: {
      iulIncludeMoreSlots: false,
      reviewMeetingType: iulMeetingTypeFromFacts(context.knownFacts),
      meetingMode: context.knownFacts?.meetingMode || "zoom"
    },
    reasonCodes: extras.reasonCodes || [REASON_CODES.IUL_MORE_SLOTS_EXHAUSTED],
    appointmentPatch: {
      previouslyOfferedSlots: attached,
      meetingType: iulMeetingTypeFromFacts(context.knownFacts)
    }
  });
}

function applySlotOfferDecision(structured, context, availability, extras = {}) {
  const priorShown = extras.rejectPriorShown
    ? context.appointment?.previouslyOfferedSlots || []
    : [];
  const rejectIds = extras.rejectPriorShown
    ? [
        ...new Set([
          ...(context.knownFacts?.iulShownSlotKeys || []),
          ...rejectIdsForShown(priorShown)
        ])
      ]
    : [];
  const offered = excludeRejectedSlots(
    availability?.offeredSlots ||
      availability?.nearestAlternatives ||
      availability?.alternatives ||
      [],
    rejectIds
  );
  const status =
    availability?.status ||
    availability?.readResult?.status ||
    null;
  const dayPart = extras.dayPart || context.knownFacts?.iulSelectedDayPart || null;
  const preferredWeekend = extras.preferredWeekend === true;
  const searchFacts = {
    iulSelectedDayPart: dayPart,
    reviewPreferredDayPart: dayPart,
    preferredDayPart: dayPart,
    preferredWeekend: preferredWeekend || context.knownFacts?.preferredWeekend || false,
    iulDaypartSearchAttempted: true,
    iulLastAvailabilityStatus: status || null,
    reviewMeetingType: context.knownFacts?.reviewMeetingType || IUL_REVIEW_MEETING_TYPE.ZOOM,
    meetingMode: context.knownFacts?.meetingMode || "zoom",
    iulWorkflowStage: IUL_STAGES.REVIEW_READY
  };
  if (extras.rejectPriorShown && !offered.length && priorShown.length) {
    return reofferExistingIulSlots(structured, context, priorShown);
  }
  if (status === READ_STATUS.AVAILABLE && offered.length > 0) {
    const isNearest = Boolean(availability?.alternativeToConstraint);
    const weekendFallback = availability?.fallbackKind === "WEEKEND_EMPTY_NEAREST";
    const pool = excludeRejectedSlots(collectIulSlotPool(availability, offered), rejectIds);
    const paged = extras.rejectPriorShown
      ? selectIulCrossDatePage(pool.length ? pool : offered, { maxCandidates: 2 })
      : offered;
    const presentation = extras.rejectPriorShown
      ? chooseIulSlotPresentation(paged)
      : chooseIulSlotPresentation(pool.length > 3 ? pool : offered);
    const shown = presentation.shown.length
      ? presentation.shown
      : attachIulSlotSelectionIds(paged.length ? paged : offered);
    const remainingAfter = excludeRejectedSlots(pool.length ? pool : offered, [
      ...rejectIds,
      ...rejectIdsForShown(shown)
    ]);
    const includeMore =
      presentation.mode === "button" && shown.length === 2 && remainingAfter.length > 0;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      offeredSlots: shown,
      includeMoreSlots: includeMore,
      slotA: shown[0]?.time || null,
      slotB: shown[1]?.time || null,
      nearestAlternatives: isNearest,
      fallbackDayPart: dayPart,
      dayPart
    };
    return finishIulDecision(structured, context, {
      templateKey: weekendFallback
        ? "iul_offer_weekend_fallback_slots"
        : isNearest
          ? "iul_offer_nearest_review_slots"
          : "iul_offer_review_slots",
      nextAction: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS,
      lastQuestionAsked: ASK.OFFER_SLOTS,
      knownFacts: {
        ...searchFacts,
        iulDaypartFallbackAttempted: isNearest,
        iulSchedulingUnavailable: false,
        iulSlotPool: pool,
        iulIncludeMoreSlots: includeMore,
        iulShownSlotKeys: [
          ...((context.knownFacts?.iulShownSlotKeys || []).concat(rejectIdsForShown(priorShown))),
          ...rejectIdsForShown(shown)
        ]
      },
      reasonCodes: [
        REASON_CODES.IUL_POLICY_REVIEW_SCHEDULING,
        REASON_CODES.AVAILABLE_SLOTS_OFFERED,
        REASON_CODES.IUL_SLOT_INTERACTIVE_OFFERED,
        ...(extras.rejectPriorShown ? [REASON_CODES.IUL_CROSS_DATE_PAGE] : []),
        ...(isNearest ? [REASON_CODES.IUL_DAYPART_FALLBACK_OFFERED] : [])
      ],
      appointmentPatch: {
        status: APPOINTMENT_STATUS.PROPOSED,
        previouslyOfferedSlots: shown,
        meetingType: iulMeetingTypeFromFacts({
          ...context.knownFacts,
          ...searchFacts
        })
      },
      iulWorkflowStage: IUL_STAGES.REVIEW_READY
    });
  }
  return finishIulDecision(structured, context, {
    templateKey: "iul_no_review_availability",
    nextAction: NEXT_ACTIONS.IUL_SCHEDULING_UNAVAILABLE,
    lastQuestionAsked: ASK.SCHEDULING_UNAVAILABLE,
    knownFacts: {
      ...searchFacts,
      iulDaypartFallbackAttempted: true,
      iulSchedulingUnavailable: true
    },
    reasonCodes: [
      REASON_CODES.ZERO_QUALIFYING_SLOTS,
      REASON_CODES.IUL_NO_AVAILABILITY,
      REASON_CODES.IUL_POLICY_REVIEW_SCHEDULING
    ]
  });
}

function beginMeetingModeAsk(structured, context, {
  knownFacts = {},
  reasonCodes = [],
  templateKey = "iul_scheduling_transition"
} = {}) {
  return finishIulDecision(structured, context, {
    templateKey,
    nextAction: NEXT_ACTIONS.IUL_ASK_MEETING_MODE,
    lastQuestionAsked: ASK.MEETING_MODE,
    knownFacts: {
      ...knownFacts,
      iulWorkflowStage: IUL_STAGES.REVIEW_READY
    },
    reasonCodes: [...reasonCodes, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK],
    iulWorkflowStage: IUL_STAGES.REVIEW_READY
  });
}

function beginDayPartAsk(structured, context, {
  knownFacts = {},
  reasonCodes = []
} = {}) {
  return finishIulDecision(structured, context, {
    templateKey: "iul_ask_scheduling_day_part",
    nextAction: NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE,
    lastQuestionAsked: ASK.SCHEDULING_DAY_PART,
    knownFacts: {
      ...knownFacts,
      iulWorkflowStage: IUL_STAGES.REVIEW_READY
    },
    reasonCodes,
    iulWorkflowStage: IUL_STAGES.REVIEW_READY
  });
}

function beginZoomTransition(structured, context, extras = {}) {
  return beginMeetingModeAsk(structured, context, extras);
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

function applyIulAdDecision({ structured, context, interpretation, availability = null } = {}) {
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
    INTENTS.IUL_CHOOSE_MEETING_MODE,
    INTENTS.IUL_SELECT_OFFERED_SLOT,
    INTENTS.IUL_REQUEST_MORE_SLOTS,
    INTENTS.IUL_STALE_SLOT_SELECTION,
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
    return resumeIulAfterFaq(structured, context, {
      templateKey: "iul_info_only_then_review",
      reasonCodes: [REASON_CODES.IUL_INFO_THEN_REVIEW, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }
  if (intent === INTENTS.IUL_NO_REPLACE) {
    return resumeIulAfterFaq(structured, context, {
      templateKey: "iul_no_replace_then_review",
      reasonCodes: [REASON_CODES.IUL_NO_OBLIGATION, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }
  if (intent === INTENTS.IUL_AGENT_SAID_INVESTMENT) {
    return resumeIulAfterFaq(structured, context, {
      templateKey: "iul_agent_investment_then_review",
      reasonCodes: [
        REASON_CODES.IUL_NOT_JUST_INVESTMENT,
        REASON_CODES.IUL_NO_AGENT_ARGUMENT,
        REASON_CODES.IUL_SOFT_APPOINTMENT_ASK
      ]
    });
  }
  if (intent === INTENTS.IUL_SEND_INFO_HERE) {
    return resumeIulAfterFaq(structured, context, {
      templateKey: "iul_send_info_then_review",
      reasonCodes: [
        REASON_CODES.IUL_WHATSAPP_BASICS_ONLY,
        REASON_CODES.IUL_SOFT_APPOINTMENT_ASK
      ]
    });
  }
  if (intent === INTENTS.IUL_PRIMERICA_QUESTION) {
    return resumeIulAfterFaq(structured, context, {
      templateKey: "iul_primerica_then_continue",
      reasonCodes: [REASON_CODES.IUL_PRIMERICA_TRANSPARENT, REASON_CODES.IUL_SOFT_APPOINTMENT_ASK]
    });
  }
  if (intent === INTENTS.IUL_REVIEW_COST_QUESTION) {
    return resumeIulAfterFaq(structured, context, {
      templateKey: "iul_review_cost_then_continue",
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

  if (intent === INTENTS.IUL_CHOOSE_MEETING_MODE) {
    const mode = interpretation.entities?.meetingMode === "in_person" ? "in_person" : "zoom";
    if (mode === "in_person" && !resolveIulOfficeLocation(context)) {
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        meetingMode: "zoom"
      };
      return finishIulDecision(structured, context, {
        templateKey: "iul_office_unavailable",
        nextAction: NEXT_ACTIONS.IUL_ASK_MEETING_MODE,
        lastQuestionAsked: ASK.MEETING_MODE,
        knownFacts: meetingModeFacts("zoom", context),
        reasonCodes: [REASON_CODES.IUL_OFFICE_UNAVAILABLE]
      });
    }
    const facts = meetingModeFacts(mode, context);
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ...facts
    };
    return beginDayPartAsk(structured, context, {
      knownFacts: facts,
      reasonCodes: [REASON_CODES.IUL_MEETING_MODE_CAPTURED]
    });
  }

  if (intent === INTENTS.IUL_CHOOSE_REVIEW_DAY_PART) {
    const dayPart = normalizeIulDayPart(
      interpretation.entities?.iulReviewDayPart ||
        interpretation.entities?.dayPart ||
        null
    );
    const preferredWeekend = Boolean(
      interpretation.entities?.preferredWeekend || context.knownFacts?.preferredWeekend
    );
    const priorDayPart = normalizeIulDayPart(context.knownFacts?.iulSelectedDayPart);
    const priorOffered = context.appointment?.previouslyOfferedSlots || [];
    if (
      dayPart &&
      dayPart === priorDayPart &&
      context.knownFacts?.iulDaypartSearchAttempted &&
      priorOffered.length
    ) {
      return applySlotOfferDecision(
        structured,
        context,
        {
          status: READ_STATUS.AVAILABLE,
          offeredSlots: priorOffered,
          alternativeToConstraint: Boolean(context.knownFacts?.iulDaypartFallbackAttempted)
        },
        { dayPart, preferredWeekend }
      );
    }
    if (
      dayPart &&
      dayPart === priorDayPart &&
      context.knownFacts?.iulSchedulingUnavailable
    ) {
      return applySlotOfferDecision(
        structured,
        context,
        { status: READ_STATUS.ZERO_SLOTS, offeredSlots: [], fallbackKind: "NO_AVAILABILITY" },
        { dayPart, preferredWeekend }
      );
    }
    const mergedFacts = {
      iulReviewDayPart: dayPart,
      reviewPreferredDayPart: dayPart,
      preferredDayPart: dayPart,
      preferredWeekend,
      reviewMeetingType: iulMeetingTypeFromFacts(context.knownFacts)
    };
    const schedulingContext = {
      ...context,
      knownFacts: { ...(context.knownFacts || {}), ...mergedFacts }
    };
    const liveAvailability = enrichIulDaypartAvailability(
      availability && availability.status
        ? availability
        : readPolicyReviewAvailabilitySync({
            context: schedulingContext,
            interpretation,
            options: {
              availabilityFixture: context._availabilityFixture,
              organizationId: context.organizationId || null,
              preferredWeekend,
              now: context._testNow || null
            }
          }),
      { preferredWeekend }
    );
    structured.customerReplyPlan.templateKey = "iul_review_day_part_ack";
    return applySlotOfferDecision(structured, schedulingContext, liveAvailability, {
      dayPart,
      preferredWeekend
    });
  }

  if (intent === INTENTS.IUL_REQUEST_MORE_SLOTS) {
    const shown = context.appointment?.previouslyOfferedSlots || [];
    const rejectIds = [
      ...new Set([
        ...(context.knownFacts?.iulShownSlotKeys || []),
        ...rejectIdsForShown(shown)
      ])
    ];
    const moreAvailability = readPolicyReviewAvailabilitySync({
      context,
      interpretation,
      options: {
        availabilityFixture: context._availabilityFixture,
        organizationId: context.organizationId || null,
        preferredWeekend: Boolean(context.knownFacts?.preferredWeekend),
        now: context._testNow || null,
        rejectIds,
        crossDatePage: true
      }
    });
    const moreOffered = excludeRejectedSlots(
      moreAvailability?.offeredSlots || moreAvailability?.nearestAlternatives || [],
      rejectIds
    );
    if (!moreOffered.length) {
      return reofferExistingIulSlots(structured, context, shown);
    }
    return applySlotOfferDecision(structured, context, moreAvailability, {
      dayPart: context.knownFacts?.iulSelectedDayPart,
      preferredWeekend: Boolean(context.knownFacts?.preferredWeekend),
      rejectPriorShown: true
    });
  }

  if (intent === INTENTS.IUL_STALE_SLOT_SELECTION) {
    const fresh = readPolicyReviewAvailabilitySync({
      context,
      interpretation,
      options: {
        availabilityFixture: context._availabilityFixture,
        organizationId: context.organizationId || null,
        preferredWeekend: Boolean(context.knownFacts?.preferredWeekend),
        now: context._testNow || null
      }
    });
    structured.reasonCodes.push(REASON_CODES.IUL_STALE_SLOT_REJECTED);
    return applySlotOfferDecision(structured, context, fresh, {
      dayPart: context.knownFacts?.iulSelectedDayPart,
      preferredWeekend: Boolean(context.knownFacts?.preferredWeekend)
    });
  }

  if (intent === INTENTS.IUL_SELECT_OFFERED_SLOT) {
    const slot = interpretation.entities?.selectedSlot || null;
    const offered = context.appointment?.previouslyOfferedSlots || [];
    const stillOffered =
      slot &&
      offered.some(
        (row) =>
          (row.selectionId && row.selectionId === slot.selectionId) ||
          (`${row.date || row.dateKey}|${row.time || row.timeKey}` ===
            `${slot.date || slot.dateKey}|${slot.time || slot.timeKey}`)
      );
    if (!slot || !stillOffered || isIulSlotExpired(slot, context._testNow)) {
      structured.reasonCodes.push(REASON_CODES.IUL_STALE_SLOT_REJECTED);
      const fresh = readPolicyReviewAvailabilitySync({
        context,
        interpretation,
        options: {
          availabilityFixture: context._availabilityFixture,
          organizationId: context.organizationId || null,
          preferredWeekend: Boolean(context.knownFacts?.preferredWeekend),
          now: context._testNow || null
        }
      });
      return applySlotOfferDecision(structured, context, fresh, {
        dayPart: context.knownFacts?.iulSelectedDayPart,
        preferredWeekend: Boolean(context.knownFacts?.preferredWeekend)
      });
    }
    seedIulCreateEntities(structured, slot);
    const selectedLabel = formatIulSlotLine(slot, structured.preferredLanguage);
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      slotLabel: selectedLabel,
      meetingMode: context.knownFacts?.meetingMode || "zoom"
    };
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
        reviewMeetingType:
          context.knownFacts?.reviewMeetingType || IUL_REVIEW_MEETING_TYPE.ZOOM,
        meetingMode: context.knownFacts?.meetingMode || "zoom",
        iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
      },
      reasonCodes: [
        REASON_CODES.IUL_POLICY_REVIEW_SCHEDULING,
        REASON_CODES.APPOINTMENT_CREATE_PROPOSED,
        REASON_CODES.IUL_SLOT_REVALIDATED
      ],
      appointmentPatch: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: slot?.date || slot?.dateKey || null,
        proposedTime: slot?.time || slot?.timeKey || null,
        meetingType: context.knownFacts?.reviewMeetingType || IUL_REVIEW_MEETING_TYPE.ZOOM,
        previouslyOfferedSlots: context.appointment?.previouslyOfferedSlots || []
      },
      iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
    });
  }

  if (intent === INTENTS.IUL_SCHEDULE_CONFIRM) {
    const slot = resolveSelectedIulSlot(context, interpretation);
    if (!slot || isIulSlotExpired(slot, context._testNow)) {
      if (context.appointment?.previouslyOfferedSlots?.length) {
        return reofferExistingIulSlots(structured, context, context.appointment.previouslyOfferedSlots, {
          templateKey: "iul_offer_review_slots",
          reasonCodes: []
        });
      }
      return finishIulDecision(structured, context, {
        templateKey: "iul_offer_review_slots",
        nextAction: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS,
        lastQuestionAsked: ASK.OFFER_SLOTS
      });
    }
    seedIulCreateEntities(structured, slot);
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      slotLabel: formatIulSlotLine(slot, structured.preferredLanguage),
      meetingMode: context.knownFacts?.meetingMode || "zoom"
    };
    return finishIulDecision(structured, context, {
      templateKey: "iul_confirm_review_deferred",
      nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT,
      lastQuestionAsked: ASK.CONFIRM_SLOT,
      mayCreateAppointment: true,
      knownFacts: {
        reviewProposedDate: slot.date || slot.dateKey || null,
        reviewProposedTime: slot.time || slot.timeKey || null,
        reviewMeetingType:
          context.knownFacts?.reviewMeetingType || IUL_REVIEW_MEETING_TYPE.ZOOM,
        meetingMode: context.knownFacts?.meetingMode || "zoom",
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
        meetingType: context.knownFacts?.reviewMeetingType || IUL_REVIEW_MEETING_TYPE.ZOOM
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
                    : pending === ASK.SCHEDULING_UNAVAILABLE
                      ? ASK.SCHEDULING_UNAVAILABLE
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
  looksLikePolicyIsBadQuestion,
  looksLikeWeekendPreference,
  parseIulReviewDayPart,
  normalizeIulDayPart,
  resolveIulOfficeLocation,
  meetingModeFacts,
  iulMeetingTypeFromFacts
};
