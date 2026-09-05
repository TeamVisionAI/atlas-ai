/**
 * BR-236 — Recruit V2 location resolution observability (measurement only).
 * Resolution (BR-233 / BR-235) and coverage (BR-226) are separate fields.
 * Does not change parse, coverage, IUL, or customer-visible replies.
 */

"use strict";

const { emitRecruitAiV2Signal, EVENTS } = require("./stage1Observability");
const {
  normalizeCityLookupKey,
  resolveCanonicalCityKey,
  isHighConfidenceFloridaCity,
  AMBIGUOUS_US_CITIES,
  extractLocationCandidateText,
  normalizeStateToken,
  isNonLocationPhrase,
  looksLikeLanguageOrIdentitySelfDescription,
  parseLocationAnswer
} = require("./locationFacts");
const { RESOLUTION_SOURCE } = require("../usLocalityResolver");

const RESOLUTION_OUTCOME = Object.freeze({
  GAZETTEER_COMPLETE: "GAZETTEER_COMPLETE",
  ZIP_VALIDATED_COMPLETE: "ZIP_VALIDATED_COMPLETE",
  ZIP_CONFLICT_CLARIFY: "ZIP_CONFLICT_CLARIFY",
  AMBIGUOUS_CITY_CLARIFY: "AMBIGUOUS_CITY_CLARIFY",
  FL_OVERLAY_COMPLETE: "FL_OVERLAY_COMPLETE",
  CATALOG_ALIAS_COMPLETE: "CATALOG_ALIAS_COMPLETE",
  LEGACY_HEURISTIC_COMPLETE: "LEGACY_HEURISTIC_COMPLETE",
  NATIONAL_RESOLVER_NO_MATCH: "NATIONAL_RESOLVER_NO_MATCH",
  NON_US_OR_UNKNOWN: "NON_US_OR_UNKNOWN",
  SEMANTIC_GUARD_SKIPPED: "SEMANTIC_GUARD_SKIPPED",
  PARTIAL_LOCATION: "PARTIAL_LOCATION",
  STATE_ONLY: "STATE_ONLY"
});

const COVERAGE_OUTCOME = Object.freeze({
  LOCAL: "COVERAGE_LOCAL",
  OUTSIDE: "COVERAGE_OUTSIDE"
});

const EVENT_NAME = EVENTS.LOCATION_RESOLUTION || "recruit_ai_v2.location.resolution";

let emitImpl = emitRecruitAiV2Signal;

function setLocationResolutionEmitForTests(fn) {
  emitImpl = typeof fn === "function" ? fn : emitRecruitAiV2Signal;
}

function resetLocationResolutionEmitForTests() {
  emitImpl = emitRecruitAiV2Signal;
}

