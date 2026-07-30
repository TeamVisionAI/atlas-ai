/**
 * Shared appointment list filters — used by Appointments API and executive read models.
 * Keeps Executive Dashboard interview counts aligned with Appointments views.
 */

const { APPOINTMENT_STATUSES, APPOINTMENT_PURPOSES } = require("./configuration/appointmentDomain");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");

const ACTIVE_UPCOMING_STATUSES = Object.freeze([
  APPOINTMENT_STATUSES.SCHEDULED,
  APPOINTMENT_STATUSES.CONFIRMED,
  APPOINTMENT_STATUSES.RESCHEDULED,
  APPOINTMENT_STATUSES.PENDING_CONFIRMATION,
  APPOINTMENT_STATUSES.IN_PROGRESS,
  APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED
]);

const TERMINAL_STATUSES = Object.freeze([
  APPOINTMENT_STATUSES.COMPLETED,
  APPOINTMENT_STATUSES.CANCELLED,
  APPOINTMENT_STATUSES.NO_SHOW
]);

function startOfLocalDay(reference = new Date()) {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

function endOfLocalDay(reference = new Date()) {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    23,
    59,
    59,
    999
  );
}

function isSameLocalDay(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const target = new Date(timestampMs);
  const ref = new Date(reference);
  return (
    target.getFullYear() === ref.getFullYear() &&
    target.getMonth() === ref.getMonth() &&
    target.getDate() === ref.getDate()
  );
}

function isTomorrow(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const tomorrow = new Date(reference);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameLocalDay(timestampMs, tomorrow);
}

function resolveAppointmentViewFilters(view, reference = new Date()) {
  const nowIso = reference.toISOString();
  const todayStartIso = startOfLocalDay(reference).toISOString();
  const todayEndIso = endOfLocalDay(reference).toISOString();

  switch (view) {
    case "today":
      return {
        from: todayStartIso,
        to: todayEndIso,
        status: ACTIVE_UPCOMING_STATUSES
      };
    case "upcoming":
      return {
        from: nowIso,
        status: ACTIVE_UPCOMING_STATUSES
      };
    case "pending_confirmation":
      return {
        status: APPOINTMENT_STATUSES.PENDING_CONFIRMATION
      };
    case "human_assist":
      return {
        humanAssistRequired: true,
        status: APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED
      };
    case "completed":
      return {
        status: APPOINTMENT_STATUSES.COMPLETED
      };
    case "cancelled":
      return {
        status: APPOINTMENT_STATUSES.CANCELLED
      };
    default:
      return {};
  }
}

function normalizeStatusList(status) {
  if (!status) {
    return null;
  }

  return Array.isArray(status) ? status : [status];
}

function statusMatches(status, allowedStatuses) {
  if (!allowedStatuses || allowedStatuses.length === 0) {
    return true;
  }

  return allowedStatuses.includes(status);
}

function timestampMatchesRange(timestampMs, filters = {}) {
  if (!timestampMs) {
    return false;
  }

  const startIso = new Date(timestampMs).toISOString();

  if (filters.from && startIso < filters.from) {
    return false;
  }

  if (filters.to && startIso > filters.to) {
    return false;
  }

  return true;
}

function inferProspectAppointmentStatus(prospect) {
  if (prospect?.current_step === "CONFIRMED") {
    return APPOINTMENT_STATUSES.CONFIRMED;
  }

  if (prospect?.current_step === "EMAIL") {
    return APPOINTMENT_STATUSES.PENDING_CONFIRMATION;
  }

  return APPOINTMENT_STATUSES.SCHEDULED;
}

function inferMeetingType(prospect) {
  const interviewType = String(prospect?.interview_type || "").toLowerCase();

  if (interviewType.includes("office") || interviewType.includes("person")) {
    return "in_person";
  }

  if (interviewType.includes("phone")) {
    return "phone";
  }

  return "virtual";
}

function inferMeetingProvider(prospect) {
  const interviewType = String(prospect?.interview_type || "").toLowerCase();

  if (interviewType.includes("zoom") || interviewType.includes("virtual")) {
    return "zoom";
  }

  if (interviewType.includes("whatsapp")) {
    return "whatsapp_video";
  }

  if (inferMeetingType(prospect) === "phone") {
    return "phone_call";
  }

  return null;
}

function resolveProspectAgentId(prospect) {
  return prospect?.owner_user_id || prospect?.assigned_agent_id || null;
}

