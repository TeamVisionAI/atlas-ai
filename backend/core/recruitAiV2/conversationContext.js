/**
 * Recruit AI v2 — canonical conversation context schema.
 * Implements BR-081. Pure data helpers; no I/O, no side effects.
 */

const {
  STAGES,
  APPOINTMENT_STATUS,
  LANGUAGES
} = require("./constants");

function emptyKnownFacts() {
  return {
    city: null,
    state: null,
    /** confirmed | proposed | partial | unknown — BR-082 */
    cityCertainty: "unknown",
    stateCertainty: "unknown",
    /** Likely state proposal; never treated as confirmed until affirmed. */
    proposedState: null,
    workAuthorization: null,
    /** BR-083 — authorized | not_authorized | unclear | unknown … */
    workAuthorizationStatus: "unknown",
    /** BR-083 — independent of work authorization */
    financialLicenseStatus: "unknown",
    financialLicenseTypes: [],
    currentOccupation: null,
    preferredMeetingType: null,
    coverage: null,
    fullName: null,
    name: null
  };
}

function emptyAppointment() {
  return {
    status: APPOINTMENT_STATUS.NONE,
    proposedDate: null,
    proposedTime: null,
    confirmedDate: null,
    confirmedTime: null,
    meetingType: null,
    location: null,
    appointmentId: null,
    previouslyOfferedSlots: []
  };
}

function emptyConversationMeta() {
  return {
    lastQuestionAsked: null,
    lastOfferMade: null,
    lastProspectIntent: null,
    pendingClarification: null,
    lastConfirmationSentAt: null,
    lastAtlasOutboundText: null,
    counterofferMismatchCount: 0,
    /** Recoverable clarification attempts (BR-082). */
    clarificationCount: 0,
    lastClarificationTemplateKey: null,
    confirmedFields: [],
    unresolvedFields: [],
    confirmationVersion: 0,
    lastConfirmationSentVersion: 0,
    lastCounterofferTime: null
  };
}

function emptyLanguageMeta() {
  return {
    source: "default",
    spanishEvidenceCount: 0,
    englishEvidenceCount: 0,
    lastMessageLanguage: "unknown"
  };
}

function emptyAttention() {
  return {
    needsHumanAttention: false,
    reason: null
  };
}

/**
 * Build a canonical conversation context object.
 */
function createConversationContext(overrides = {}) {
  const base = {
    prospectId: null,
    organizationId: null,
    preferredLanguage: LANGUAGES.UNKNOWN,
    languageMeta: emptyLanguageMeta(),
    currentStage: STAGES.GREETING,
    knownFacts: emptyKnownFacts(),
    appointment: emptyAppointment(),
    conversation: emptyConversationMeta(),
    attention: emptyAttention(),
    timezone: "America/New_York",
    schemaVersion: 1
  };

  return mergeConversationContext(base, overrides);
}

function mergeConversationContext(base, patch = {}) {
  const next = {
    ...base,
    ...patch,
    knownFacts: {
      ...emptyKnownFacts(),
      ...(base.knownFacts || {}),
      ...(patch.knownFacts || {})
    },
    appointment: {
      ...emptyAppointment(),
      ...(base.appointment || {}),
      ...(patch.appointment || {}),
      previouslyOfferedSlots: Array.isArray(patch.appointment?.previouslyOfferedSlots)
        ? patch.appointment.previouslyOfferedSlots
        : Array.isArray(base.appointment?.previouslyOfferedSlots)
          ? base.appointment.previouslyOfferedSlots
          : []
    },
    conversation: {
      ...emptyConversationMeta(),
      ...(base.conversation || {}),
      ...(patch.conversation || {})
    },
    attention: {
      ...emptyAttention(),
      ...(base.attention || {}),
      ...(patch.attention || {})
    },
    languageMeta: {
      ...emptyLanguageMeta(),
      ...(base.languageMeta || {}),
      ...(patch.languageMeta || {})
    }
  };

  return next;
}

function normalizeLanguage(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return LANGUAGES.UNKNOWN;
  }

  if (raw === "en" || raw.startsWith("english") || raw === "eng") {
    return LANGUAGES.ENGLISH;
  }

  if (raw === "es" || raw.startsWith("spanish") || raw === "spa" || raw === "español") {
    return LANGUAGES.SPANISH;
  }

  return LANGUAGES.UNKNOWN;
}

function languageToLocaleCode(language) {
  if (language === LANGUAGES.SPANISH) {
    return "es";
  }

  if (language === LANGUAGES.ENGLISH) {
    return "en";
  }

  return "en";
}

function slotKey(slot) {
  if (!slot) {
    return "";
  }

  return `${slot.date || ""}|${slot.time || ""}|${slot.timezone || ""}`;
}

function slotsEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  const leftKeys = left.map(slotKey).sort().join(";");
  const rightKeys = right.map(slotKey).sort().join(";");
  return leftKeys === rightKeys;
}

function isTimeInOfferedSlots(timeHhMm, offeredSlots = []) {
  if (!timeHhMm) {
    return false;
  }

  return offeredSlots.some((slot) => String(slot.time || "") === String(timeHhMm));
}

module.exports = {
  createConversationContext,
  mergeConversationContext,
  emptyKnownFacts,
  emptyAppointment,
  emptyConversationMeta,
  emptyAttention,
  emptyLanguageMeta,
  normalizeLanguage,
  languageToLocaleCode,
  slotKey,
  slotsEqual,
  isTimeInOfferedSlots,
  STAGES,
  APPOINTMENT_STATUS,
  LANGUAGES
};