function foldSafe(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeStreetOrSensitive(text) {
  const raw = String(text || "");
  return /\d/.test(raw) || raw.length > 48;
}

function candidateText(rawText) {
  if (!rawText) {
    return "";
  }
  const extracted = extractLocationCandidateText(rawText);
  return String(extracted?.text || rawText).trim();
}

function usedCatalogFallback(rawText, city) {
  const source = candidateText(rawText);
  if (!source || looksLikeStreetOrSensitive(source)) {
    const resolved = resolveCanonicalCityKey(city);
    return Boolean(resolved && resolved !== foldSafe(city));
  }
  const folded = foldSafe(source.replace(/\b(fl|florida|tx|texas|ga|georgia|nc|il|ny)\b/gi, "").trim());
  if (!folded) {
    return false;
  }
  const aliased = normalizeCityLookupKey(folded);
  const canonical = resolveCanonicalCityKey(folded);
  return Boolean((aliased && aliased !== folded) || (canonical && canonical !== folded && canonical !== aliased));
}

function textLooksLikeSemanticGuard(source) {
  const folded = foldSafe(source);
  if (!folded) {
    return false;
  }
  if (isNonLocationPhrase(folded) || looksLikeLanguageOrIdentitySelfDescription(source)) {
    return true;
  }
  if (
    /\b(empresa|compania|companias|informacion|detalles|licen[cs]ia|license|permiso|experiencia|salario|sueldo|bilingue|bilingual|posiciones|positions|disponible|available|vacante|vacancy)\b/.test(
      folded
    )
  ) {
    return true;
  }
  if (
    /^(tarde|manana|morning|afternoon|evening|noche)(\s+(mejor|better))?$/.test(folded) ||
    /^(para\s+)?(manana|hoy|tomorrow|today)$/.test(folded)
  ) {
    return true;
  }
  return false;
}

function isSemanticGuardSkip(rawText) {
  const original = String(rawText || "");
  if (textLooksLikeSemanticGuard(original)) {
    return true;
  }
  const extracted = candidateText(rawText);
  return Boolean(extracted && extracted !== original && textLooksLikeSemanticGuard(extracted));
}

function isNonUsPartial(parsed) {
  if (!parsed?.city || parsed.state) {
    return false;
  }
  const words = String(parsed.city).trim().split(/\s+/);
  if (words.length < 2) {
    return false;
  }
  const last = words[words.length - 1];
  return !normalizeStateToken(last);
}

/**
 * Classify a parse result. Does not mutate parse or coverage.
 */
function classifyLocationResolution({ parsed = null, rawText = null } = {}) {
  if (!parsed) {
    if (rawText && isSemanticGuardSkip(rawText)) {
      return {
        resolutionOutcome: RESOLUTION_OUTCOME.SEMANTIC_GUARD_SKIPPED,
        parserPath: "semantic_guard",
        nationalResolverMatched: false,
        fallbackUsed: false,
        skipped: true
      };
    }
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.NATIONAL_RESOLVER_NO_MATCH,
      parserPath: "none",
      nationalResolverMatched: false,
      fallbackUsed: false,
      skipped: false
    };
  }

  const source = String(parsed.resolutionSource || "");
  const complete = parsed.completeness === "complete";
  const zipPresent = Boolean(parsed.zip);
  const national =
    source === RESOLUTION_SOURCE.GAZETTEER || source === RESOLUTION_SOURCE.ZIP_CROSSWALK;
  const alias = usedCatalogFallback(rawText, parsed.city);

  if (parsed.requiresClarification && zipPresent && national) {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.ZIP_CONFLICT_CLARIFY,
      parserPath: "national",
      nationalResolverMatched: true,
      fallbackUsed: false,
      skipped: false
    };
  }

  if (complete && source === RESOLUTION_SOURCE.ZIP_CROSSWALK) {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.ZIP_VALIDATED_COMPLETE,
      parserPath: "national",
      nationalResolverMatched: true,
      fallbackUsed: false,
      skipped: false
    };
  }

  if (complete && source === RESOLUTION_SOURCE.GAZETTEER) {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.GAZETTEER_COMPLETE,
      parserPath: "national",
      nationalResolverMatched: true,
      fallbackUsed: false,
      skipped: false
    };
  }

  if (
    parsed.city &&
    !parsed.state &&
    AMBIGUOUS_US_CITIES.has(normalizeCityLookupKey(parsed.city))
  ) {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.AMBIGUOUS_CITY_CLARIFY,
      parserPath: "catalog_ambiguous",
      nationalResolverMatched: false,
      fallbackUsed: false,
      skipped: false
    };
  }

  if (complete && alias) {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.CATALOG_ALIAS_COMPLETE,
      parserPath: "catalog_alias",
      nationalResolverMatched: false,
      fallbackUsed: true,
      skipped: false
    };
  }

  if (complete && !national && isHighConfidenceFloridaCity(parsed.city) && parsed.state === "FL") {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.FL_OVERLAY_COMPLETE,
      parserPath: "fl_overlay",
      nationalResolverMatched: false,
      fallbackUsed: true,
      skipped: false
    };
  }

  if (complete && !national) {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.LEGACY_HEURISTIC_COMPLETE,
      parserPath: "heuristic",
      nationalResolverMatched: false,
      fallbackUsed: true,
      skipped: false
    };
  }

  if (parsed.completeness === "state_only") {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.STATE_ONLY,
      parserPath: "state_only",
      nationalResolverMatched: false,
      fallbackUsed: false,
      skipped: false
    };
  }

  if (isNonUsPartial(parsed) || (parsed.completeness !== "complete" && !parsed.city && !parsed.state)) {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.NON_US_OR_UNKNOWN,
      parserPath: "non_us",
      nationalResolverMatched: false,
      fallbackUsed: false,
      skipped: false
    };
  }

  if (parsed.completeness === "partial") {
    return {
      resolutionOutcome: RESOLUTION_OUTCOME.PARTIAL_LOCATION,
      parserPath: "partial",
      nationalResolverMatched: national,
      fallbackUsed: !national,
      skipped: false
    };
  }

  return {
    resolutionOutcome: RESOLUTION_OUTCOME.NATIONAL_RESOLVER_NO_MATCH,
    parserPath: "none",
    nationalResolverMatched: false,
    fallbackUsed: false,
    skipped: false
  };
}

function safePhraseKey(parsed) {
  if (!parsed?.city || parsed.completeness === "complete") {
    return null;
  }
  const city = String(parsed.city);
  if (looksLikeStreetOrSensitive(city)) {
    return null;
  }
  const words = city.trim().split(/\s+/);
  if (words.length > 4) {
    return null;
  }
  return foldSafe(city);
}

