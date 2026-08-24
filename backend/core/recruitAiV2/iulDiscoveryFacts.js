/**
 * IUL Policy Review V1 — discovery fact classifiers (A, B, D, E, F).
 */

"use strict";

const POLICY_TYPE = Object.freeze({
  IUL: "IUL",
  OTHER_LIFE: "OTHER_LIFE",
  UNSURE: "UNSURE"
});

const POLICY_AGE_RANGE = Object.freeze({
  LESS_THAN_1_YEAR: "LESS_THAN_1_YEAR",
  ONE_TO_THREE_YEARS: "ONE_TO_THREE_YEARS",
  THREE_TO_FIVE_YEARS: "THREE_TO_FIVE_YEARS",
  FIVE_PLUS_YEARS: "FIVE_PLUS_YEARS",
  UNSURE: "UNSURE"
});

const REVIEW_REASON = Object.freeze({
  PREMIUM_COST: "PREMIUM_COST",
  CASH_VALUE: "CASH_VALUE",
  PERFORMANCE: "PERFORMANCE",
  UNDERSTANDING_POLICY: "UNDERSTANDING_POLICY",
  CONSIDERING_CANCEL: "CONSIDERING_CANCEL",
  CONSIDERING_REPLACEMENT: "CONSIDERING_REPLACEMENT",
  SECOND_OPINION: "SECOND_OPINION",
  OTHER: "OTHER"
});

const DOCUMENTS_AVAILABLE = Object.freeze({
  YES: "YES",
  NO: "NO",
  UNSURE: "UNSURE"
});

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulRaw(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  return raw.slice(0, 280);
}

function looksLikeUnknown(text) {
  const t = fold(text);
  return (
    !t ||
    /^(no se|nose|no lo se|no estoy seguro|no estoy segura|no tengo idea|unsure|not sure|i don'?t know|idk|no idea|no lo tengo|no tengo)$/.test(
      t
    ) ||
    /\bno (lo )?se\b/.test(t) ||
    /\bno estoy segur[oa]\b/.test(t) ||
    /\bnot sure\b/.test(t) ||
    /\bi don'?t know\b/.test(t) ||
    /\bno (la )?tengo\b/.test(t)
  );
}

function classifyPolicyType(text) {
  const t = fold(text);
  const raw = usefulRaw(text);
  if (!t || /^(hola|hello|hi|hey|thanks|gracias|buenas)$/i.test(t)) {
    return { value: null, raw: null };
  }
  if (looksLikeUnknown(text)) {
    return { value: POLICY_TYPE.UNSURE, raw };
  }
  if (
    /\biul\b/.test(t) ||
    /\bindexed universal\b/.test(t) ||
    /\bpoliza iul\b/.test(t) ||
    /\buniversal indexad/.test(t)
  ) {
    return { value: POLICY_TYPE.IUL, raw };
  }
  if (
    /\b(term|whole|vida entera|temporal|seguro de vida|life insurance|otra poliza|other life|otro seguro)\b/.test(
      t
    )
  ) {
    return { value: POLICY_TYPE.OTHER_LIFE, raw };
  }
  if (/\bseguro\b/.test(t) || /\bpolicy\b/.test(t) || /\bpoliza\b/.test(t)) {
    return { value: POLICY_TYPE.IUL, raw };
  }
  return { value: POLICY_TYPE.UNSURE, raw };
}

function classifyCarrier(text) {
  const t = fold(text);
  const raw = usefulRaw(text);
  if (!t) {
    return { carrier: null, carrierRaw: null, resolved: false };
  }
  if (looksLikeUnknown(text)) {
    return { carrier: null, carrierRaw: raw, resolved: true };
  }
  const known = [
    { pattern: /\bprimerica\b/, name: "Primerica" },
    { pattern: /\bnationwide\b/, name: "Nationwide" },
    { pattern: /\btransamerica\b/, name: "Transamerica" },
    { pattern: /\blincoln\b/, name: "Lincoln" },
    { pattern: /\bprotective\b/, name: "Protective" },
    { pattern: /\bforesters\b/, name: "Foresters" },
    { pattern: /\bameritas\b/, name: "Ameritas" },
    { pattern: /\bstate farm\b/, name: "State Farm" },
    { pattern: /\bnorthwestern mutual\b/, name: "Northwestern Mutual" }
  ];
  for (const entry of known) {
    if (entry.pattern.test(t)) {
      return { carrier: entry.name, carrierRaw: raw, resolved: true };
    }
  }
  if (t.length >= 2 && t.length <= 80) {
    const cleaned = String(text || "")
      .trim()
      .replace(/\s+/g, " ");
    return { carrier: cleaned, carrierRaw: raw || cleaned, resolved: true };
  }
  return { carrier: null, carrierRaw: raw, resolved: true };
}

