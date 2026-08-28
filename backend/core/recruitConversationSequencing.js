/**
 * Shared Recruit AI conversation sequencing (BR-131 thin first-turn + FAQ resume).
 * Used by legacy CE and Recruit AI v2 renderer paths for answer-first parity.
 * Copy-only / routing helpers — does not book or mutate workflow ownership.
 */

"use strict";

const { findFAQ } = require("./faqEngine");
const {
  getJobOverviewFaqAnswer,
  getJobOpportunityFaqAnswer,
  getExperienceFaqAnswer,
  getSalesObjectionFaqAnswer,
  getNetworkObjectionFaqAnswer,
  getLicenseRequirementFaqAnswer,
  getLicensePathDetailFaqAnswer,
  looksLikeLicensePathDetailQuestion,
  getInsuranceFaqAnswer,
  getCompensationFaqAnswer,
  getCanonicalFaqAnswer,
  getLegitimacyTrustFaqAnswer,
  getRecruitRoleObjectionFaqAnswer,
  getThinkAboutItClarifyQuestion
} = require("./teamVisionWorkflowCopy");
const { classifySalesObjectionKind } = require("./recruitAiV2/salesObjection");
const { looksLikeNetworkObjection } = require("./recruitAiV2/networkObjection");
const {
  looksLikeThinkAboutIt,
  looksLikeLegitimacyTrust,
  looksLikeDontWantToRecruit,
  looksLikeIsThisSales
} = require("./recruitAiV2/conversationObjections");
const {
  looksLikeJobOverviewQuestion
} = require("./recruitAiV2/conversationContinuity");

/**
 * Compose FAQ/answer + exactly one resume question (no robotic bridges).
 * Implements BR-131 / BR-105 — answer first, one useful question, no stack.
 */
function composeAnswerThenOneQuestion(answer, resumeQuestion) {
  const faq = String(answer || "").trim();
  const resume = String(resumeQuestion || "").trim();
  if (!faq) {
    return resume;
  }
  if (!resume) {
    return faq;
  }
  return `${faq} ${resume}`;
}

