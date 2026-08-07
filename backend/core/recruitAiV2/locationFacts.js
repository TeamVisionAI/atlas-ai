/**
 * Recruit AI v2 — location facts (BR-082 / BR-094).
 * City-only answers are partial. City + recognized state abbrev/name → confirmed.
 * Implements BR-094 — U.S. postal abbreviation / informal city-state normalization.
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
  kissimmee: "FL",
  "west palm beach": "FL",
  "palm beach": "FL",
  tallahassee: "FL",
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
  "san diego": "CA",
  "san francisco": "CA"
});

/**
 * Canonical U.S. state name / postal abbreviation → USPS code.
 * Shared by v2 location parsing (BR-094). Aligns with legacy US_STATE_NAMES coverage.
 */
const US_STATE_NAME_TO_ABBR = Object.freeze({
  alabama: "AL",
  al: "AL",
  alaska: "AK",
  ak: "AK",
  arizona: "AZ",
  az: "AZ",
  arkansas: "AR",
  ar: "AR",
  california: "CA",
  ca: "CA",
  colorado: "CO",
  co: "CO",
  connecticut: "CT",
  ct: "CT",
  delaware: "DE",
  de: "DE",
  florida: "FL",
  fl: "FL",
  georgia: "GA",
  ga: "GA",
  hawaii: "HI",
  hi: "HI",
  idaho: "ID",
  id: "ID",
  illinois: "IL",
  il: "IL",
  indiana: "IN",
  in: "IN",
  iowa: "IA",
  ia: "IA",
  kansas: "KS",
  ks: "KS",
  kentucky: "KY",
  ky: "KY",
  louisiana: "LA",
  la: "LA",
  maine: "ME",
  me: "ME",
  maryland: "MD",
  md: "MD",
  massachusetts: "MA",
  ma: "MA",
  michigan: "MI",
  mi: "MI",
  minnesota: "MN",
  mn: "MN",
  mississippi: "MS",
  ms: "MS",
  missouri: "MO",
  mo: "MO",
  montana: "MT",
  mt: "MT",
  nebraska: "NE",
  ne: "NE",
  nevada: "NV",
  nv: "NV",
  "new hampshire": "NH",
  nh: "NH",
  "new jersey": "NJ",
  nj: "NJ",
  "new mexico": "NM",
  nm: "NM",
  "new york": "NY",
  ny: "NY",
  "north carolina": "NC",
  nc: "NC",
  "north dakota": "ND",
  nd: "ND",
  ohio: "OH",
  oh: "OH",
  oklahoma: "OK",
  ok: "OK",
  oregon: "OR",
  or: "OR",
  pennsylvania: "PA",
  pa: "PA",
  "rhode island": "RI",
  ri: "RI",
  "south carolina": "SC",
  sc: "SC",
  "south dakota": "SD",
  sd: "SD",
  tennessee: "TN",
  tn: "TN",
  texas: "TX",
  tx: "TX",
  utah: "UT",
  ut: "UT",
  vermont: "VT",
  vt: "VT",
  virginia: "VA",
  va: "VA",
  washington: "WA",
  wa: "WA",
  "west virginia": "WV",
  wv: "WV",
  wisconsin: "WI",
  wi: "WI",
  wyoming: "WY",
  wy: "WY",
  "district of columbia": "DC",
  dc: "DC"
});

const US_POSTAL_ABBREVIATIONS = new Set(Object.values(US_STATE_NAME_TO_ABBR));

/** @deprecated use US_STATE_NAME_TO_ABBR — kept for existing importers */
const STATE_NAMES = US_STATE_NAME_TO_ABBR;

const REGIONAL_PHRASE_RE =
  /^(south|north|central)\s+(florida|texas|california|carolina)$/i;
const REGION_ONLY_CITY_RE = /^(south|north|central|east|west)$/i;
const LOCATION_HEDGE_RE =
  /\b(maybe|perhaps|i think|not sure|quiz[aá]s|creo que|no s[eé]|posiblemente)\b/i;

