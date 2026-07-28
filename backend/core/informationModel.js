const { PHASES, parseSchedulingState } = require("./schedulingState");
const {
  evaluateInterviewTypeDecision,
  isInterviewTypeChoiceRequired
} = require("./businessRulesEngine");
const { applyBusinessRulesToProfile } = require("./businessRulesApplicator");

const PRE_SCHEDULE_FIELDS = new Set([
  "authorization",
  "occupation",
  "city",
  "state",
  "interviewType"
]);

const FIELD_ORDER = [
  "authorization",
  "occupation",
  "city",
  "state",
  "interviewType",
  "schedule",
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

function buildProfileFromProspect(prospect, channel = "whatsapp") {
  if (!prospect) {
    return createEmptyProfile(channel);
  }

  return {
    city: prospect.city || null,
    state: prospect.state || null,
    authorization:
      prospect.work_authorized === null || prospect.work_authorized === undefined
        ? null
        : prospect.work_authorized,
    occupation: prospect.occupation || null,
    interviewType: prospect.interview_type || null,
    preferredDay: null,
    preferredTime: prospect.interview_time || null,
    email: extractEmailFromNotes(prospect.notes),
    appointmentDate: prospect.appointment_date || null,
    calendarEventId: prospect.calendar_event_id || null,
    confirmed: prospect.current_step === "CONFIRMED",
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
    preferredDay: null,
    preferredTime: null,
    email: null,
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

    if (
      overwriteKeys.has(key) ||
      merged[key] === null ||
      merged[key] === undefined ||
      merged[key] === ""
    ) {
      merged[key] = value;
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

function getEffectiveInterviewType(profile, message = "") {
  if (profile.interviewType) {
    return profile.interviewType;
  }

  const decision = evaluateInterviewTypeDecision({
    city: profile.city,
    state: profile.state,
    currentType: null,
    message
  });

  return decision.interviewType || null;
}

function isInterviewTypeRequired(profile) {
  return isInterviewTypeChoiceRequired({
    city: profile.city,
    state: profile.state,
    interviewType: profile.interviewType
  });
}

function emailRequired(_profile) {
  // Sprint 11.4 MVP — email never blocks scheduling; used only for calendar invites when provided.
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

function getMissingFields(profile) {
  if (profile.confirmed || profile.calendarEventId) {
    return [];
  }

  const missing = [];

  if (profile.authorization === null || profile.authorization === undefined) {
    missing.push("authorization");
  }

  if (!profile.occupation) {
    missing.push("occupation");
  }

  if (!profile.city) {
    missing.push("city");
  }

  if (profile.city && !profile.state) {
    missing.push("state");
  }

  if (isInterviewTypeRequired(profile)) {
    missing.push("interviewType");
  }

  const effectiveInterviewType = getEffectiveInterviewType(profile);

  if (effectiveInterviewType && !isScheduleComplete(profile)) {
    missing.push("schedule");
  }

  if (
    emailRequired({ ...profile, interviewType: effectiveInterviewType }) &&
    isScheduleComplete(profile) &&
    !profile.email
  ) {
    missing.push("email");
  }

  return sortMissingFields(missing);
}

function getNextMissingField(profile) {
  const missing = getMissingFields(profile);
  return missing[0] || null;
}

function getPreScheduleMissingFields(profile) {
  return getMissingFields(profile).filter((field) => PRE_SCHEDULE_FIELDS.has(field));
}

function isPreScheduleQualificationComplete(profile) {
  return getPreScheduleMissingFields(profile).length === 0 && Boolean(getEffectiveInterviewType(profile));
}

function canBeginScheduling(profile) {
  return isPreScheduleQualificationComplete(profile) && !isScheduleComplete(profile);
}

function buildQualificationBrain(prospect, options = {}) {
  const channel = options.channel || "whatsapp";
  const schedulingState =
    options.schedulingState !== undefined
      ? options.schedulingState
      : parseSchedulingState(prospect?.notes);
  const message = options.message || "";

  let profile = buildProfileFromProspect(prospect, channel);

  if (options.applyRules !== false && profile.city) {
    const rules = applyBusinessRulesToProfile(
      { ...profile },
      message,
      options.extractedType || null
    );
    profile = rules.profile;
  }

  const missingFields = getMissingFields(profile);
  const nextField = getNextMissingField(profile);
  const currentStep = deriveCurrentStep(profile, schedulingState);
  const interviewType = getEffectiveInterviewType(profile, message);
  const preScheduleFields = getPreScheduleMissingFields(profile);

  return {
    profile,
    missingFields,
    nextField,
    currentStep,
    interviewType,
    preScheduleFields,
    schedulingState,
    isPreScheduleQualificationComplete: isPreScheduleQualificationComplete(profile),
    canBeginScheduling: canBeginScheduling(profile),
    isScheduleComplete: isScheduleComplete(profile)
  };
}

function deriveCurrentStep(profile, schedulingState) {
  if (profile.confirmed || profile.calendarEventId) {
    return "CONFIRMED";
  }

  const nextField = getNextMissingField(profile);

  switch (nextField) {
    case "authorization":
      return "WORK_AUTHORIZATION";
    case "occupation":
      return "OCCUPATION";
    case "city":
    case "state":
      return "GREETING";
    case "interviewType":
      return "INTERVIEW_TYPE";
    case "schedule":
      return schedulingState?.phase ? "SCHEDULE" : "INTERVIEW_TYPE";
    case "email":
      return "EMAIL";
    default:
      break;
  }

  if (isScheduleComplete(profile) && !emailRequired(profile)) {
    return "EMAIL";
  }

  return "CONFIRMED";
}

function profileToProspectUpdates(profile, schedulingState = null) {
  const updates = {
    city: profile.city,
    state: profile.state,
    work_authorized: profile.authorization,
    occupation: profile.occupation,
    interview_type: profile.interviewType,
    interview_time: profile.preferredTime,
    appointment_date: profile.appointmentDate,
    current_step: deriveCurrentStep(profile, schedulingState),
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
  emailRequired,
  isScheduleComplete
};
