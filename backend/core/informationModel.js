const { PHASES } = require("./schedulingState");
const {
  evaluateInterviewTypeDecision,
  isInterviewTypeChoiceRequired
} = require("./businessRulesEngine");

const FIELD_ORDER = [
  "city",
  "state",
  "authorization",
  "occupation",
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
    confirmed:
      prospect.current_step === "CONFIRMED" ||
      prospect.current_step === "APPOINTMENT_BOOKED",
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

function mergeProfile(existing, extracted) {
  const merged = { ...existing };

  Object.entries(extracted || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    if (merged[key] === null || merged[key] === undefined || merged[key] === "") {
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

  return decision.interviewType;
}

function isInterviewTypeRequired(profile) {
  return isInterviewTypeChoiceRequired({
    city: profile.city,
    interviewType: profile.interviewType
  });
}

function emailRequired(profile) {
  return getEffectiveInterviewType(profile) === "Zoom";
}

function isScheduleComplete(profile) {
  return Boolean(profile.appointmentDate && profile.preferredTime);
}

function getMissingFields(profile) {
  if (profile.confirmed || profile.calendarEventId) {
    return [];
  }

  const missing = [];

  if (!profile.city) {
    missing.push("city");
  }

  if (profile.city && !profile.state) {
    missing.push("state");
  }

  if (profile.authorization === null) {
    missing.push("authorization");
  }

  if (!profile.occupation) {
    missing.push("occupation");
  }

  if (isInterviewTypeRequired(profile)) {
    missing.push("interviewType");
  }

  const effectiveInterviewType = getEffectiveInterviewType(profile);

  if (effectiveInterviewType && !isScheduleComplete(profile)) {
    missing.push("schedule");
  }

  if (emailRequired({ ...profile, interviewType: effectiveInterviewType }) && isScheduleComplete(profile) && !profile.email) {
    missing.push("email");
  }

  return missing.filter((field, index, list) => list.indexOf(field) === index);
}

function getNextMissingField(profile) {
  const missing = getMissingFields(profile);
  return missing.sort(
    (left, right) => FIELD_ORDER.indexOf(left) - FIELD_ORDER.indexOf(right)
  )[0] || null;
}

function deriveCurrentStep(profile, schedulingState, prospect = null) {
  if (prospect?.current_step === "APPOINTMENT_BOOKED") {
    return "APPOINTMENT_BOOKED";
  }

  if (profile.confirmed || profile.calendarEventId) {
    return "CONFIRMED";
  }

  const missing = getMissingFields(profile);

  if (missing.includes("city") || missing.includes("state")) {
    return "GREETING";
  }

  if (missing.includes("authorization")) {
    return "WORK_AUTHORIZATION";
  }

  if (missing.includes("occupation")) {
    return "OCCUPATION";
  }

  if (missing.includes("interviewType")) {
    return "INTERVIEW_TYPE";
  }

  if (missing.includes("schedule")) {
    if (schedulingState?.phase) {
      return "SCHEDULE";
    }

    return "INTERVIEW_TYPE";
  }

  if (missing.includes("email")) {
    return "EMAIL";
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
  buildProfileFromProspect,
  createEmptyProfile,
  mergeProfile,
  getMissingFields,
  getNextMissingField,
  deriveCurrentStep,
  profileToProspectUpdates,
  extractEmailFromNotes,
  getEffectiveInterviewType,
  isInterviewTypeRequired,
  resolveInterviewTypeDecision,
  emailRequired,
  isScheduleComplete
};
