const { PHASES, parseSchedulingState } = require("./schedulingState");
const {
  evaluateInterviewTypeDecision,
  evaluateCoverage
} = require("./businessRulesEngine");
const { applyBusinessRulesToProfile } = require("./businessRulesApplicator");
const {
  defaultCaptureState,
  parseQualificationCapture,
  isCityExplicitlyCaptured,
  isStateExplicitlyCaptured,
  isAuthorizationExplicitlyCaptured,
  isInterviewTypeExplicitlyCaptured,
  isDayPartExplicitlyCaptured,
  isNameExplicitlyCaptured,
  isEmailStepComplete,
  isLocationExplicitlyComplete,
  explainSchedulingEligibility
} = require("./qualificationCaptureState");

const PRE_SCHEDULE_FIELDS = new Set([
  "city",
  "state",
  "authorization",
  "interviewType",
  "dayPart"
]);

const FIELD_ORDER = [
  "city",
  "state",
  "authorization",
  "interviewType",
  "dayPart",
  "schedule",
  "name",
  "email"
];

function extractEmailFromNotes(notes) {
  if (!notes) {
    return null;
  }

  const stored = String(notes).match(/EMAIL:([^|]+)/i);
  if (stored) {
    return stored[1].trim();
  }

  const value = String(notes).trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (emailPattern.test(value)) {
    return value;
  }

  return null;
}

function resolveDayPartFromNotes(notes) {
  const dayPartMatch = String(notes || "").match(/DAY_PART:([^|]+)/i);

  if (dayPartMatch) {
    return dayPartMatch[1].trim();
  }

  const schedulingState = parseSchedulingState(notes);
  return schedulingState?.period || null;
}

function deriveDayPartFromTimeKey(timeKey) {
  if (!timeKey || typeof timeKey !== "string") {
    return null;
  }

  const [hours] = timeKey.split(":").map(Number);

  if (Number.isNaN(hours)) {
    return null;
  }

  return hours < 12 ? "morning" : "afternoon";
}

function mergeDayPartIntoNotes(notes, dayPart) {
  if (!dayPart) {
    return notes || null;
  }

  const remainder = String(notes || "")
    .replace(/\|?DAY_PART:[^|]*/i, "")
    .replace(/^\|+/, "")
    .trim();
  const segment = `DAY_PART:${dayPart}`;

  if (!remainder) {
    return segment;
  }

  return `${segment}|${remainder}`;
}

function buildProfileFromProspect(prospect, channel = "whatsapp") {
  if (!prospect) {
    return createEmptyProfile(channel);
  }

  const notes = prospect.notes || null;
  const schedulingState = parseSchedulingState(notes);

  return {
    city: prospect.city || null,
    state: prospect.state || null,
    authorization:
      prospect.work_authorized === null || prospect.work_authorized === undefined
        ? null
        : prospect.work_authorized,
    occupation: prospect.occupation || null,
    interviewType: prospect.interview_type || null,
    dayPart: resolveDayPartFromNotes(notes),
    preferredDay: schedulingState?.selectedDay || null,
    preferredTime: prospect.interview_time || null,
    email: extractEmailFromNotes(notes),
    name: prospect.name || null,
    appointmentDate: prospect.appointment_date || null,
    calendarEventId: prospect.calendar_event_id || null,
    confirmed: Boolean(prospect.calendar_event_id),
    channel,
    schedulingPhase: prospect.appointment_type || null
  };
}

function createEmptyProfile(channel = "whatsapp") {
  return {
    city: null,
    state: null,
    authorization: null,
    occupation: null,
    interviewType: null,
    dayPart: null,
    preferredDay: null,
    preferredTime: null,
    email: null,
    name: null,
    appointmentDate: null,
    calendarEventId: null,
    confirmed: false,
    channel,
    schedulingPhase: null
  };
}

function mergeProfile(existing, extracted, options = {}) {
  const overwriteKeys = new Set(options.overwriteKeys || []);
  const merged = { ...existing };

  Object.entries(extracted || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    const targetKey = key === "preferredPeriod" ? "dayPart" : key;

    if (
      overwriteKeys.has(targetKey) ||
      merged[targetKey] === null ||
      merged[targetKey] === undefined ||
      merged[targetKey] === ""
    ) {
      merged[targetKey] = value;
    }
  });

  return merged;
}

function resolveInterviewTypeDecision(profile, message = "") {
  return evaluateInterviewTypeDecision({
    city: profile.city,
    state: profile.state,
    requestedType: profile.interviewType,
    currentType: profile.interviewType,
    message
  });
}

