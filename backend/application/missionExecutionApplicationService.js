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
const {
  extractEmailFromNotes,
  deriveDayPartFromTimeKey,
  mergeDayPartIntoNotes
} = require("../core/informationModel");
const {
  parseQualificationCapture,
  markCapturedFields,
  mergeNotesWithQualificationCapture
} = require("../core/qualificationCaptureState");
const { normalizeEmail, validateEmailFormat } = require("../core/emailNormalization");
const {
  buildActionError,
  buildActionSuccess
} = require("./agentActionApplicationService");
const { logInterviewerTrace } = require("../dev/interviewerTrace");
const { resolveRecruiterDisplayName } = require("../core/whatsappCommunicationEngine");
const {
  isActiveAppointment,
  findAppointmentById
} = require("../core/activeAppointmentResolver");

function resolveScheduleAgentId(options = {}) {
  return options.userId || options.agentId || options.authorUserId || null;
}

function buildScheduleExecutionResponse({
  bookingResult,
  meetingUrl,
  appointmentRecord,
  advanceResult
}) {
  const appointmentId = appointmentRecord?.id || null;

  if (!appointmentId || !appointmentRecord) {
    throw new Error("Schedule response invariant violated: appointmentId is required.");
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
    appointmentId,
    appointment: appointmentRecord,
    workflow: advanceResult.workflow || null
  };
}

async function createPersistedScheduleAppointment({
  organizationId,
  agentId,
  phone,
  payload,
  bookingResult,
  interviewType,
  isZoom,
  isPublicLocation,
  location,
  attendeeEmail
}) {
  const appointmentRecord = await appointmentApplicationService.createAppointment(
    {
      organizationId,
      agentId,
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
      interviewerUserId: payload.interviewerUserId || agentId,
      existingBooking: bookingResult,
      skipWorkflowSideEffects: true
    },
    { organizationId }
  );

  await appointmentApplicationService.getAppointment(appointmentRecord.id, organizationId);

  return appointmentRecord;
}

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

async function rollbackScheduleBooking(bookingResult, organizationId, prospect, context = {}) {
  const rollbackErrors = [];

  if (!bookingResult?.startTimeISO) {
    return rollbackErrors;
  }

  try {
    await cancelAppointment({
      appointmentType: APPOINTMENT_TYPES.INTERVIEW,
      startTimeISO: bookingResult.startTimeISO,
      googleCalendarEventId: bookingResult.googleCalendarEventId,
      organizationId
    });
  } catch (error) {
    rollbackErrors.push(`calendar: ${error.message}`);
    console.error("[missionExecution] rollback calendar failed:", error.message, context);
  }

  try {
    await updateProspect(prospect.phone, {
      calendar_event_id: prospect.calendar_event_id || null,
      appointment_date: prospect.appointment_date || null,
      interview_time: prospect.interview_time || null,
      interview_type: prospect.interview_type || null,
      current_step: prospect.current_step || "SCHEDULE"
    });
  } catch (error) {
    rollbackErrors.push(`prospect: ${error.message}`);
    console.error("[missionExecution] rollback prospect failed:", error.message, context);
  }

  if (rollbackErrors.length) {
    console.error("[missionExecution] rollback completed with errors", {
      phone: prospect.phone,
      errors: rollbackErrors,
      ...context
    });
  }

  return rollbackErrors;
}

