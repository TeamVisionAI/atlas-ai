/**
 * BR-174 — provider-neutral semantic interpretation contract.
 * Decision engine and persistence consume this shape only — never provider JSON.
 */

const SCHEMA_VERSION = 1;

const LANGUAGES = Object.freeze(["spanish", "english", "unknown"]);

const SCHEDULING_INTENTS = Object.freeze([
  "none",
  "propose",
  "confirm",
  "reschedule",
  "cancel"
]);

function asString(value, fallback = null) {
  if (value == null) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampConfidence(value) {
  const n = asNumber(value, 0);
  if (n < 0) {
    return 0;
  }
  if (n > 1) {
    return 1;
  }
  return n;
}

function asBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value;
  }
  return fallback;
}

function emptyFacts() {
  return {
    city: null,
    state: null,
    cityCanonical: null,
    workAuthorization: null,
    workAuthorizationStatus: null,
    email: null,
    name: null,
    employmentPreference: null,
    financialLicenseStatus: null
  };
}

function emptySafety() {
  return {
    ssnPrivacy: false,
    optOut: false,
    humanRequired: false
  };
}

function createEmptySemanticInterpretation(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    intent: asString(overrides.intent, "unknown"),
    language: LANGUAGES.includes(overrides.language) ? overrides.language : "unknown",
    confidence: clampConfidence(overrides.confidence),
    facts: { ...emptyFacts(), ...(overrides.facts || {}) },
    entities: overrides.entities && typeof overrides.entities === "object" ? overrides.entities : {},
    corrections: Array.isArray(overrides.corrections) ? overrides.corrections : [],
    objections: Array.isArray(overrides.objections) ? overrides.objections : [],
    schedulingIntent: SCHEDULING_INTENTS.includes(overrides.schedulingIntent)
      ? overrides.schedulingIntent
      : "none",
    requestedDate: asString(overrides.requestedDate, null),
    requestedTime: asString(overrides.requestedTime, null),
    requestedDayPart: asString(overrides.requestedDayPart, null),
    meetingPreference: asString(overrides.meetingPreference, null),
    needsClarification: asBoolean(overrides.needsClarification, false),
    clarificationReason: asString(overrides.clarificationReason, null),
    safety: { ...emptySafety(), ...(overrides.safety || {}) }
  };
}

/**
 * Validate and coerce unknown provider output into the internal schema.
 * Returns { ok, interpretation, errors }.
 */
function validateSemanticInterpretation(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, interpretation: null, errors: ["not_an_object"] };
  }

  const language = asString(raw.language, "unknown").toLowerCase();
  if (!LANGUAGES.includes(language)) {
    errors.push("invalid_language");
  }

  const schedulingIntent = asString(raw.schedulingIntent, "none");
  if (!SCHEDULING_INTENTS.includes(schedulingIntent)) {
    errors.push("invalid_scheduling_intent");
  }

  const interpretation = createEmptySemanticInterpretation({
    intent: raw.intent,
    language: LANGUAGES.includes(language) ? language : "unknown",
    confidence: raw.confidence,
    facts: raw.facts,
    entities: raw.entities,
    corrections: raw.corrections,
    objections: raw.objections,
    schedulingIntent: SCHEDULING_INTENTS.includes(schedulingIntent)
      ? schedulingIntent
      : "none",
    requestedDate: raw.requestedDate,
    requestedTime: raw.requestedTime,
    requestedDayPart: raw.requestedDayPart,
    meetingPreference: raw.meetingPreference,
    needsClarification: raw.needsClarification,
    clarificationReason: raw.clarificationReason,
    safety: raw.safety
  });

  if (!interpretation.intent) {
    errors.push("missing_intent");
  }

  return {
    ok: errors.length === 0,
    interpretation: errors.length === 0 ? interpretation : null,
    errors
  };
}

function stripProviderMetadata(interpretation) {
  if (!interpretation || typeof interpretation !== "object") {
    return interpretation;
  }
  const copy = { ...interpretation };
  delete copy.provider;
  delete copy.model;
  delete copy.rawProviderOutput;
  return copy;
}

module.exports = {
  SCHEMA_VERSION,
  LANGUAGES,
  SCHEDULING_INTENTS,
  createEmptySemanticInterpretation,
  validateSemanticInterpretation,
  stripProviderMetadata
};