function getEffectiveInterviewType(profile, message = "", options = {}) {
  if (profile.interviewType) {
    return profile.interviewType;
  }

  const notes = options.notes || null;
  const captureState = options.captureState || defaultCaptureState();

  if (!isLocationExplicitlyComplete(profile, captureState, notes)) {
    return null;
  }

  if (!isAuthorizationExplicitlyCaptured(profile, captureState, notes)) {
    return null;
  }

  if (profile.authorization === false) {
    return null;
  }

  const decision = evaluateInterviewTypeDecision({
    city: profile.city,
    state: profile.state,
    currentType: null,
    message
  });

  return decision.interviewType || null;
}

function isInterviewTypeRequired(profile, options = {}) {
  const notes = options.notes || null;
  const captureState = options.captureState || defaultCaptureState();

  if (!isLocationExplicitlyComplete(profile, captureState, notes)) {
    return false;
  }

  if (!isAuthorizationExplicitlyCaptured(profile, captureState, notes)) {
    return false;
  }

  return !isInterviewTypeExplicitlyCaptured(profile, captureState, notes);
}

function emailRequired(_profile) {
  return false;
}

function isScheduleComplete(profile) {
  return Boolean(profile.appointmentDate && profile.preferredTime);
}

function sortMissingFields(missing) {
  return missing
    .filter((field, index, list) => list.indexOf(field) === index)
    .sort((left, right) => FIELD_ORDER.indexOf(left) - FIELD_ORDER.indexOf(right));
}

function getMissingFields(profile, options = {}) {
  if (profile.calendarEventId) {
    return [];
  }

  const notes = options.notes || null;
  const captureState = options.captureState || defaultCaptureState();
  const missing = [];

  if (!isCityExplicitlyCaptured(profile, captureState, notes)) {
    missing.push("city");
  }

  if (
    isCityExplicitlyCaptured(profile, captureState, notes) &&
    !isStateExplicitlyCaptured(profile, captureState, notes)
  ) {
    missing.push("state");
  }

  if (!isLocationExplicitlyComplete(profile, captureState, notes)) {
    return sortMissingFields(missing);
  }

  if (!isAuthorizationExplicitlyCaptured(profile, captureState, notes)) {
    missing.push("authorization");
    return sortMissingFields(missing);
  }

  if (profile.authorization === false) {
    return sortMissingFields(missing);
  }

  if (!isInterviewTypeExplicitlyCaptured(profile, captureState, notes)) {
    missing.push("interviewType");
    return sortMissingFields(missing);
  }

  if (!isDayPartExplicitlyCaptured(profile, captureState, notes)) {
    missing.push("dayPart");
  }

  const effectiveInterviewType = profile.interviewType || getEffectiveInterviewType(profile, "", { notes, captureState });

  if (effectiveInterviewType && !isScheduleComplete(profile)) {
    missing.push("schedule");
  }

  if (isScheduleComplete(profile) && !isNameExplicitlyCaptured(profile, captureState, notes)) {
    missing.push("name");
  }

  if (
    isScheduleComplete(profile) &&
    isNameExplicitlyCaptured(profile, captureState, notes) &&
    !isEmailStepComplete(profile, captureState, notes)
  ) {
    missing.push("email");
  }

  return sortMissingFields(missing);
}

function getNextMissingField(profile, options = {}) {
  const missing = getMissingFields(profile, options);
  return missing[0] || null;
}

function getPreScheduleMissingFields(profile, options = {}) {
  return getMissingFields(profile, options).filter((field) => PRE_SCHEDULE_FIELDS.has(field));
}

function isPreScheduleQualificationComplete(profile, options = {}) {
  return (
    getPreScheduleMissingFields(profile, options).length === 0 &&
    Boolean(getEffectiveInterviewType(profile, "", options))
  );
}

function canBeginScheduling(profile, options = {}) {
  const notes = options.notes || null;
  const captureState = options.captureState || defaultCaptureState();

  return (
    isDayPartExplicitlyCaptured(profile, captureState, notes) &&
    isInterviewTypeExplicitlyCaptured(profile, captureState, notes) &&
    isPreScheduleQualificationComplete(profile, options) &&
    !isScheduleComplete(profile)
  );
}

function resolveIsLocal(profile) {
  if (!profile?.city) {
    return null;
  }

  return evaluateCoverage({ city: profile.city, state: profile.state }).coverage === "LOCAL";
}

