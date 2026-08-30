/**
 * Recruit AI v2 — location facts (BR-082 / BR-094 / BR-173).
 * City-only answers are partial. City + recognized state abbrev/name → confirmed.
 * Implements BR-094 — U.S. postal abbreviation / informal city-state normalization.
 * Implements BR-173 — Spanish/English state aliases, safe city-typo canonicalization,
 * and order-independent merge of city-then-state or state-then-city.
 * Uses BR-095 inbound normalization for case/punctuation/whitespace tolerance.
 */

const { prepareLocationSearchText } = require("./inputNormalization");

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
  "ft lauderdale": "FL",
  "fort myers": "FL",
  "cape coral": "FL",
  naples: "FL",
  hialeah: "FL",
  kissimmee: "FL",
  "west palm beach": "FL",
  wpb: "FL",
  "palm beach": "FL",
  tallahassee: "FL",
  kendall: "FL",
  miramar: "FL",
  homestead: "FL",
  "cutler bay": "FL",
  "miami beach": "FL",
  "north miami beach": "FL",
  "pembroke pines": "FL",
  hollywood: "FL",
  "coral gables": "FL",
  "miami gardens": "FL",
  "north miami": "FL",
  aventura: "FL",
  "sunny isles": "FL",
  "sunny isles beach": "FL",
  "hialeah gardens": "FL",
  sweetwater: "FL",
  westchester: "FL",
  pinecrest: "FL",
  "palmetto bay": "FL",
  "florida city": "FL",
  davie: "FL",
  plantation: "FL",
  sunrise: "FL",
  weston: "FL",
  "cooper city": "FL",
  hallandale: "FL",
  "hallandale beach": "FL",
  "pompano beach": "FL",
  "deerfield beach": "FL",
  "boca raton": "FL",
  "delray beach": "FL",
  "boynton beach": "FL",
  "lake worth": "FL",
  "lake worth beach": "FL",
  wellington: "FL",
  jupiter: "FL",
  "palm beach gardens": "FL",
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

/** High-confidence South Florida / Florida cities — normalize silently to FL (no state ask). */
const HIGH_CONFIDENCE_FL_CITIES = new Set(
  Object.entries(CITY_TO_PROPOSED_STATE)
    .filter(([, state]) => state === "FL")
    .map(([city]) => city)
);

/** Nationally ambiguous city names — never auto-assign state. */
const AMBIGUOUS_US_CITIES = new Set([
  "springfield",
  "columbus",
  "richmond",
  "jackson",
  "portland",
  "arlington",
  "franklin",
  "clinton",
  "madison",
  "georgetown",
  "manchester",
  "salem",
  "fairview",
  "greenville",
  "bristol",
  "clayton",
  "oxford",
  "milton",
  "chester",
  "ashland"
]);

/** Alias → canonical lookup key in CITY_TO_PROPOSED_STATE / CANONICAL_CITY_KEYS. */
const CITY_LOOKUP_ALIASES = Object.freeze({
  wpb: "west palm beach",
  "ft lauderdale": "fort lauderdale",
  "ft. lauderdale": "fort lauderdale",
  "sunny isles": "sunny isles beach",
  pompano: "pompano beach",
  bluftton: "bluffton"
});

/**
 * Known city spellings that may canonicalize even when state is not proposed.
 * Bluffton is nationally ambiguous (SC/IN/OH) — spelling only, no auto-state.
 */
const CANONICAL_CITY_KEYS = new Set([
  ...Object.keys(CITY_TO_PROPOSED_STATE),
  "bluffton"
]);

function foldLocationToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const rows = left.length;
  const cols = right.length;
  const dp = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = 0; i <= rows; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= cols; j += 1) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[rows][cols];
}

function normalizeCityLookupKey(raw) {
  const folded = foldLocationToken(raw).replace(/[.,]+/g, " ").replace(/\s+/g, " ").trim();
  if (!folded) {
    return "";
  }
  return CITY_LOOKUP_ALIASES[folded] || folded;
}