function titleCaseCity(raw) {
  return String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^(fl|nw|sw|ne|se)$/i.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Normalize a U.S. state token to a USPS abbreviation.
 * Only known postal codes / state names — never arbitrary two-letter scraps (BR-094).
 */
function normalizeStateToken(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "");
  if (!text) {
    return null;
  }
  if (/^[a-z]{2}$/.test(text)) {
    const upper = text.toUpperCase();
    return US_POSTAL_ABBREVIATIONS.has(upper) ? upper : null;
  }
  return US_STATE_NAME_TO_ABBR[text] || null;
}

function proposeStateFromCity(city) {
  const key = String(city || "")
    .trim()
    .toLowerCase();
  return CITY_TO_PROPOSED_STATE[key] || null;
}

function hasLocationHedge(text) {
  return LOCATION_HEDGE_RE.test(String(text || ""));
}

function stripLocationHedge(text) {
  return String(text || "")
    .replace(LOCATION_HEDGE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CORRECTION_OPENER =
  /^(digo|mejor dicho|en realidad|realmente|perd[oó]n|quise decir|me equivoqu[eé]|actually|i mean|sorry|correction)[,:]?\s*/i;

/**
 * Strip correction / living preambles so "Digo, vivo en Doral" → "Doral".
 */
function extractLocationCandidateText(text) {
  let t = String(text || "").trim();
  if (!t) {
    return "";
  }

  let strippedCorrection = false;
  if (CORRECTION_OPENER.test(t)) {
    t = t.replace(CORRECTION_OPENER, "").trim();
    strippedCorrection = true;
  }

  // "No, Doral" / "No, vivo en ..."
  if (/^no[,:]?\s+/i.test(t)) {
    t = t.replace(/^no[,:]?\s+/i, "").trim();
    strippedCorrection = true;
  }

  const live = t.match(
    /^(?:vivo en|live in|i live in|estoy en|i(?:'?m| am) in)\s+(.+)$/i
  );
  if (live) {
    t = String(live[1] || "").trim();
    strippedCorrection = strippedCorrection || true;
  }

  return { text: t, correctionSignal: strippedCorrection };
}

function looksLikeLocationCorrection(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return false;
  }
  if (CORRECTION_OPENER.test(raw) || /^no[,:]?\s+/i.test(raw)) {
    return true;
  }
  return /^(vivo en|live in|i live in|estoy en)\b/i.test(raw);
}

function isPlausibleCityName(city) {
  const t = String(city || "").trim();
  if (!t || t.length < 3) {
    return false;
  }
  if (REGION_ONLY_CITY_RE.test(t)) {
    return false;
  }
  // Reject bare state tokens as cities ("Florida", "FL").
  // Allow multi-word places that share a state name (e.g. city "New York" + state NY).
  if (!/\s/.test(t) && normalizeStateToken(t)) {
    return false;
  }
  return true;
}

/**
 * Parse "City ST" / "City, ST" / "City StateName" including multi-word cities (BR-094).
 */
function parseCityStatePhrase(raw) {
  const cleaned = String(raw || "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || REGIONAL_PHRASE_RE.test(cleaned)) {
    return null;
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  let state = null;
  let cityParts = null;

  // Last two tokens as multi-word state name (North Carolina, New York, …)
  if (parts.length >= 3) {
    const twoWordState = normalizeStateToken(parts.slice(-2).join(" "));
    if (twoWordState) {
      state = twoWordState;
      cityParts = parts.slice(0, -2);
    }
  }

  if (!state) {
    state = normalizeStateToken(parts[parts.length - 1]);
    if (state) {
      cityParts = parts.slice(0, -1);
    }
  }

  if (!state || !cityParts || !cityParts.length) {
    return null;
  }

  const city = titleCaseCity(cityParts.join(" "));
  if (!isPlausibleCityName(city)) {
    return null;
  }

  return {
    city,
    state,
    proposedState: null,
    completeness: "complete",
    requiresClarification: false
  };
}

/**
 * Parse location from inbound text.
 * Completeness: complete | partial | state_only | none
 */
function parseLocationAnswer(text) {
  const rawOriginal = String(text || "").trim();
  if (!rawOriginal) {
    return null;
  }

  const extracted = extractLocationCandidateText(rawOriginal);
  const candidates = [rawOriginal];
  if (extracted.text && extracted.text !== rawOriginal) {
    candidates.unshift(extracted.text);
  }

  for (const raw of candidates) {
    const parsed = parseLocationAnswerCore(raw);
    if (parsed) {
      return {
        ...parsed,
        correction: Boolean(
          extracted.correctionSignal || looksLikeLocationCorrection(rawOriginal)
        )
      };
    }
  }

  return null;
}

function parseLocationAnswerCore(raw) {
  if (!raw) {
    return null;
  }

  // Never invent cities from license / authorization phrasing (BR-083).
  if (
    /\b(licen[cs]ia|license|permiso|autoriz|seguro|driver|conducir|215|214)\b/i.test(
      raw
    )
  ) {
    return null;
  }

  const hedged = hasLocationHedge(raw);
  const working = hedged ? stripLocationHedge(raw) : raw;
  if (!working) {
    return null;
  }

  // Comma form: "Miami, FL" / "Miami, Florida"
  const comma = working.match(/^([^,]+),\s*(.+)$/);
  if (comma) {
    const city = titleCaseCity(comma[1]);
    const state = normalizeStateToken(comma[2]);
    if (city && state && isPlausibleCityName(city)) {
      if (hedged) {
        return {
          city,
          state: null,
          proposedState: state,
          completeness: "partial",
          requiresClarification: true
        };
      }
      return {
        city,
        state,
        proposedState: null,
        completeness: "complete",
        requiresClarification: false
      };
    }
  }

  // Space form with USPS abbrev or full state name (BR-094).
  const phrase = parseCityStatePhrase(working);
  if (phrase) {
    if (hedged) {
      return {
        city: phrase.city,
        state: null,
        proposedState: phrase.state,
        completeness: "partial",
        requiresClarification: true
      };
    }
    return phrase;
  }

  // State-only confirmation when city already known is handled by caller.
  const stateOnly = normalizeStateToken(working);
  if (stateOnly && working.split(/\s+/).length <= 2) {
    return {
      city: null,
      state: stateOnly,
      proposedState: null,
      completeness: "state_only",
      requiresClarification: false
    };
  }

  // Known city-only only (avoid classifying fragments as cities).
  const cityKey = working.toLowerCase();
  if (CITY_TO_PROPOSED_STATE[cityKey]) {
    const city = titleCaseCity(working);
    return {
      city,
      state: null,
      proposedState: proposeStateFromCity(city),
      completeness: "partial",
      requiresClarification: true
    };
  }

  // Single-token alphabetic city candidate (unknown city → ask state, no invent).
  if (/^[A-Za-z][A-Za-z'-]{2,40}$/.test(working) && !/\s/.test(working)) {
    if (normalizeStateToken(working)) {
      return {
        city: null,
        state: normalizeStateToken(working),
        proposedState: null,
        completeness: "state_only",
        requiresClarification: false
      };
    }
    const city = titleCaseCity(working);
    return {
      city,
      state: null,
      proposedState: null,
      completeness: "partial",
      requiresClarification: true
    };
  }

  // Multi-word known-style cities without state (e.g. "New York", "Fort Lauderdale").
  if (CITY_TO_PROPOSED_STATE[cityKey] == null && /^[A-Za-z][A-Za-z .'-]{3,40}$/.test(working)) {
    const words = working.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => w.length >= 3)) {
      // "South Florida" regional — not city = South (BR-082 / BR-094).
      if (REGIONAL_PHRASE_RE.test(working) || REGION_ONLY_CITY_RE.test(words[0])) {
        return null;
      }
      const city = titleCaseCity(working);
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

/**
 * True when text is a complete city + recognized U.S. state phrase (BR-094).
 * Used by the interpreter so short "miami fl" is not treated as an ambiguous fragment.
 */
function isCompleteCityStatePhrase(text) {
  const parsed = parseLocationAnswer(text);
  return parsed?.completeness === "complete";
}

module.exports = {
  FACT_CERTAINTY,
  CITY_TO_PROPOSED_STATE,
  US_STATE_NAME_TO_ABBR,
  US_POSTAL_ABBREVIATIONS,
  STATE_NAMES,
  parseLocationAnswer,
  parseLocationAnswerCore,
  parseCityStatePhrase,
  extractLocationCandidateText,
  looksLikeLocationCorrection,
  proposeStateFromCity,
  normalizeStateToken,
  titleCaseCity,
  isCompleteCityStatePhrase,
  hasLocationHedge
};
