/**
 * Recruit AI v2 — fact certainty merge (CONFIRMED > INFERRED > UNKNOWN).
 * Prevents low-confidence extractions from overwriting confirmed canonical facts.
 */

const { FACT_CERTAINTY } = require("./locationFacts");

const CERTAINTY_RANK = Object.freeze({
  [FACT_CERTAINTY.CONFIRMED]: 3,
  [FACT_CERTAINTY.PROPOSED]: 2,
  [FACT_CERTAINTY.PARTIAL]: 1,
  [FACT_CERTAINTY.UNKNOWN]: 0,
  unknown: 0,
  confirmed: 3,
  proposed: 2,
  partial: 1
});

const FACT_SYNC_DIAGNOSTICS = Object.freeze({
  EXTRACTED: "fact_extracted",
  PERSISTED: "fact_persisted",
  REJECTED_LOW_CONFIDENCE: "fact_rejected_low_confidence",
  OVERWRITE_BLOCKED: "fact_overwrite_blocked",
  SYNC_FAILED: "fact_sync_failed"
});

function certaintyRank(value) {
  return CERTAINTY_RANK[String(value || "").toLowerCase()] ?? 0;
}

function isConfirmedLocationFacts(facts = {}) {
  return (
    Boolean(facts.city && facts.state) &&
    certaintyRank(facts.cityCertainty) >= certaintyRank(FACT_CERTAINTY.CONFIRMED) &&
    certaintyRank(facts.stateCertainty) >= certaintyRank(FACT_CERTAINTY.CONFIRMED)
  );
}

function shouldBlockLocationOverwrite(existingFacts = {}, interpretation = {}) {
  if (!isConfirmedLocationFacts(existingFacts)) {
    return false;
  }
  if (interpretation.intent === "correct_location") {
    return false;
  }
  if (interpretation.intent !== "provide_location") {
    return false;
  }
  const incomingCity = interpretation.entities?.city || null;
  const incomingState = interpretation.entities?.state || null;
  if (interpretation.entities?.completeness !== "complete" || !incomingCity || !incomingState) {
    return true;
  }
  const sameCity =
    String(existingFacts.city || "").toLowerCase() === String(incomingCity).toLowerCase();
  const sameState =
    String(existingFacts.state || "").toUpperCase() === String(incomingState).toUpperCase();
  return !(sameCity && sameState);
}

function shouldCorrectLegacyLocation(legacyCity, legacyState, durableCity, durableState) {
  if (!durableCity || !durableState) {
    return false;
  }
  if (!legacyCity && !legacyState) {
    return false;
  }
  const legacyMatches =
    String(legacyCity || "").toLowerCase() === String(durableCity).toLowerCase() &&
    String(legacyState || "").toUpperCase() === String(durableState).toUpperCase();
  if (legacyMatches) {
    return false;
  }
  if (durableState === "FL" && legacyState === "ME") {
    return true;
  }
  return Boolean(durableCity && durableState);
}

module.exports = {
  FACT_SYNC_DIAGNOSTICS,
  certaintyRank,
  isConfirmedLocationFacts,
  shouldBlockLocationOverwrite,
  shouldCorrectLegacyLocation
};