function resolveCanonicalCityKey(raw) {
  const aliased = normalizeCityLookupKey(raw);
  if (!aliased) {
    return "";
  }
  if (CANONICAL_CITY_KEYS.has(aliased)) {
    return aliased;
  }
  if (/\s/.test(aliased) || aliased.length < 6) {
    return aliased;
  }
  const matches = [];
  for (const candidate of CANONICAL_CITY_KEYS) {
    if (/\s/.test(candidate) || candidate.length < 6) {
      continue;
    }
    if (Math.abs(candidate.length - aliased.length) > 1) {
      continue;
    }
    if (levenshteinDistance(aliased, candidate) === 1) {
      matches.push(candidate);
    }
  }
  return matches.length === 1 ? matches[0] : aliased;
}

function canonicalizeCityName(raw) {
  const key = resolveCanonicalCityKey(raw);
  return key ? titleCaseCity(key) : null;
}

function isHighConfidenceFloridaCity(city) {
  const key = normalizeCityLookupKey(city);
  return Boolean(key && HIGH_CONFIDENCE_FL_CITIES.has(key));
}

function buildHighConfidenceFloridaLocation(rawCity) {
  const key = normalizeCityLookupKey(rawCity);
  if (!key || !HIGH_CONFIDENCE_FL_CITIES.has(key)) {
    return null;
  }
  if (AMBIGUOUS_US_CITIES.has(key)) {
    return null;
  }
  const city = titleCaseCity(key);
  return {
    city,
    state: "FL",
    proposedState: null,
    completeness: "complete",
    requiresClarification: false
  };
}

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
  "nueva hampshire": "NH",
  nh: "NH",
  "new jersey": "NJ",
  "nueva jersey": "NJ",
  nj: "NJ",
  "new mexico": "NM",
  "nuevo mexico": "NM",
  nm: "NM",
  "new york": "NY",
  "nueva york": "NY",
  ny: "NY",
  "north carolina": "NC",
  "norte carolina": "NC",
  "carolina del norte": "NC",
  nc: "NC",
  "north dakota": "ND",
  "dakota del norte": "ND",
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
  "sur carolina": "SC",
  "carolina del sur": "SC",
  sc: "SC",
  "south dakota": "SD",
  "dakota del sur": "SD",
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
  "virginia occidental": "WV",
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

// "south/north carolina" are U.S. states (BR-173), not regional city phrases.
const REGIONAL_PHRASE_RE =
  /^(south|north|central)\s+(florida|texas|california)$/i;
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
  const text = foldLocationToken(value);
  if (!text) {
    return null;
  }
  if (/^[a-z]{2}$/.test(text)) {
    const upper = text.toUpperCase();
    return US_POSTAL_ABBREVIATIONS.has(upper) ? upper : null;
  }
  return US_STATE_NAME_TO_ABBR[text] || null;
}

/** True when text is a US state/territory name and not a known city (e.g. New York). */
function isStateNameNotCity(raw) {
  if (!normalizeStateToken(raw)) {
    return false;
  }
  return !CITY_TO_PROPOSED_STATE[normalizeCityLookupKey(raw)];
}

