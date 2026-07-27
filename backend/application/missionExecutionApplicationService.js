/**
 * Sprint 21 — Mission Execution application service.
 * Orchestrates executable missions without modifying Mission Engine or Workflow Engine core logic.
 */

const { updateProspect } = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const {
  scheduleAppointment,
  cancelAppointment,
  APPOINTMENT_TYPES
} = require("../services/schedulingService");
const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
const { onInterviewScheduled } = require("../core/recruitingWorkflowOrchestrator");
const { buildAgentActionTimelineMessage } = require("../core/agentActionCopy");
const { ACTION_IDS } = require("../core/agentActionEngine");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");
const { MILESTONES } = require("../core/workflowConstants");
const { isProductionProspect } = require("../core/productionProspectFilter");
const {
  requireTenantOrganizationId,
  isTenantScopedRequest
} = require("../core/tenantProspectLookup");
const {
  findProspectInOrganization,
  findProspectForSystemIngress
} = require("../services/supabaseService");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const { shouldMockExternalComms } = require("../dev/simulatorGuard");
const { buildIsoTimestamp } = require("../services/availabilityService");
const meetingManagementService = require("../services/meetingManagementService");
const appointmentApplicationService = require("./appointmentApplicationService");
const { APPOINTMENT_SOURCES } = require("../core/configuration/appointmentDomain");
const { extractEmailFromNotes } = require("../core/informationModel");
const { normalizeEmail, validateEmailFormat } = require("../core/emailNormalization");
const {
  buildActionError,
  buildActionSuccess
} = require("./agentActionApplicationService");

function normalizeInterviewType(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual") || normalized.includes("google meet")) {
    return "Zoom";
  }

  if (normalized.includes("public")) {
    return "Public Location";
  }

  return "In Person";
}

async function resolveTenantProspect(phone, options = {}) {
  const tenantScoped = isTenantScopedRequest(options);

  if (tenantScoped) {
    const organizationId = requireTenantOrganizationId(options.organizationId);
    return findProspectInOrganization(phone, organizationId);
  }

  if (options.organizationId) {
    return findProspectInOrganization(phone, options.organizationId);
  }

  return findProspectForSystemIngress(phone);
}

async function logAgentTimeline(prospect, message) {
  await logConversation({
    phone: prospect.phone,
    name: prospect.name,
    direction: "outgoing",
    message,
    intent: "AGENT_ACTION",
    pipeline: "AGENT",
    currentStep: prospect.current_step || "AGENT",
    language: prospect.language || "en",
    city: prospect.city,
    state: prospect.state
  });
}

function validateSchedulePayload(payload = {}) {
  const missing = [];

  if (!payload.dateKey) {
    missing.push("dateKey");
  }

  if (!payload.timeKey) {
    missing.push("timeKey");
  }

  if (!payload.interviewType) {
    missing.push("interviewType");
  }

  return missing;
}

function resolveProspectEmail(prospect, payload = {}) {
  const payloadEmail = normalizeEmail(payload.email);
  if (payloadEmail && validateEmailFormat(payloadEmail)) {
    return payloadEmail;
  }

  const storedEmail = normalizeEmail(extractEmailFromNotes(prospect?.notes));
  if (storedEmail && validateEmailFormat(storedEmail)) {
    return storedEmail;
  }

  return null;
}

function buildProspectNotesWithEmail(existingNotes, email) {
  if (!email) {
    return existingNotes || null;
  }

  const base = String(existingNotes || "")
    .replace(/\|?EMAIL:[^|]*/gi, "")
    .trim();

  const emailToken = `EMAIL:${email}`;
  return base ? `${base}|${emailToken}` : emailToken;
}

async function rollbackScheduleBooking(bookingResult, organizationId, prospect) {
  if (!bookingResult?.startTimeISO) {
    return;
  }

  await cancelAppointment({
    appointmentType: APPOINTMENT_TYPES.INTERVIEW,
    startTimeISO: bookingResult.startTimeISO,
    googleCalendarEventId: bookingResult.googleCalendarEventId,
    organizationId
  }).catch(() => {});

  await updateProspect(prospect.phone, {
    calendar_event_id: prospect.calendar_event_id || null,
    appointment_date: prospect.appointment_date || null,
    interview_time: prospect.interview_time || null,
    interview_type: prospect.interview_type || null,
    current_step: prospect.current_step || "SCHEDULE"
  }).catch(() => {});
}