function prospectMatchesAgent(prospect, agentId) {
  if (!agentId) {
    return true;
  }

  const prospectAgentId = resolveProspectAgentId(prospect);
  return !prospectAgentId || prospectAgentId === agentId;
}

function matchesListFilters(record, filters = {}, reference = new Date()) {
  if (filters.organizationId && record.organizationId !== filters.organizationId) {
    return false;
  }

  if (filters.agentId && record.agentId && record.agentId !== filters.agentId) {
    return false;
  }

  if (filters.prospectPhone && record.prospectPhone !== filters.prospectPhone) {
    return false;
  }

  if (filters.purpose && record.purpose !== filters.purpose) {
    return false;
  }

  if (filters.meetingType && record.meetingType !== filters.meetingType) {
    return false;
  }

  if (filters.humanAssistRequired && !record.humanAssistRequired) {
    return false;
  }

  const allowedStatuses = normalizeStatusList(filters.status);

  if (!statusMatches(record.status, allowedStatuses)) {
    return false;
  }

  const timestampMs = Date.parse(record.startDateTime);
  return timestampMatchesRange(timestampMs, filters);
}

function buildProspectDerivedAppointment(prospect, organizationId, reference = new Date()) {
  const timestampMs = parseInterviewDatetime(prospect);

  if (!timestampMs) {
    return null;
  }

  const startDateTime = new Date(timestampMs).toISOString();
  const durationMinutes = 30;
  const endDateTime = new Date(timestampMs + durationMinutes * 60_000).toISOString();
  const meetingType = inferMeetingType(prospect);

  return {
    id: `prospect-derived:${prospect.phone}:${timestampMs}`,
    organizationId,
    prospectId: prospect.id || null,
    prospectPhone: prospect.phone,
    agentId: resolveProspectAgentId(prospect),
    purpose: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    status: inferProspectAppointmentStatus(prospect),
    source: "atlas_ai",
    startDateTime,
    endDateTime,
    durationMinutes,
    timezone: prospect.timezone || "America/New_York",
    meetingType,
    meetingProvider: inferMeetingProvider(prospect),
    meetingLocationType: meetingType === "in_person" ? "office" : "virtual",
    meetingLocationName: null,
    meetingAddress: null,
    meetingNotes: null,
    virtualMeetingUrl: null,
    calendarEventId: prospect.calendar_event_id || null,
    calendarProvider: prospect.calendar_event_id ? "google" : null,
    confirmationStatus: prospect.current_step === "CONFIRMED" ? "confirmed" : "pending",
    emailInvitationStatus: "pending",
    reminderStatus: "pending",
    humanAssistRequired: false,
    humanAssistReason: null,
    rescheduleCount: 0,
    cancellationReason: null,
    outcome: null,
    outcomeNotes: null,
    history: [],
    metadata: {
      derivedFromProspect: true,
      prospectName: prospect.name || prospect.phone
    },
    createdBy: resolveProspectAgentId(prospect),
    createdAt: startDateTime,
    updatedAt: startDateTime,
    derivedFromProspect: true
  };
}

function countInterviewsOnDay(prospects, queue, reference, dayMatcher) {
  const phones = new Set();

  queue.forEach((summary) => {
    const prospect = prospects.find((row) => row.phone === summary.phone);

    if (!prospect) {
      return;
    }

    const timestampMs = parseInterviewDatetime(prospect);

    if (dayMatcher(timestampMs, reference)) {
      phones.add(summary.phone);
    }
  });

  return phones.size;
}

function countTomorrowsInterviews(prospects, queue, reference = new Date()) {
  return countInterviewsOnDay(prospects, queue, reference, isTomorrow);
}

function isScheduledInterviewProspect(prospect) {
  const timestampMs = parseInterviewDatetime(prospect);
  return Boolean(timestampMs && timestampMs > Date.now() - 60_000);
}

function appointmentIdentityKey(appointment) {
  return `${appointment.prospectPhone}:${appointment.startDateTime}`;
}

module.exports = {
  ACTIVE_UPCOMING_STATUSES,
  TERMINAL_STATUSES,
  resolveAppointmentViewFilters,
  matchesListFilters,
  buildProspectDerivedAppointment,
  countTomorrowsInterviews,
  isScheduledInterviewProspect,
  isSameLocalDay,
  isTomorrow,
  parseInterviewDatetime,
  appointmentIdentityKey,
  inferProspectAppointmentStatus,
  prospectMatchesAgent,
  appointmentIdentityKey,
  inferProspectAppointmentStatus
};