async function rollbackPersistedAppointment(appointmentRecord, organizationId, agentId, context = {}) {
  if (!appointmentRecord?.id) {
    return;
  }

  try {
    await appointmentApplicationService.cancelAppointment(
      appointmentRecord.id,
      { reason: context.reason || "schedule_rollback" },
      { organizationId, agentId }
    );
  } catch (error) {
    console.error("[missionExecution] rollback persisted appointment failed:", error.message, {
      appointmentId: appointmentRecord.id,
      ...context
    });
  }
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

  const scheduleAgentId = resolveScheduleAgentId(options);
  const effectiveInterviewerUserId =
    payload.interviewerUserId || payload.interviewer_user_id || scheduleAgentId;

  logInterviewerTrace({
    authenticatedUserId: scheduleAgentId,
    authenticatedUserName: resolveRecruiterDisplayName(options.actorUser),
    interviewerUserId: payload.interviewerUserId || payload.interviewer_user_id || null,
    interviewerName: null,
    appointmentId: null,
    source: "missionExecutionApplicationService.executeScheduleInterview"
  });

  logInterviewerTrace({
    authenticatedUserId: scheduleAgentId,
    authenticatedUserName: resolveRecruiterDisplayName(options.actorUser),
    interviewerUserId: effectiveInterviewerUserId,
    interviewerName: null,
    appointmentId: null,
    source: "missionExecutionApplicationService.executeScheduleInterview.effective"
  });

  if (!scheduleAgentId) {
    // Safe customer-facing copy — never expose internal auth/persistence diagnostics.
    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "APPOINTMENT_PERSISTENCE_FAILED",
      "I'm sorry, I couldn't complete the appointment just now. A team member will help you confirm the time shortly."
    );
  }

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
    await rollbackScheduleBooking(bookingResult, organizationId, prospect, {
      phase: "calendar_validation"
    });

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "CALENDAR_FAILED",
      "Google Calendar is connected but the meeting invitation could not be created."
    );
  }

  let appointmentRecord = null;

  try {
    appointmentRecord = await createPersistedScheduleAppointment({
      organizationId,
      agentId: scheduleAgentId,
      phone,
      payload,
      bookingResult,
      interviewType,
      isZoom,
      isPublicLocation,
      location,
      attendeeEmail
    });
  } catch (error) {
    await rollbackScheduleBooking(bookingResult, organizationId, prospect, {
      phase: "appointment_persistence"
    });

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "APPOINTMENT_PERSISTENCE_FAILED",
      error.message || "Unable to persist appointment record."
    );
  }

  if (!appointmentRecord?.id) {
    await rollbackScheduleBooking(bookingResult, organizationId, prospect, {
      phase: "appointment_persistence_missing_id"
    });

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "APPOINTMENT_PERSISTENCE_FAILED",
      "Unable to persist appointment record."
    );
  }

  const prospectUpdates = {
    calendar_event_id: bookingResult.googleCalendarEventId,
    appointment_date: bookingResult.startTimeISO,
    interview_time: bookingResult.startTimeISO,
    interview_type: interviewType,
    current_step: "CONFIRMED"
  };

  let nextNotes = prospect.notes || null;
  const derivedDayPart = deriveDayPartFromTimeKey(payload.timeKey);

  if (derivedDayPart) {
    nextNotes = mergeDayPartIntoNotes(nextNotes, derivedDayPart);
    const captureState = markCapturedFields(parseQualificationCapture(nextNotes), {
      dayPart: derivedDayPart,
      preferredPeriod: derivedDayPart
    });
    nextNotes = mergeNotesWithQualificationCapture(nextNotes, captureState);
  }

  if (attendeeEmail) {
    nextNotes = buildProspectNotesWithEmail(nextNotes, attendeeEmail);
  }

  if (nextNotes !== prospect.notes) {
    prospectUpdates.notes = nextNotes;
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
    await rollbackScheduleBooking(bookingResult, organizationId, prospect, {
      phase: "workflow_advance"
    });
    await rollbackPersistedAppointment(appointmentRecord, organizationId, scheduleAgentId, {
      reason: "schedule_workflow_rollback",
      phase: "workflow_advance"
    });

    // Implements BR-122 — never advertise booking failure while a live scheduled appointment remains.
    const postRollback = await findAppointmentById(appointmentRecord.id, organizationId).catch(
      () => null
    );

    if (postRollback && isActiveAppointment(postRollback)) {
      console.error("[missionExecution] BR-122 reconcile: workflow advance failed but appointment remains active", {
        appointmentId: postRollback.id,
        status: postRollback.status,
        phone,
        workflowError: advanceResult.error || "WORKFLOW_ADVANCE_FAILED"
      });

      return {
        ...buildScheduleExecutionResponse({
          bookingResult: {
            ...bookingResult,
            googleCalendarEventId:
              postRollback.calendarEventId || bookingResult.googleCalendarEventId || null
          },
          meetingUrl,
          appointmentRecord: postRollback,
          advanceResult: {
            success: false,
            workflow: advanceResult.workflow || null,
            reconciled: true,
            reconcileReason: "ACTIVE_APPOINTMENT_AFTER_WORKFLOW_ROLLBACK"
          }
        }),
        reconciledFromWorkflowFailure: true,
        workflowAdvanceError: advanceResult.error || "WORKFLOW_ADVANCE_FAILED"
      };
    }

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

  const response = buildScheduleExecutionResponse({
    bookingResult,
    meetingUrl,
    appointmentRecord,
    advanceResult
  });

  return response;
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
  validateSchedulePayload,
  resolveScheduleAgentId,
  buildScheduleExecutionResponse,
  rollbackScheduleBooking,
  rollbackPersistedAppointment
};