/**
 * Executes Schedule Interview mission end-to-end.
 * Calendar failure → no workflow update. Workflow failure → calendar booking rolled back.
 */
async function executeScheduleInterview(phone, payload = {}, options = {}) {
  const missing = validateSchedulePayload(payload);

  if (missing.length) {
    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "VALIDATION_FAILED",
      `Missing required fields: ${missing.join(", ")}`
    );
  }

  if (!isProductionProspect(phone)) {
    return buildActionError(ACTION_IDS.SCHEDULE, "PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const organizationId = requireTenantOrganizationId(options.organizationId);
  const prospect = await resolveTenantProspect(phone, options);

  if (!prospect) {
    return buildActionError(ACTION_IDS.SCHEDULE, "PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const interviewType = normalizeInterviewType(payload.interviewType);
  const duration = Number(payload.duration) || 30;
  const isZoom = interviewType === "Zoom";
  const isPublicLocation = interviewType === "Public Location";
  const attendeeEmail = resolveProspectEmail(prospect, payload);

  const locationResult = await meetingManagementService.resolveInterviewLocation(
    organizationId,
    interviewType,
    {
      publicLocation: payload.publicLocation,
      officeLocation: payload.officeLocation
    }
  );

  if (!locationResult.configured) {
    const errorCode =
      locationResult.errorCode === "MEETING_URL_NOT_CONFIGURED"
        ? "MEETING_URL_NOT_CONFIGURED"
        : "OFFICE_LOCATION_REQUIRED";
    const message =
      locationResult.errorCode === "MEETING_URL_NOT_CONFIGURED"
        ? "Personal meeting URL is not configured. Add it under Organization → Meeting Management."
        : "Office address is not configured. Add it under Organization → Meeting Management.";

    return buildActionError(ACTION_IDS.SCHEDULE, errorCode, message);
  }

  const location = locationResult.location;
  const meetingUrl = locationResult.meetingUrl;

  let bookingResult;

  try {
    bookingResult = await scheduleAppointment({
      organizationId,
      appointmentType: APPOINTMENT_TYPES.INTERVIEW,
      dateKey: payload.dateKey,
      timeKey: payload.timeKey,
      duration,
      metadata: {
        name: prospect.name,
        prospectName: prospect.name,
        phone: prospect.phone,
        notes: payload.notes || null,
        interviewType,
        recruiter: payload.recruiter || null,
        location: isZoom ? meetingUrl : location,
        meetingUrl: isZoom ? meetingUrl : null,
        zoomUrl: isZoom ? meetingUrl : null,
        attendeeEmail
      },
      timezone: payload.timezone || "America/New_York"
    });
  } catch (calendarError) {
    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "CALENDAR_FAILED",
      calendarError.message || "Google Calendar failed to create the meeting invitation."
    );
  }

  if (!bookingResult.success) {
    return buildActionError(
      ACTION_IDS.SCHEDULE,
      bookingResult.reason || "UNAVAILABLE",
      "Selected time is no longer available. Choose another slot and try again."
    );
  }

  const calendarStatus = await googleCalendarIntegrationService.getIntegrationStatus(organizationId);

  if (
    calendarStatus?.connected &&
    !bookingResult.googleCalendarEventId &&
    !shouldMockExternalComms()
  ) {
    await rollbackScheduleBooking(bookingResult, organizationId, prospect);

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "CALENDAR_FAILED",
      "Google Calendar is connected but the meeting invitation could not be created."
    );
  }

  const prospectUpdates = {
    calendar_event_id: bookingResult.googleCalendarEventId,
    appointment_date: bookingResult.startTimeISO,
    interview_time: bookingResult.startTimeISO,
    interview_type: interviewType,
    current_step: "CONFIRMED"
  };

  if (attendeeEmail) {
    prospectUpdates.notes = buildProspectNotesWithEmail(prospect.notes, attendeeEmail);
  }

  await updateProspect(prospect.phone, prospectUpdates);

  const advanceResult = await advanceProspectWorkflow(phone, {
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    capturedFields: {
      interviewDateTime: bookingResult.startTimeISO,
      interviewType,
      confirmed: true,
      appointmentDate: payload.dateKey,
      preferredTime: payload.timeKey,
      email: attendeeEmail || undefined
    },
    interactionNotes: payload.notes || null,
    interactionType: "agent_schedule"
  });

  if (!advanceResult.success) {
    await rollbackScheduleBooking(bookingResult, organizationId, prospect);

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      advanceResult.error || "WORKFLOW_ADVANCE_FAILED",
      advanceResult.message || "Unable to advance workflow after scheduling."
    );
  }

  const updatedProspect = (await resolveTenantProspect(phone, options)) || prospect;

  await onInterviewScheduled({
    phone,
    prospect: updatedProspect,
    profile: {
      appointmentDate: payload.dateKey,
      interviewType,
      preferredTime: payload.timeKey,
      email: attendeeEmail || null
    },
    calendarEvent: {
      id: bookingResult.googleCalendarEventId,
      zoomLink: bookingResult.zoomLink || bookingResult.meetingUrl || meetingUrl,
      meetingUrl: bookingResult.meetingUrl || bookingResult.zoomLink || meetingUrl
    }
  }).catch((error) => {
    console.warn("[missionExecution] onInterviewScheduled failed:", error.message);
  });

  await logAgentTimeline(
    updatedProspect,
    buildAgentActionTimelineMessage(
      `Interview scheduled for ${payload.dateKey} at ${payload.timeKey} (${interviewType})`
    )
  );

  let appointmentRecord = null;

  try {
    appointmentRecord = await appointmentApplicationService.createAppointment(
      {
        organizationId,
        agentId: options.userId || options.agentId,
        prospectPhone: phone,
        purpose: "recruiting_interview",
        dateKey: payload.dateKey,
        timeKey: payload.timeKey,
        source: APPOINTMENT_SOURCES.MISSION_CONTROL,
        meetingType: isZoom ? "virtual" : "in_person",
        meetingProvider: isZoom ? "zoom" : undefined,
        meetingLocationType: isPublicLocation ? "public_location" : "office",
        meetingAddress: isZoom ? null : location,
        notes: payload.notes,
        contact: attendeeEmail ? { email: attendeeEmail } : {},
        existingBooking: bookingResult,
        skipWorkflowSideEffects: true
      },
      { organizationId }
    );
  } catch (appointmentError) {
    console.warn("[missionExecution] appointment record failed:", appointmentError.message);
  }

  return {
    ...buildActionSuccess(
      ACTION_IDS.SCHEDULE,
      "Interview scheduled successfully. Meeting invitation created."
    ),
    completedMissionType: MISSION_TYPES.SCHEDULE_INTERVIEW,
    zoomLink: bookingResult.meetingUrl || bookingResult.zoomLink || meetingUrl || null,
    meetLink: bookingResult.meetingUrl || bookingResult.zoomLink || meetingUrl || null,
    meetingUrl: bookingResult.meetingUrl || bookingResult.zoomLink || meetingUrl || null,
    calendarEventId: bookingResult.googleCalendarEventId || null,
    booking: bookingResult,
    appointment: appointmentRecord,
    workflow: advanceResult.workflow || null
  };
}

async function executeMission(phone, body = {}, options = {}) {
  const missionType = body.missionType || body.type;
  const payload = body.payload || body;

  if (
    missionType === MISSION_TYPES.SCHEDULE_INTERVIEW ||
    missionType === "schedule" ||
    payload?.dateKey
  ) {
    return executeScheduleInterview(phone, payload, options);
  }

  return buildActionError(
    missionType || "unknown",
    "UNSUPPORTED_MISSION",
    "This mission type is not executable yet."
  );
}

module.exports = {
  executeMission,
  executeScheduleInterview,
  normalizeInterviewType,
  validateSchedulePayload
};