function mapCoverageField(coverage) {
  if (coverage === "LOCAL") {
    return COVERAGE_OUTCOME.LOCAL;
  }
  if (coverage === "OUTSIDE") {
    return COVERAGE_OUTCOME.OUTSIDE;
  }
  return null;
}

function isIulContext(context) {
  const facts = context?.knownFacts || {};
  return Boolean(
    facts.iulQualificationStatus ||
      facts.iulReviewIntent ||
      facts.policyType === "IUL" ||
      context?.campaignIntakePurpose === "IUL"
  );
}

function shouldEmitForInterpretation(interpretation) {
  const intent = interpretation?.intent;
  return intent === "provide_location" || intent === "correct_location";
}

function buildLocationResolutionEvent({
  organizationId = null,
  prospectId = null,
  conversationId = null,
  parsed = null,
  rawText = null,
  coverage = null,
  classification = null
} = {}) {
  const classified = classification || classifyLocationResolution({ parsed, rawText });
  if (classified.skipped) {
    return null;
  }

  return {
    event: EVENT_NAME,
    organizationId: organizationId || null,
    prospectId: prospectId || null,
    conversationId: conversationId || null,
    resolutionSource: parsed?.resolutionSource || null,
    confidence: parsed?.confidence || parsed?.resolutionConfidence || null,
    completeness: parsed?.completeness || null,
    requiresClarification: Boolean(parsed?.requiresClarification),
    city: parsed?.city || null,
    state: parsed?.state || null,
    zipPresent: Boolean(parsed?.zip),
    zipValidated: String(parsed?.resolutionSource || "") === RESOLUTION_SOURCE.ZIP_CROSSWALK,
    nationalResolverMatched: classified.nationalResolverMatched,
    fallbackUsed: classified.fallbackUsed,
    coverageResult: mapCoverageField(coverage),
    parserPath: classified.parserPath,
    reason: classified.resolutionOutcome,
    unresolvedPhraseKey: safePhraseKey(parsed)
  };
}

function emitLocationResolutionObservation(payload = {}, opts = {}) {
  try {
    if (isIulContext(payload.context)) {
      return false;
    }
    const event = buildLocationResolutionEvent(payload);
    if (!event) {
      return false;
    }
    return emitImpl(EVENT_NAME, event, opts);
  } catch {
    return false;
  }
}

function parsedFromInterpretation(interpretation) {
  const entities = interpretation?.entities || {};
  return {
    city: entities.city || null,
    state: entities.state || null,
    completeness: entities.completeness || null,
    requiresClarification: Boolean(entities.requiresClarification),
    resolutionSource: entities.resolutionSource || null,
    confidence: entities.resolutionConfidence || entities.confidence || null,
    zip: entities.zip || null,
    proposedState: entities.proposedState || null
  };
}

function parsedForObservation(interpretation) {
  const rawText = interpretation?.normalization?.trimmedText || null;
  const fromEntities = parsedFromInterpretation(interpretation);
  if (!rawText) {
    return fromEntities;
  }
  try {
    const fromParser = parseLocationAnswer(rawText);
    if (fromParser) {
      return fromParser;
    }
  } catch {
    // BR-236 — fall back to interpreter entities; never throw.
  }
  return fromEntities;
}

function coverageForObservation(parsed, structured) {
  if (!parsed || parsed.completeness !== "complete" || parsed.requiresClarification) {
    return null;
  }
  return (
    structured?.contextPatch?.knownFacts?.coverage ||
    structured?.customerReplyPlan?.entities?.coverage ||
    null
  );
}

function emitLocationResolutionFromDecision(context, interpretation, structured, opts = {}) {
  try {
    if (!shouldEmitForInterpretation(interpretation)) {
      return false;
    }
    const parsed = parsedForObservation(interpretation);
    return emitLocationResolutionObservation(
      {
        context,
        organizationId: context?.organizationId || null,
        prospectId: context?.prospectId || null,
        conversationId: context?.conversation?.id || null,
        parsed,
        rawText: interpretation?.normalization?.trimmedText || null,
        coverage: coverageForObservation(parsed, structured)
      },
      opts
    );
  } catch {
    return false;
  }
}

module.exports = {
  RESOLUTION_OUTCOME,
  COVERAGE_OUTCOME,
  EVENT_NAME,
  classifyLocationResolution,
  buildLocationResolutionEvent,
  emitLocationResolutionObservation,
  emitLocationResolutionFromDecision,
  isSemanticGuardSkip,
  setLocationResolutionEmitForTests,
  resetLocationResolutionEmitForTests
};
