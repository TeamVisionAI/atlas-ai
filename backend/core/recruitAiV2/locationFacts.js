/**
 * Recruit AI v2 — partial location recognition (BR-082).
 * City-only answers are partial facts. Likely state is proposed, never confirmed.
 */

const FACT_CERTAINTY = Object.freeze({
  CONFIRMED: "confirmed",
  PROPOSED: "proposed",
  PARTIAL: "partial",
  UNKNOWN: "unknown"
});

/** Deterministic city → likely state proposals (not confirmed facts). */
const CITY_TO_PROPOSED_STATE = Object.freeze({
  tampa: "FL",
  miami: "FL",
  orlando: "FL",
  doral: "FL",
  jacksonville: "FL",
  "fort lauderdale": "FL",
  hialeah: "FL",
  atlanta: "GA",
  houston: "TX",
  dallas: "TX",
  austin: "TX",
  phoenix: "AZ",
  charlotte: "NC",
  "new york": "NY",
  brooklyn: "NY",
  chicago: "IL",
  "los angeles": "CA",
  "san diego": "CA"
});

const STATE_NAMES = Object.freeze({
  florida: "FL",
  fl: "FL",
  texas: "TX",
  tx: "TX",
  california: "CA",
  ca: "CA",
  "new york": "NY",
  ny: "NY",
  georgia: "GA",
  ga: "GA",
  arizona: "AZ",
  az: "AZ",
  "north carolina": "NC",
  nc: "NC",
  illinois: "IL",
  il: "IL"
});

function titleCaseCity(raw) {
  return String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeStateToken(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) {
    return null;
  }
  if (/^[a-z]{2}$/.test(text)) {
    return text.toUpperCase();
  }
  return STATE_NAMES[text] || null;
}

function proposeStateFromCity(city) {
  const key = String(city || "")
    .trim()
    .toLowerCase();
  return CITY_TO_PROPOSED_STATE[key] || null;
}

/**
 * Parse location from inbound text.
 * Completeness: complete | partial | none
 */
function parseLocationAnswer(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const comma = raw.match(/^([^,]+),\s*(.+)$/);
  if (comma) {
    const city = titleCaseCity(comma[1]);
    const state = normalizeStateToken(comma[2]);
    if (city && state) {
      return {
        city,
        state,
        proposedState: null,
        completeness: "complete",
        requiresClarification: false
      };
    }
  }

  const withState = raw.match(
    /^([A-Za-z .]+?)\s+(FL|Florida|NY|CA|TX|GA|NJ|AZ|NC|IL)\s*$/i
  );
  if (withState) {
    const city = titleCaseCity(withState[1]);
    const state = normalizeStateToken(withState[2]);
    if (city && state) {
      return {
        city,
        state,
        proposedState: null,
        completeness: "complete",
        requiresClarification: false
      };
    }
  }

  // State-only confirmation when city already known is handled by caller.
  const stateOnly = normalizeStateToken(raw);
  if (stateOnly && raw.split(/\s+/).length <= 2) {
    return {
      city: null,
      state: stateOnly,
      proposedState: null,
      completeness: "state_only",
      requiresClarification: false
    };
  }

  // Known city-only only (avoid classifying fragments as cities).
  const cityKey = raw.toLowerCase();
  if (CITY_TO_PROPOSED_STATE[cityKey]) {
    const city = titleCaseCity(raw);
    return {
      city,
      state: null,
      proposedState: proposeStateFromCity(city),
      completeness: "partial",
      requiresClarification: true
    };
  }

  // Single-token alphabetic city candidate (unknown city → ask state, no invent).
  if (/^[A-Za-z][A-Za-z'-]{2,40}$/.test(raw) && !/\s/.test(raw)) {
    const city = titleCaseCity(raw);
    return {
      city,
      state: null,
      proposedState: null,
      completeness: "partial",
      requiresClarification: true
    };
  }

  // Multi-word known-style cities without state (e.g. "New York", "Fort Lauderdale").
  if (CITY_TO_PROPOSED_STATE[cityKey] == null && /^[A-Za-z][A-Za-z .'-]{3,40}$/.test(raw)) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 3 && words.every((w) => w.length >= 3)) {
      const city = titleCaseCity(raw);
      return {
        city,
        state: null,
        proposedState: proposeStateFromCity(city),
        completeness: "partial",
        requiresClarification: true
      };
    }
  }

  return null;
}

module.exports = {
  FACT_CERTAINTY,
  CITY_TO_PROPOSED_STATE,
  parseLocationAnswer,
  proposeStateFromCity,
  normalizeStateToken,
  titleCaseCity
};
