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
    /** BR-217 — optional US ZIP; never required for qualification. */
    zip: null,
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
    /**
     * BR-187 — bilingual | english | spanish | null.
     * Independent of preferredLanguage (conversation language).
     */
    languageAbility: null,
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
    organizationName: null,
    officeAddress: null,
    officeAddressSource: null,
    localCities: null,
    coverageCitiesSource: null,
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

function normalizeOfferedReplyText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BARE_OFFERED_SLOT_ACCEPTANCE = new Set([
  "me parece bien",
  "esta bien",
  "perfecto",
  "dale",
  "ok",
  "okay",
  "me sirve",
  "esa esta bien",
  "esa hora esta bien",
  "si",
  "yes",
  "de acuerdo",
  "va",
  "bien"
]);

/**
 * BR-239 — acceptance-only reply with no clock. Resolve only against
 * current durable offered slots; never invent a time.
 */
function isBareOfferedSlotAcceptance(text) {
  return BARE_OFFERED_SLOT_ACCEPTANCE.has(normalizeOfferedReplyText(text));
}

function isOfferedSlotConfirmationStep(context = {}) {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  return lastQ === "confirm_slot" || lastQ === "iul_confirm_review_slot";
}

/**
 * BR-239 — current durable `previouslyOfferedSlots` are the source of truth.
 * Confirmation keeps its own semantics (BR-190).
 */
function isActiveOfferedSlotResolution(context = {}) {
  const offered = context?.appointment?.previouslyOfferedSlots;
  if (!Array.isArray(offered) || offered.length === 0) {
    return false;
  }
  if (isOfferedSlotConfirmationStep(context)) {
    return false;
  }
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  const stage = String(context?.currentStage || "");
  const status = String(context?.appointment?.status || "").toLowerCase();
  if (
    stage === STAGES.SCHEDULING ||
    stage === STAGES.PROPOSED ||
    status === APPOINTMENT_STATUS.PROPOSED ||
    status === "proposed"
  ) {
    return true;
  }
  return (
    !lastQ ||
    lastQ === "offer_time_choices" ||
    lastQ === "offer_alternatives" ||
    lastQ === "offer_available_slots" ||
    lastQ === "clarify_offered_slot_time" ||
    lastQ === "clarify_offered_slot_day" ||
    lastQ === "ask_time_preference" ||
    lastQ === "ask_time_after_day_part" ||
    lastQ === "ask_time_after_constraint" ||
    lastQ === "ask_available_day" ||
    lastQ === "ask_day_part" ||
    lastQ === "awaiting_availability"
  );
}

const OFFERED_ACCEPTANCE_PREFIX =
  /^(ok|okay|perfecto|dale|me parece bien|me sirve|esta bien|puede ser|esa de las|la de las|la de|esa de|esa hora|esa)\s+/;
const OFFERED_ACCEPTANCE_SUFFIX =
  /\s+(esta bien|me parece bien|me sirve|perfecto|ok|okay|dale)$/;

function stripOfferedAcceptanceWrappers(text) {
  let remainder = text;
  for (let i = 0; i < 3; i += 1) {
    const next = remainder
      .replace(OFFERED_ACCEPTANCE_PREFIX, "")
      .replace(OFFERED_ACCEPTANCE_SUFFIX, "")
      .trim();
    if (next === remainder) {
      break;
    }
    remainder = next;
  }
  return remainder;
}

/**
 * BR-239 — extract a spoken clock from acceptance-wrapped replies
 * ("11:45 está bien", "Ok 4:00", "a las 4"). Returns a token the
 * offered-slot matcher can resolve; does not invent AM/PM.
 */
