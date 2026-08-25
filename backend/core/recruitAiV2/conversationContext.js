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
    /** Invitation/contact enrichment — optional for booking (BR-117). */
    email: null,
    /** BR-090 — fixed | null */
    employmentPreference: null,
    /** BR-090 — exploring | not_now | null */
    currentFit: null,
    /**
     * BR-137 — optional prospect motivation themes (not qualification).
     * e.g. flexibility | extra_income | business_ownership | career_change |
     * learning_finance | helping_families | leadership_growth | other
     */
    prospectGoals: [],
    /** BR-137 — primary theme when material for later copy; never invented. */
    prospectGoalTheme: null,
    /** BR-143 — IUL review ad facts (not recruiting qualification). */
    iulPolicyActive: null,
    /** IUL V1 discovery A */
    policyType: null,
    /** IUL V1 discovery B */
    carrier: null,
    carrierRaw: null,
    carrierResolved: false,
    /** BR-143 C */
    originalPolicyPurpose: null,
    originalPolicyPurposeRaw: null,
    originalPurposeAsked: false,
    /** IUL V1 discovery D */
    policyAgeRange: null,
    /** IUL V1 discovery E */
    reviewReason: null,
    reviewReasonRaw: null,
    /** IUL V1 discovery F */
    documentsAvailable: null,
    /** IUL V1 scheduling */
    reviewMeetingType: null,
    reviewPreferredDayPart: null,
    reviewProposedDate: null,
    reviewProposedTime: null,
    iulWorkflowStage: null,
    iulReviewTopic: null,
    iulReviewDayPart: null,
    /** BR-157 — button-first qualification */
    iulQualificationStatus: null,
    iulReviewIntent: null,
    iulOtherDetail: null,
    iulPolicyInHand: null
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
    schemaVersion: 1,
    conversationGoal: null,
    campaignKind: null,
    campaignIntakePurpose: null,
    ctwaReferral: null
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
    },
    conversationGoal:
      patch.conversationGoal !== undefined
        ? patch.conversationGoal
        : base.conversationGoal || null,
    campaignKind:
      patch.campaignKind !== undefined ? patch.campaignKind : base.campaignKind || null,
    campaignIntakePurpose:
      patch.campaignIntakePurpose !== undefined
        ? patch.campaignIntakePurpose
        : base.campaignIntakePurpose || null,
    ctwaReferral:
      patch.ctwaReferral !== undefined ? patch.ctwaReferral : base.ctwaReferral || null
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

/**
 * BR-119 — match a day-only reply against previously offered slots.
 * Unique day → preserve that slot; multiple times same day → ambiguous (do not broaden).
 * @returns {{ kind: 'unique'|'ambiguous'|'none', selected: object|null, matches: object[] }}
 */
function resolveUniqueOfferedDaySelection(offeredSlots = [], dateIso = null) {
  if (!dateIso || !Array.isArray(offeredSlots) || offeredSlots.length === 0) {
    return { kind: "none", selected: null, matches: [] };
  }

  const matches = offeredSlots.filter(
    (slot) => String(slotDate(slot) || "") === String(dateIso)
  );

  if (matches.length === 0) {
    return { kind: "none", selected: null, matches: [] };
  }

  if (matches.length === 1) {
    return { kind: "unique", selected: matches[0], matches };
  }

  return { kind: "ambiguous", selected: null, matches };
}

/**
 * Filter previously offered slots by morning (<12) vs afternoon/evening (>=12).
 */
function filterOfferedSlotsByDayPart(offeredSlots = [], dayPart = null) {
  const part = String(dayPart || "").toLowerCase();
  if (!part || !Array.isArray(offeredSlots) || offeredSlots.length === 0) {
    return [];
  }
  return offeredSlots.filter((slot) => {
    const t = String(slotTime(slot) || "");
    if (!/^\d{2}:\d{2}$/.test(t)) {
      return false;
    }
    const hour = Number(t.slice(0, 2));
    if (part === "morning") {
      return hour < 12;
    }
    if (part === "afternoon" || part === "evening") {
      return hour >= 12;
    }
    return false;
  });
}

/**
 * BR-119 — true when every offered slot already sits on dateIso (naming that day
 * does not narrow the set further).
 */
function isOfferedSetAlreadySameDay(offeredSlots = [], dateIso = null) {
  if (!dateIso || !Array.isArray(offeredSlots) || offeredSlots.length === 0) {
    return false;
  }
  return offeredSlots.every(
    (slot) => String(slotDate(slot) || "") === String(dateIso)
  );
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
  resolveUniqueOfferedDaySelection,
  filterOfferedSlotsByDayPart,
  isOfferedSetAlreadySameDay,
  STAGES,
  APPOINTMENT_STATUS,
  LANGUAGES
};