function classifyPolicyAgeRange(text) {
  const t = fold(text);
  const raw = usefulRaw(text);
  if (!t || looksLikeUnknown(text)) {
    return { value: POLICY_AGE_RANGE.UNSURE, raw };
  }
  if (
    /\b(menos de un ano|menos de 1|recien|reciente|just bought|less than a year|under a year|hace poco)\b/.test(
      t
    )
  ) {
    return { value: POLICY_AGE_RANGE.LESS_THAN_1_YEAR, raw };
  }
  if (
    /\b(uno a tres|1 a 3|one to three|1-3|dos anos|tres anos|2 years|3 years)\b/.test(
      t
    )
  ) {
    return { value: POLICY_AGE_RANGE.ONE_TO_THREE_YEARS, raw };
  }
  if (
    /\b(tres a cinco|3 a 5|three to five|3-5|cuatro anos|4 years|5 years|cinco anos)\b/.test(
      t
    )
  ) {
    return { value: POLICY_AGE_RANGE.THREE_TO_FIVE_YEARS, raw };
  }
  if (
    /\b(mas de cinco|más de cinco|over five|5\+|6 anos|7 anos|10 anos|many years|hace mucho)\b/.test(
      t
    )
  ) {
    return { value: POLICY_AGE_RANGE.FIVE_PLUS_YEARS, raw };
  }
  const yearsMatch = t.match(/\b(\d{1,2})\s*(anos|years)\b/);
  if (yearsMatch) {
    const years = Number(yearsMatch[1]);
    if (years < 1) {
      return { value: POLICY_AGE_RANGE.LESS_THAN_1_YEAR, raw };
    }
    if (years <= 3) {
      return { value: POLICY_AGE_RANGE.ONE_TO_THREE_YEARS, raw };
    }
    if (years <= 5) {
      return { value: POLICY_AGE_RANGE.THREE_TO_FIVE_YEARS, raw };
    }
    return { value: POLICY_AGE_RANGE.FIVE_PLUS_YEARS, raw };
  }
  return { value: POLICY_AGE_RANGE.UNSURE, raw };
}

function classifyReviewReason(text) {
  const t = fold(text);
  const raw = usefulRaw(text);
  if (!t) {
    return { value: null, raw: null };
  }
  if (/\b(costo|costos|prima|premium|caro|expensive|fees?)\b/.test(t)) {
    return { value: REVIEW_REASON.PREMIUM_COST, raw };
  }
  if (
    /\b(valor acumulado|cash value|creciendo|crecimiento|accumulation)\b/.test(t)
  ) {
    return { value: REVIEW_REASON.CASH_VALUE, raw };
  }
  if (
    /\b(rendimiento|performance|como va|how it'?s doing|proyeccion|projection)\b/.test(
      t
    )
  ) {
    return { value: REVIEW_REASON.PERFORMANCE, raw };
  }
  if (
    /\b(entender|understand|explicar|explain|no entiendo|confuso|confused)\b/.test(
      t
    )
  ) {
    return { value: REVIEW_REASON.UNDERSTANDING_POLICY, raw };
  }
  if (/\b(cancelar|cancel|terminar|surrender)\b/.test(t)) {
    return { value: REVIEW_REASON.CONSIDERING_CANCEL, raw };
  }
  if (/\b(reemplazar|replace|cambiar la poliza|switch policy)\b/.test(t)) {
    return { value: REVIEW_REASON.CONSIDERING_REPLACEMENT, raw };
  }
  if (
    /\b(segunda opinion|second opinion|otra opinion|another look|revisarla)\b/.test(
      t
    )
  ) {
    return { value: REVIEW_REASON.SECOND_OPINION, raw };
  }
  if (t.length >= 8) {
    return { value: REVIEW_REASON.OTHER, raw: raw || t.slice(0, 280) };
  }
  return { value: REVIEW_REASON.OTHER, raw };
}

function classifyDocumentsAvailable(text) {
  const t = fold(text);
  const raw = usefulRaw(text);
  if (!t) {
    return { value: null, raw: null };
  }
  if (looksLikeUnknown(text)) {
    return { value: DOCUMENTS_AVAILABLE.UNSURE, raw };
  }
  if (
    /^(si|yes|yep|claro|tengo|la tengo|i do|i have)$/.test(t) ||
    /\b(si|yes),?\s*(la )?tengo\b/.test(t) ||
    /\btengo (la )?(ilustracion|estado|resumen|documento|policy)\b/.test(t) ||
    /\bi have (the )?(illustration|statement|summary|document)\b/.test(t)
  ) {
    return { value: DOCUMENTS_AVAILABLE.YES, raw };
  }
  if (
    /^(no|nope)$/.test(t) ||
    /\bno (la )?tengo\b/.test(t) ||
    /\bno tengo\b/.test(t) ||
    /\bi don'?t have\b/.test(t)
  ) {
    return { value: DOCUMENTS_AVAILABLE.NO, raw };
  }
  return { value: DOCUMENTS_AVAILABLE.UNSURE, raw };
}

function looksLikePolicyIsBadQuestion(text) {
  const t = fold(text);
  return (
    /\b(mi poliza|my policy)\b.*\b(mala|bad|estafa|scam|worth it|vale la pena)\b/.test(
      t
    ) ||
    /\b(es|esta)\b.*\b(mala poliza|bad policy)\b/.test(t) ||
    /\bshould i cancel\b/.test(t)
  );
}

function isDiscoveryComplete(knownFacts = {}) {
  return Boolean(
    knownFacts.policyType &&
      knownFacts.carrierResolved &&
      (knownFacts.originalPurposeAsked ||
        knownFacts.originalPolicyPurpose != null ||
        knownFacts.originalPolicyPurposeRaw) &&
      knownFacts.policyAgeRange &&
      knownFacts.reviewReason &&
      knownFacts.documentsAvailable
  );
}

module.exports = {
  POLICY_TYPE,
  POLICY_AGE_RANGE,
  REVIEW_REASON,
  DOCUMENTS_AVAILABLE,
  classifyPolicyType,
  classifyCarrier,
  classifyPolicyAgeRange,
  classifyReviewReason,
  classifyDocumentsAvailable,
  looksLikePolicyIsBadQuestion,
  isDiscoveryComplete
};