function proposeStateFromCity(city) {
  const key = normalizeCityLookupKey(city);
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

  const bareEn = t.match(/^en\s+([A-Za-zÁÉÍÓÚÑáéíóúñ].+)$/i);
  if (bareEn) {
    const candidate = String(bareEn[1] || "").trim();
    if (
      candidate &&
      !/^(que|qué|donde|dónde|cual|cuál|que estado|qué estado)\b/i.test(candidate)
    ) {
      t = candidate;
    }
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
  if (looksLikeConversationalProseCity(t)) {
    return false;
  }
  // Reject bare / multi-word state tokens as cities ("Florida", "Sur Carolina").
  // Keep real cities that share a region name (e.g. city "New York").
  if (isStateNameNotCity(t)) {
    return false;
  }
  return true;
}

/**
 * Parse "City ST" / "City, ST" / "City StateName" including multi-word cities (BR-094).
 * Also accepts state-first natural order: "Florida Jacksonville", "FL Jacksonville".
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

  // Prefer conventional city → state first (Jacksonville Florida / Miami FL).
  let parsed = splitCityThenState(parts);
  // Fallback: state → city (Florida Jacksonville / North Carolina Charlotte).
  if (!parsed) {
    parsed = splitStateThenCity(parts);
  }
  return parsed;
}

function buildCompleteLocation(cityParts, state) {
  if (!state || !cityParts || !cityParts.length) {
    return null;
  }
  const joined = cityParts.join(" ");
  const canonicalKey = normalizeCityLookupKey(joined);
  const city = titleCaseCity(canonicalKey || joined);
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

function isNonLocationPhrase(folded) {
  const t = String(folded || "").trim();
  if (!t) {
    return false;
  }
  return (
    /^(me parece|parece bien|me parece bien|parece que|me parece que)$/.test(t) ||
    /^(me gustaria|me gustaria saber|me gustaría|me gustaría saber)$/.test(t) ||
    /^(dime|escribeme|escriba me|escribeme por favor)$/.test(t) ||
    /^(perfecto|gracias|ok|dale|claro|entendido|listo|bueno|bien|si|sí|todo bien)$/.test(t) ||
    /^(mañana|manana|hoy|tarde|noche)$/.test(t) ||
    /^(mejor|thanks|thank you|got it|sounds good)$/.test(t) ||
    // Bare Spanish pronoun / conversational "me" is never Maine.
    /^(me)$/.test(t) ||
    /\bdonde trabaj/.test(t) ||
    /\bwhere (would|do|will) i work\b/.test(t) ||
    /\bwhat is the work\b/.test(t)
  );
}

function isFalsePositiveStateToken(token) {
  const t = String(token || "").trim().toLowerCase();
  return ["me", "in", "or", "ok", "la", "ma", "pa", "id", "hi", "de", "al"].includes(t);
}

function looksLikeConversationalProseCity(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return false;
  }
  const folded = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = folded.split(/\s+/).filter(Boolean);
  if (raw.length > 48 || words.length > 5) {
    return true;
  }
  if (
    /\b(gustaria|quisiera|quiero|saber|consisten|posiciones|disponibles|trabajo|trabajaria|gracias|documento|firmando|escribio|telefono|cargando)\b/.test(
      folded
    )
  ) {
    return true;
  }
  if (
    /\b(me gustaria|me interesa|dime|escribeme|por favor|muchas gracias)\b/.test(folded)
  ) {
    return true;
  }
  return false;
}

function splitCityThenState(parts) {
  let state = null;
  let cityParts = null;

  if (parts.length >= 3) {
    const twoWordState = normalizeStateToken(parts.slice(-2).join(" "));
    if (twoWordState) {
      state = twoWordState;
      cityParts = parts.slice(0, -2);
    }
  }

  if (!state) {
    const lastToken = parts[parts.length - 1];
    if (isFalsePositiveStateToken(lastToken)) {
      return null;
    }
    state = normalizeStateToken(lastToken);
    if (state) {
      cityParts = parts.slice(0, -1);
    }
  }

  return buildCompleteLocation(cityParts, state);
}

function splitStateThenCity(parts) {
  let state = null;
  let cityParts = null;

  if (parts.length >= 3) {
    const twoWordState = normalizeStateToken(parts.slice(0, 2).join(" "));
    if (twoWordState) {
      state = twoWordState;
      cityParts = parts.slice(2);
    }
  }

  if (!state) {
    const firstToken = parts[0];
    if (isFalsePositiveStateToken(firstToken)) {
      return null;
    }
    state = normalizeStateToken(firstToken);
    if (state) {
      cityParts = parts.slice(1);
    }
  }

  return buildCompleteLocation(cityParts, state);
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

  // BR-095 — punctuation/case/whitespace-tolerant search form ("Miami,FL", "MIAMI FL").
  const searchForm = prepareLocationSearchText(rawOriginal) || rawOriginal;
  const extracted = extractLocationCandidateText(rawOriginal);
  const extractedSearch = extracted.text
    ? prepareLocationSearchText(extracted.text) || extracted.text
    : "";
  const candidates = [searchForm, rawOriginal];
  if (extractedSearch && !candidates.includes(extractedSearch)) {
    candidates.unshift(extractedSearch);
  }
  if (extracted.text && extracted.text !== rawOriginal) {
    candidates.push(extracted.text);
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

  // Never invent cities from company-identity / info-request / FAQ phrasing.
  const folded = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (isNonLocationPhrase(folded)) {
    return null;
  }

  if (looksLikeConversationalProseCity(raw) || looksLikeConversationalProseCity(folded)) {
    return null;
  }

  // Never invent cities from company-identity / info-request / FAQ phrasing.
  if (
    /\b(empresa|compania|companias)\b/.test(folded) ||
    /\b(quiero|dame|quisiera|necesito)\b.{0,40}\b(informacion|detalles)\b/.test(
      folded
    ) ||
    /\bme interesa saber\b/.test(folded) ||
    /\bme gustaria saber\b/.test(folded) ||
    /\b(que|cual|como)\b.{0,40}\b(empresa|compania)\b/.test(folded) ||
    /\bcon que (empresa|compania)\b/.test(folded) ||
    /\bpara que (empresa|compania)\b/.test(folded) ||
    /\bwhat company\b/.test(folded) ||
    /\bwhich company\b/.test(folded) ||
    /\bwho do you work for\b/.test(folded)
  ) {
    return null;
  }

  // Never invent cities from license / authorization / FAQ phrasing (BR-083/098/099).
  if (
    /\b(licen[cs]ia|license|permiso|autoriz|seguro|seguros|driver|conducir|215|214|experiencia|experience|necesito|comision|comisión|salario|sueldo|ganar|dinero|pagan|pago|vender|vendiendo|vendedor|vendedora|ventas|selling|sales|salesperson|conozco|contactos|clientes|network)\b/i.test(
      raw
    )
  ) {
    return null;
  }

  // Day-part preference fragments are not locations ("Tarde mejor", "Mañana mejor").
  if (
    /^(tarde|mañana|manana|morning|afternoon|evening|noche)(\s+(mejor|better|por\s+favor|prefiero))?$/i.test(
      String(raw || "").trim()
    ) ||
    /^(mejor|better)\s+(tarde|mañana|manana|morning|afternoon|evening|noche)$/i.test(
      String(raw || "").trim()
    )
  ) {
    return null;
  }

  // Scheduling-relative day / referential slot phrases are not cities.
  const schedNorm = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(para\s+)?(manana|hoy|tomorrow|today)$/.test(schedNorm) ||
    /^(mejor|better)\s+(manana|hoy|tomorrow|today)$/.test(schedNorm) ||
    /^(si|yes|ok)?\s*(esa|esta|that)\s+(hora|time)$/.test(schedNorm) ||
    /^(esa|esta)\s+(hora|time)$/.test(schedNorm) ||
    /^(mejor|better)\s+(a\s+las\s+)?\d{1,2}(:\d{2})?\b/.test(schedNorm) ||
    /^(manana|hoy|tomorrow|today)\s+(a\s+las\s+)?\d{1,2}(:\d{2})?\b/.test(
      schedNorm
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
  // Never treat conversational Spanish "me" (or other false-positive tokens) as Maine/etc.
  const stateOnly = normalizeStateToken(working);
  if (
    stateOnly &&
    working.split(/\s+/).length <= 4 &&
    !isFalsePositiveStateToken(working)
  ) {
    return {
      city: null,
      state: stateOnly,
      proposedState: null,
      completeness: "state_only",
      requiresClarification: false
    };
  }

  // Known city-only — high-confidence Florida cities resolve complete (no state ask).
  const cityKey = resolveCanonicalCityKey(working);
  const highConfidenceFl = !hedged ? buildHighConfidenceFloridaLocation(cityKey || working) : null;
  if (highConfidenceFl) {
    return highConfidenceFl;
  }
  if (CITY_TO_PROPOSED_STATE[cityKey]) {
    const city = titleCaseCity(cityKey);
    return {
      city,
      state: null,
      proposedState: proposeStateFromCity(city),
      completeness: "partial",
      requiresClarification: true
    };
  }

  // Single-token alphabetic city candidate (unknown city → ask state, no invent).
  // Implements BR-126 — bare affirmatives are never cities ("Si" / "Yes").
  if (/^(si|sí|yes|yep|yeah|ok|okay|dale|claro)$/i.test(working)) {
    return null;
  }
  if (/^[A-Za-z][A-Za-z'-]{2,40}$/.test(working) && !/\s/.test(working)) {
    if (isFalsePositiveStateToken(working)) {
      return null;
    }
    if (normalizeStateToken(working)) {
      return {
        city: null,
        state: normalizeStateToken(working),
        proposedState: null,
        completeness: "state_only",
        requiresClarification: false
      };
    }
    const city = titleCaseCity(cityKey || working);
    if (!isPlausibleCityName(city)) {
      return null;
    }
    return {
      city,
      state: null,
      proposedState: proposeStateFromCity(city),
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
      if (looksLikeConversationalProseCity(working)) {
        return null;
      }
      const multiWordFl = !hedged ? buildHighConfidenceFloridaLocation(working) : null;
      if (multiWordFl) {
        return multiWordFl;
      }
      const city = titleCaseCity(cityKey || working);
      if (!isPlausibleCityName(city)) {
        return null;
      }
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

/** USPS code → canonical English display name (BR-102 ask-city copy). */
const US_STATE_ABBR_TO_NAME = Object.freeze(
  Object.entries(US_STATE_NAME_TO_ABBR).reduce((acc, [name, abbr]) => {
    if (name.length === 2) {
      return acc;
    }
    if (!acc[abbr] || name.length > acc[abbr].length) {
      acc[abbr] = name
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    return acc;
  }, {})
);

function stateDisplayName(code, language = "english") {
  const abbr = String(code || "").toUpperCase();
  const en = US_STATE_ABBR_TO_NAME[abbr] || abbr;
  if (language === "spanish" || language === "es") {
    const esOverrides = {
      NY: "Nueva York",
      NJ: "Nueva Jersey",
      NC: "Carolina del Norte",
      SC: "Carolina del Sur",
      PA: "Pensilvania",
      MI: "Míchigan",
      OR: "Oregón",
      DC: "Distrito de Columbia"
    };
    return esOverrides[abbr] || en;
  }
  return en;
}

module.exports = {
  FACT_CERTAINTY,
  CITY_TO_PROPOSED_STATE,
  HIGH_CONFIDENCE_FL_CITIES,
  AMBIGUOUS_US_CITIES,
  US_STATE_NAME_TO_ABBR,
  US_STATE_ABBR_TO_NAME,
  US_POSTAL_ABBREVIATIONS,
  STATE_NAMES,
  parseLocationAnswer,
  parseLocationAnswerCore,
  parseCityStatePhrase,
  extractLocationCandidateText,
  normalizeCityLookupKey,
  isHighConfidenceFloridaCity,
  buildHighConfidenceFloridaLocation,
  isNonLocationPhrase,
  isFalsePositiveStateToken,
  looksLikeConversationalProseCity,
  looksLikeLocationCorrection,
  proposeStateFromCity,
  normalizeStateToken,
  titleCaseCity,
  canonicalizeCityName,
  resolveCanonicalCityKey,
  isStateNameNotCity,
  isCompleteCityStatePhrase,
  hasLocationHedge,
  stateDisplayName
};