function normalizeFaqText(message) {
  return String(message || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Unified FAQ answer for CE ↔ V2 behavioral parity (content only).
 * Returns null when the message is not a supported FAQ/objection.
 */
function resolveRecruitFaqAnswer(message, language = "en") {
  const lang = language === "es" ? "es" : "en";
  const t = normalizeFaqText(message);
  if (!t) {
    return null;
  }

  if (looksLikeLicensePathDetailQuestion(message)) {
    return getLicensePathDetailFaqAnswer(lang);
  }

  if (
    /\b(need (a )?license|do i need (a )?license|licencia|necesito licencia|require.? license)\b/.test(
      t
    )
  ) {
    return getLicenseRequirementFaqAnswer(lang);
  }

  if (looksLikeThinkAboutIt(message)) {
    return getThinkAboutItClarifyQuestion(lang);
  }

  if (looksLikeLegitimacyTrust(message)) {
    return getLegitimacyTrustFaqAnswer(lang);
  }

  if (looksLikeDontWantToRecruit(message)) {
    return getRecruitRoleObjectionFaqAnswer(lang);
  }

  if (looksLikeNetworkObjection(message)) {
    return getNetworkObjectionFaqAnswer(lang);
  }

  if (looksLikeIsThisSales(message)) {
    return getSalesObjectionFaqAnswer(lang, "identity");
  }

  const salesKind = classifySalesObjectionKind(message);
  if (salesKind) {
    return getSalesObjectionFaqAnswer(lang, salesKind);
  }

  if (
    /\b(experiencia|experience|no experience|sin experiencia|need experience|necesito experiencia|i have no experience|no tengo experiencia)\b/.test(
      t
    ) &&
    /\b(need|necesito|require|required|sin|no |without|do i|have no|tengo)\b/.test(t)
  ) {
    return getExperienceFaqAnswer(lang);
  }

  if (looksLikeJobOverviewQuestion(message)) {
    return getJobOverviewFaqAnswer(lang);
  }

  if (
    /\b(is this (a )?job|what is the job|what.?s the job|que es el trabajo|qué es el trabajo|es un trabajo|empleo|oportunidad|what is this about|de que se trata|de qué se trata|de que trata)\b/.test(
      t
    )
  ) {
    // Concise overview for first-level asks; employment framing only when explicit "job/empleo".
    if (
      /\b(is this (a )?job|empleo asalariado|trabajo fijo|guaranteed (salary|job)|salaried)\b/.test(
        t
      )
    ) {
      return getJobOpportunityFaqAnswer(lang);
    }
    return getJobOverviewFaqAnswer(lang);
  }

  if (/\b(insurance|seguro|seguros)\b/.test(t)) {
    return getInsuranceFaqAnswer(lang);
  }

  if (
    /\b(pay|pago|pagan|salario|sueldo|comision|comisión|compensat|earn|gananc)\b/.test(
      t
    )
  ) {
    return getCompensationFaqAnswer(lang, "general");
  }

  const fromCatalog = findFAQ(message, lang);
  if (fromCatalog) {
    return fromCatalog;
  }

  if (
    /\b(about|trata|oportunidad)\b/.test(t) &&
    /\b(what|que|qué|de)\b/.test(t)
  ) {
    return getCanonicalFaqAnswer(lang);
  }

  return null;
}

/**
 * BR-131 FAQ resume guard — pick the resume template from known facts.
 * Never regress to location when city+state are present.
 */
function resolveFaqResumeTemplateKeyFromFacts(facts = {}) {
  const city = facts.city || null;
  const state = facts.state || facts.proposedState || null;
  const cityOk =
    Boolean(city) &&
    (facts.cityCertainty == null ||
      facts.cityCertainty === "confirmed" ||
      facts.cityCertainty === "partial");
  const stateOk =
    Boolean(state) &&
    (facts.stateCertainty == null ||
      facts.stateCertainty === "confirmed" ||
      Boolean(facts.state));

  const authKnown =
    facts.workAuthorization === true ||
    facts.workAuthorization === false ||
    facts.authorization === true ||
    facts.authorization === false ||
    String(facts.workAuthorizationStatus || "").toLowerCase() === "authorized" ||
    String(facts.workAuthorizationStatus || "").toLowerCase() === "not_authorized";

  const dayPart = String(
    facts.preferredDayPart || facts.dayPart || ""
  ).toLowerCase();
  const dayPartKnown =
    dayPart === "morning" || dayPart === "afternoon" || dayPart === "evening";

  if (!cityOk || (!city && !stateOk)) {
    if (city && !stateOk) {
      return {
        templateKey: facts.proposedState
          ? "confirm_location_proposal"
          : "ask_state",
        lastQuestionAsked: facts.proposedState ? "confirm_location" : "ask_state"
      };
    }
    return {
      templateKey: "greeting_ask_location",
      lastQuestionAsked: "ask_location"
    };
  }

  if (cityOk && !stateOk) {
    return {
      templateKey: facts.proposedState
        ? "confirm_location_proposal"
        : "ask_state",
      lastQuestionAsked: facts.proposedState ? "confirm_location" : "ask_state"
    };
  }

  if (!authKnown) {
    return {
      templateKey: "continue_qualification_after_location",
      lastQuestionAsked: "ask_authorization"
    };
  }

  if (dayPartKnown) {
    if (dayPart === "morning") {
      return {
        templateKey: "acknowledge_morning_ask_time",
        lastQuestionAsked: "ask_time_preference",
        entities: { dayPart: "morning" }
      };
    }
    return {
      templateKey: "acknowledge_afternoon_ask_time",
      lastQuestionAsked: "ask_time_preference",
      entities: {
        dayPart: dayPart === "evening" ? "evening" : "afternoon"
      }
    };
  }

  return {
    templateKey: "continue_qualification_after_authorization",
    lastQuestionAsked: "ask_day_part"
  };
}

/** Implements BR-164 — lastQuestionAsked must never outrank newer persisted facts. */
const LAST_QUESTION_RANK = Object.freeze({
  ask_location: 0,
  greeting_ask_location: 0,
  ask_city: 0,
  ask_state: 0,
  confirm_location: 0,
  ask_authorization: 1,
  continue_qualification_after_location: 1,
  ask_day_part: 2,
  ask_day_part_simple: 2,
  continue_qualification_after_authorization: 2,
  ask_time_preference: 3,
  ask_time_after_day_part: 3,
  ask_time_after_constraint: 3,
  acknowledge_morning_ask_time: 3,
  acknowledge_afternoon_ask_time: 3,
  explain_pending_time: 3,
  offer_time_choices: 4,
  confirm_slot: 4,
  awaiting_availability: 4,
  clarify_license_type: 99
});

function lastQuestionRank(key) {
  return LAST_QUESTION_RANK[String(key || "")] ?? 0;
}

function factsAheadOfLastQuestion(lastQuestionAsked, factResume) {
  if (!factResume) {
    return false;
  }
  const lastQ = String(lastQuestionAsked || "");
  if (lastQ === "clarify_license_type") {
    return false;
  }
  const factRank = Math.max(
    lastQuestionRank(factResume.lastQuestionAsked),
    lastQuestionRank(factResume.templateKey)
  );
  return factRank > lastQuestionRank(lastQ);
}

module.exports = {
  composeAnswerThenOneQuestion,
  resolveRecruitFaqAnswer,
  resolveFaqResumeTemplateKeyFromFacts,
  lastQuestionRank,
  factsAheadOfLastQuestion
};
