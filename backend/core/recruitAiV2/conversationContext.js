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
    /**
     * BR-083/085 — who set meeting modality:
     * coverage_default | prospect | prospect_requested | prospect_confirmed | null
     */
    meetingPreferenceSource: null,
    /** BR-085 — requested modality before travel/location confirmation */
    meetingTypeRequested: null,
    /** BR-085 — true only after explicit travel/location confirmation when required */
    meetingTypeConfirmed: null,
    /** BR-084 — morning | afternoon | evening; independent of meeting type */
    preferredDayPart: null,
    /** BR-084/102 — { type, earliestTime, latestTime, earliestTimeInclusive, dayPart, explicitCandidateTime, raw } */
    availabilityConstraint: null,
    /** BR-085 — ISO dates the prospect said are unavailable */
    dateExclusions: [],
    coverage: null,
    fullName: null,
    name: null,
    /** BR-090 — fixed | null */
    employmentPreference: null,
    /** BR-090 — exploring | not_now | null */
    currentFit: null
  };
}

function emptyAppointment() {
  return {
    status: APPOINTMENT_STATUS.NONE,
    proposedDate: null,
    /** BR-085 — prior candidate dates (history only; one active proposedDate) */
    proposedDateHistory: [],
    proposedDateLabel: null,
    proposedTime: null,
    /** BR-084 — prior candidate times (history only; one active proposedTime) */
    proposedTimeHistory: [],
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
    lastCounterofferTime: null,
    /** BR-090 — fixed-employment preference already acknowledged (no pressure). */
    fixedEmploymentAcknowledged: false,
    /** BR-090 — job/opportunity FAQ already answered in this thread. */
    opportunityExplained: false
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

function slotDate(slot) {
  if (!slot) {
    return null;
  }
  return slot.date || slot.dateKey || null;
}

function slotTime(slot) {
  if (!slot) {
    return null;
  }
  return slot.time || slot.timeKey || null;
}

function slotKey(slot) {
  if (!slot) {
    return "";
  }

  return `${slotDate(slot) || ""}|${slotTime(slot) || ""}|${slot.timezone || ""}`;
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

  return offeredSlots.some(
    (slot) => String(slotTime(slot) || "") === String(timeHhMm)
  );
}

/**
 * BR-115 — match a natural/spoken time against previously offered slots.
 * Optional dateIso narrows to one calendar day (e.g. "domingo 7:30").
 * @returns {{ kind: 'unique'|'ambiguous'|'none', selected: object|null, matches: object[] }}
 */
function resolveUniqueOfferedSlotSelection(
  offeredSlots = [],
  requestedTime = null,
  { dateIso = null } = {}
) {
  if (!requestedTime || !Array.isArray(offeredSlots) || offeredSlots.length === 0) {
    return { kind: "none", selected: null, matches: [] };
  }

  const time = String(requestedTime);
  let matches = offeredSlots.filter(
    (slot) => String(slotTime(slot) || "") === time
  );

  if (dateIso) {
    const dateFiltered = matches.filter(
      (slot) => String(slotDate(slot) || "") === String(dateIso)
    );
    if (dateFiltered.length > 0) {
      matches = dateFiltered;
    }
  }

  if (matches.length === 0) {
    return { kind: "none", selected: null, matches: [] };
  }

  if (matches.length === 1) {
    return { kind: "unique", selected: matches[0], matches };
  }

  // Same wall time on multiple dates → ambiguous unless date narrows it.
  const distinctDates = new Set(
    matches.map((slot) => String(slotDate(slot) || "")).filter(Boolean)
  );
  if (distinctDates.size <= 1) {
    // Same date, duplicate times — treat first as unique.
    return { kind: "unique", selected: matches[0], matches: [matches[0]] };
  }

  return { kind: "ambiguous", selected: null, matches };
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
  slotDate,
  slotTime,
  slotsEqual,
  isTimeInOfferedSlots,
  resolveUniqueOfferedSlotSelection,
  STAGES,
  APPOINTMENT_STATUS,
  LANGUAGES
};