function buildQualificationBrain(prospect, options = {}) {
  const channel = options.channel || "whatsapp";
  const schedulingState =
    options.schedulingState !== undefined
      ? options.schedulingState
      : parseSchedulingState(prospect?.notes);
  const message = options.message || "";
  const captureState =
    options.captureState !== undefined
      ? options.captureState
      : parseQualificationCapture(prospect?.notes);
  const brainOptions = {
    notes: prospect?.notes || null,
    captureState
  };

  let profile = buildProfileFromProspect(prospect, channel);

  if (
    options.applyRules !== false &&
    isLocationExplicitlyComplete(profile, captureState, prospect?.notes) &&
    isAuthorizationExplicitlyCaptured(profile, captureState, prospect?.notes) &&
    profile.authorization !== false
  ) {
    const rules = applyBusinessRulesToProfile(
      { ...profile },
      message,
      options.extractedType || null
    );
    profile = rules.profile;
  }

  const missingFields = getMissingFields(profile, brainOptions);
  const nextField = getNextMissingField(profile, brainOptions);
  const currentStep = deriveCurrentStep(profile, schedulingState, brainOptions);
  const interviewType = getEffectiveInterviewType(profile, message, brainOptions);
  const preScheduleFields = getPreScheduleMissingFields(profile, brainOptions);
  const schedulingEligible = canBeginScheduling(profile, brainOptions);
  const isLocal = resolveIsLocal(profile);

  return {
    profile,
    missingFields,
    nextField,
    currentStep,
    interviewType,
    dayPart: profile.dayPart,
    preScheduleFields,
    captureState,
    schedulingState,
    isLocal,
    isPreScheduleQualificationComplete: isPreScheduleQualificationComplete(profile, brainOptions),
    canBeginScheduling: schedulingEligible,
    schedulingEligibleReason: explainSchedulingEligibility(
      profile,
      captureState,
      prospect?.notes || null,
      missingFields
    ),
    isScheduleComplete: isScheduleComplete(profile),
    calendarChecked: Boolean(schedulingState?.offeredTimes?.length || schedulingState?.offeredDays?.length),
    handoffRequired: false,
    handoffReason: null
  };
}

function deriveCurrentStep(profile, schedulingState, options = {}) {
  if (profile.calendarEventId) {
    return "CONFIRMED";
  }

  const nextField = getNextMissingField(profile, options);

  switch (nextField) {
    case "city":
    case "state":
      return "GREETING";
    case "authorization":
      return "WORK_AUTHORIZATION";
    case "interviewType":
      return "INTERVIEW_TYPE";
    case "dayPart":
      return "DAY_PART";
    case "schedule":
      return schedulingState?.phase ? "SCHEDULE" : "DAY_PART";
    case "name":
      return "NAME";
    case "email":
      return "EMAIL";
    default:
      break;
  }

  if (isScheduleComplete(profile) && nextField === null) {
    return "EMAIL";
  }

  return nextField || "GREETING";
}

function profileToProspectUpdates(profile, schedulingState = null, options = {}) {
  const updates = {
    city: profile.city,
    state: profile.state,
    work_authorized: profile.authorization,
    occupation: profile.occupation,
    interview_type: profile.interviewType,
    interview_time: profile.preferredTime,
    appointment_date: profile.appointmentDate,
    name: profile.name,
    current_step: deriveCurrentStep(profile, schedulingState, options),
    appointment_type: profile.schedulingPhase
  };

  if (profile.email) {
    updates.notes = schedulingState
      ? require("./schedulingState").mergeNotesWithSchedulingState(
          `EMAIL:${profile.email}`,
          schedulingState
        )
      : `EMAIL:${profile.email}`;
  }

  return updates;
}

module.exports = {
  FIELD_ORDER,
  PRE_SCHEDULE_FIELDS,
  buildProfileFromProspect,
  createEmptyProfile,
  mergeProfile,
  getMissingFields,
  getNextMissingField,
  getPreScheduleMissingFields,
  isPreScheduleQualificationComplete,
  canBeginScheduling,
  buildQualificationBrain,
  deriveCurrentStep,
  profileToProspectUpdates,
  extractEmailFromNotes,
  getEffectiveInterviewType,
  isInterviewTypeRequired,
  resolveInterviewTypeDecision,
  resolveIsLocal,
  emailRequired,
  isScheduleComplete,
  deriveDayPartFromTimeKey,
  mergeDayPartIntoNotes
};