function extractOfferedReplyClockToken(text) {
  const normalized = normalizeOfferedReplyText(text);
  if (!normalized || isBareOfferedSlotAcceptance(normalized)) {
    return null;
  }
  const remainder = stripOfferedAcceptanceWrappers(normalized);
  const clock = remainder.match(
    /^(?:a las\s+)?(\d{1,2})(?::(\d{2}))?(?:\s*(a\.?m\.?|p\.?m\.?))?$/
  );
  if (!clock) {
    return null;
  }
  const hour = Number(clock[1]);
  const minute = clock[2] != null ? Number(clock[2]) : 0;
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) {
    return null;
  }
  let meridiem = null;
  if (clock[3]) {
    meridiem = clock[3].replace(/\./g, "").startsWith("p") ? "pm" : "am";
  }
  if (meridiem) {
    let hour24 = hour;
    if (meridiem === "pm" && hour24 < 12) {
      hour24 += 12;
    }
    if (meridiem === "am" && hour24 === 12) {
      hour24 = 0;
    }
    return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function parseSpokenClockToken(requestedTime) {
  const token = String(requestedTime || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
  const match = token.match(/^(\d{1,2})(?::(\d{2}))?(a\.?m\.?|p\.?m\.?)?$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = match[2] != null ? Number(match[2]) : 0;
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) {
    return null;
  }
  let meridiem = null;
  if (match[3]) {
    meridiem = match[3].replace(/\./g, "").startsWith("p") ? "pm" : "am";
  }
  return { hour, minute, meridiem };
}

function slotMatchesSpokenClock(slot, clock) {
  const time = String(slotTime(slot) || "");
  if (!/^\d{2}:\d{2}$/.test(time) || !clock) {
    return false;
  }
  const hour24 = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  if (minute !== clock.minute) {
    return false;
  }
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const slotMeridiem = hour24 >= 12 ? "pm" : "am";
  const spokenHour12 =
    clock.hour === 0 ? 12 : clock.hour > 12 ? clock.hour - 12 : clock.hour;
  if (clock.meridiem) {
    return hour12 === spokenHour12 && slotMeridiem === clock.meridiem;
  }
  return hour12 === spokenHour12;
}

function finalizeOfferedSlotMatches(matches, dateIso = null) {
  let narrowed = matches;
  if (dateIso) {
    const dateFiltered = matches.filter(
      (slot) => String(slotDate(slot) || "") === String(dateIso)
    );
    if (dateFiltered.length > 0) {
      narrowed = dateFiltered;
    }
  }

  if (narrowed.length === 0) {
    return { kind: "none", selected: null, matches: [] };
  }

  if (narrowed.length === 1) {
    return { kind: "unique", selected: narrowed[0], matches: narrowed };
  }

  const distinctDates = new Set(
    narrowed.map((slot) => String(slotDate(slot) || "")).filter(Boolean)
  );
  if (distinctDates.size <= 1) {
    return { kind: "unique", selected: narrowed[0], matches: [narrowed[0]] };
  }

  return { kind: "ambiguous", selected: null, matches: narrowed };
}

/**
 * BR-115 / BR-239 — match a natural/spoken time against previously offered slots.
 * Optional dateIso narrows to one calendar day (e.g. "domingo 7:30").
 * Offered-slot context resolves AM/PM when exactly one clock matches.
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
  const exact = offeredSlots.filter((slot) => String(slotTime(slot) || "") === time);
  if (exact.length > 0) {
    return finalizeOfferedSlotMatches(exact, dateIso);
  }

  // Implements BR-239 — "4" / "4:00" / "04:00" bind only to offered clocks.
  const clock = parseSpokenClockToken(requestedTime);
  if (!clock) {
    return { kind: "none", selected: null, matches: [] };
  }
  const spokenMatches = offeredSlots.filter((slot) =>
    slotMatchesSpokenClock(slot, clock)
  );
  return finalizeOfferedSlotMatches(spokenMatches, dateIso);
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
 * Filter previously offered slots by morning (<12), afternoon (after 12:00),
 * or evening (>=17). Noon is not afternoon (BR-164).
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
    const minute = Number(t.slice(3, 5) || 0);
    const minutes = hour * 60 + minute;
    if (part === "morning") {
      return minutes < 12 * 60;
    }
    if (part === "afternoon") {
      return minutes > 12 * 60;
    }
    if (part === "evening") {
      return minutes >= 17 * 60;
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
  isBareOfferedSlotAcceptance,
  isActiveOfferedSlotResolution,
  extractOfferedReplyClockToken,
  resolveUniqueOfferedSlotSelection,
  resolveUniqueOfferedDaySelection,
  filterOfferedSlotsByDayPart,
  isOfferedSetAlreadySameDay,
  STAGES,
  APPOINTMENT_STATUS,
  LANGUAGES
};
