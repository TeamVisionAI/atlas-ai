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
  resolveCanonicalProspectIdentity,
  REASON_CODES: PROSPECT_IDENTITY_REASON_CODES
} = require("../core/recruitingProspectBridge");
const {
  planQualificationFactSync,
  synchronizeQualificationFactsForSchedule
} = require("../core/recruitAiV2/qualificationFactSync");
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
      meetingLocationType: isZoom
        ? undefined
        : isPublicLocation
          ? "public_location"
          : "office",
      meetingLocationName: isPublicLocation
        ? payload.meetingLocationName || null
        : undefined,
      meetingAddress: isZoom
        ? null
        : isPublicLocation
          ? payload.meetingLocationAddress || null
          : location,
      meetingLocationUrl: isPublicLocation
        ? payload.meetingLocationUrl || null
        : undefined,
      notes: payload.notes,
      contact: attendeeEmail ? { email: attendeeEmail } : {},
      interviewerUserId: payload.interviewerUserId || agentId,
      assignmentMode: payload.assignmentMode || null,
      existingBooking: bookingResult,
      skipWorkflowSideEffects: true,
      metadata: isPublicLocation
        ? {
            meetingLocationUrl: payload.meetingLocationUrl || null
          }
        : undefined
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

  const interviewType = normalizeInterviewType(payload.interviewType);
  if (interviewType === "Public Location") {
    const {
      hasPublicLocationDetails
    } = require("../core/publicLocationDetails");
    if (!hasPublicLocationDetails(payload)) {
      missing.push("meetingLocationName|meetingLocationAddress");
    }
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

async function rollbackScheduleBooking(bookingResult, organizationId, prospect, context = {}, deps = {}) {
  const rollbackErrors = [];
  const cancelAppt = deps.cancelAppointment || cancelAppointment;
  const updateFn = deps.updateProspect || updateProspect;

  if (!bookingResult?.startTimeISO) {
    return rollbackErrors;
  }

  try {
    await cancelAppt({
      appointmentType: APPOINTMENT_TYPES.INTERVIEW,
      startTimeISO: bookingResult.startTimeISO,
      googleCalendarEventId: bookingResult.googleCalendarEventId,
      organizationId
    });
  } catch (error) {
    rollbackErrors.push(`calendar: ${error.message}`);
    console.error("[missionExecution] rollback calendar failed:", error.message, context);
    try {
      const {
        EVENTS,
        emitRecruitAiV2Signal
      } = require("../core/recruitAiV2/stage1Observability");
      emitRecruitAiV2Signal(EVENTS.CALENDAR_ROLLBACK_FAILED, {
        organizationId: organizationId || context?.organizationId || null,
        phone: prospect?.phone || context?.phone || null,
        appointmentId: context?.appointmentId || null,
        calendarEventId: bookingResult?.googleCalendarEventId || null,
        phase: context?.phase || null,
        reasonCodes: ["CALENDAR_ROLLBACK_FAILED"],
        detail: String(error.message || "").slice(0, 200),
        outcome: "failure",
        level: "error"
      });
    } catch {
      // ignore
    }
  }

  try {
    await updateFn(prospect.phone, {
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
    const {
      EVENTS,
      emitRecruitAiV2Signal
    } = require("../core/recruitAiV2/stage1Observability");
    emitRecruitAiV2Signal(EVENTS.SCHEDULE_WORKFLOW_ROLLBACK, {
      organizationId: organizationId || null,
      agentId: agentId || null,
      appointmentId: appointmentRecord.id,
      calendarEventId:
        appointmentRecord.calendar_event_id ||
        appointmentRecord.calendarEventId ||
        null,
      phase: context.phase || null,
      reasonCodes: [context.reason || "schedule_workflow_rollback"],
      decisionCode: "create_appointment",
      outcome: "rollback",
      level: "warn"
    });
  } catch {
    // ignore
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

  const deps = options.dependencies || {};
  const updateProspectFn = deps.updateProspect || updateProspect;
  const advanceWorkflow = deps.advanceProspectWorkflow || advanceProspectWorkflow;
  const persistScheduleAppointment =
    deps.createPersistedScheduleAppointment || createPersistedScheduleAppointment;
  const getCalendarStatus =
    deps.getGoogleCalendarIntegrationStatus ||
    ((orgId) => googleCalendarIntegrationService.getIntegrationStatus(orgId));
  const rollbackPersisted =
    deps.rollbackPersistedAppointment || rollbackPersistedAppointment;
  const findApptById = deps.findAppointmentById || findAppointmentById;
  const rollbackBooking = (bookingResult, orgId, nextProspect, context) =>
    rollbackScheduleBooking(bookingResult, orgId, nextProspect, context, {
      cancelAppointment: deps.cancelAppointment,
      updateProspect: updateProspectFn
    });

  const organizationId = requireTenantOrganizationId(options.organizationId);
  const resolveProspect = deps.resolveTenantProspect || resolveTenantProspect;
  const prospect = await resolveProspect(phone, options);

  if (!prospect) {
    return buildActionError(ACTION_IDS.SCHEDULE, "PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const interviewType = normalizeInterviewType(payload.interviewType);
  const duration = Number(payload.duration) || 30;
  const isZoom = interviewType === "Zoom";
  const isPublicLocation = interviewType === "Public Location";
  const attendeeEmail = resolveProspectEmail(prospect, payload);

  const resolveLocation =
    deps.resolveInterviewLocation ||
    ((orgId, type, locs) =>
      meetingManagementService.resolveInterviewLocation(orgId, type, locs));

  const locationResult = await resolveLocation(organizationId, interviewType, {
    publicLocation:
      payload.publicLocation ||
      (() => {
        const {
          composePublicLocationDisplay
        } = require("../core/publicLocationDetails");
        return composePublicLocationDisplay({
          meetingLocationName: payload.meetingLocationName,
          meetingLocationAddress: payload.meetingLocationAddress
        });
      })(),
    meetingLocationName: payload.meetingLocationName,
    meetingLocationAddress: payload.meetingLocationAddress,
    officeLocation: payload.officeLocation
  });

  if (!locationResult.configured) {
    const errorCode =
      locationResult.errorCode === "MEETING_URL_NOT_CONFIGURED"
        ? "MEETING_URL_NOT_CONFIGURED"
        : locationResult.errorCode === "PUBLIC_LOCATION_REQUIRED"
          ? "PUBLIC_LOCATION_REQUIRED"
          : "OFFICE_LOCATION_REQUIRED";
    const message =
      locationResult.errorCode === "MEETING_URL_NOT_CONFIGURED"
        ? "Personal meeting URL is not configured. Add it under Organization → Meeting Management."
        : locationResult.errorCode === "PUBLIC_LOCATION_REQUIRED"
          ? "Public location requires a place name or address."
          : "Office address is not configured. Add it under Organization → Meeting Management.";

    return buildActionError(ACTION_IDS.SCHEDULE, errorCode, message);
  }

  const location = locationResult.location;
  let meetingUrl = locationResult.meetingUrl;

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

  // Implements BR-120 — canonical core identity must resolve BEFORE Calendar create.
  // Never create Calendar / capacity when prospect identity cannot be ensured.
  const resolveIdentity =
    deps.resolveCanonicalProspectIdentity || resolveCanonicalProspectIdentity;
  const scheduleAppt = deps.scheduleAppointment || scheduleAppointment;

  const identity = await resolveIdentity({
    phone: prospect.phone || phone,
    organizationId,
    displayName: prospect.name || null,
    email: attendeeEmail || null,
    legacyProspectId: prospect.id || null,
    ensureCore: true
  });

  if (!identity.ok || !identity.coreProspectId) {
    return buildActionError(
      ACTION_IDS.SCHEDULE,
      identity.reasonCode || PROSPECT_IDENTITY_REASON_CODES.UNRESOLVED,
      "I'm sorry, I couldn't complete the appointment just now. A team member will help you confirm the time shortly."
    );
  }

  // Implements BR-127 / BR-120 — V2 durable must match schedule-time identity before Calendar.
  if (options.recruitAiV2Context || options.recruitAiV2CoreProspectId) {
    const durableCoreId =
      options.recruitAiV2CoreProspectId ||
      options.recruitAiV2Context?.prospectId ||
      null;

    if (!durableCoreId || String(durableCoreId) !== String(identity.coreProspectId)) {
      return buildActionError(
        ACTION_IDS.SCHEDULE,
        "QUALIFICATION_SYNC_IDENTITY_MISMATCH",
        "I'm sorry, I couldn't complete the appointment just now. A team member will help you confirm the time shortly."
      );
    }

    if (
      identity.legacyProspectId &&
      prospect.id &&
      String(identity.legacyProspectId) !== String(prospect.id)
    ) {
      return buildActionError(
        ACTION_IDS.SCHEDULE,
        "QUALIFICATION_SYNC_IDENTITY_MISMATCH",
        "I'm sorry, I couldn't complete the appointment just now. A team member will help you confirm the time shortly."
      );
    }
  }

  // Implements BR-127 — validate sync plan BEFORE Calendar / appointment mutation.
  let qualificationSyncPlan = null;
  if (options.recruitAiV2Context) {
    qualificationSyncPlan = planQualificationFactSync({
      durableContext: options.recruitAiV2Context,
      prospect,
      organizationId,
      expectedCoreProspectId:
        options.recruitAiV2CoreProspectId ||
        options.recruitAiV2Context.prospectId ||
        null,
      expectedLegacyProspectId: prospect.id || null
    });

    if (!qualificationSyncPlan.ok) {
      return buildActionError(
        ACTION_IDS.SCHEDULE,
        qualificationSyncPlan.reasonCode || "QUALIFICATION_SYNC_FAILED",
        "I'm sorry, I couldn't complete the appointment just now. A team member will help you confirm the time shortly."
      );
    }
  }

  const assignmentMode = payload.assignmentMode || (payload.interviewerUserId ? "explicit" : "auto");
  const getSlots =
    deps.getSlots ||
    ((params) => appointmentApplicationService.getSlots(params));
  const slotCheck = await getSlots({
    agentId: scheduleAgentId,
    organizationId,
    date: payload.dateKey,
    purpose: "recruiting_interview",
    durationMinutes: duration,
    assignmentMode,
    interviewerUserId: assignmentMode === "explicit" ? effectiveInterviewerUserId : null,
    maxResults: 50
  });
  const matchedSlot = (slotCheck?.slots || []).find(
    (slot) => slot.dateKey === payload.dateKey && slot.timeKey === payload.timeKey
  );

  if (!matchedSlot) {
    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "UNAVAILABLE",
      "Selected slot is no longer available."
    );
  }

  const assignedInterviewerUserId =
    matchedSlot.assignedInterviewerUserId || effectiveInterviewerUserId;

  if (isZoom) {
    const {
      resolveCanonicalVirtualMeetingUrl
    } = require("../core/virtualMeetingUrlResolver");
    const interviewerZoom = await resolveCanonicalVirtualMeetingUrl({
      organizationId,
      interviewerUserId: assignedInterviewerUserId,
      meetingType: "virtual",
      meetingProvider: "zoom"
    });
    if (!interviewerZoom.url) {
      return buildActionError(
        ACTION_IDS.SCHEDULE,
        "INTERVIEWER_ZOOM_NOT_CONFIGURED",
        "The assigned interviewer does not have a personal Zoom URL configured."
      );
    }
    meetingUrl = interviewerZoom.url;
  }

  payload = {
    ...payload,
    interviewerUserId: assignedInterviewerUserId,
    assignmentMode
  };

  let bookingResult;

  try {
    bookingResult = await scheduleAppt({
      organizationId,
      appointmentType: APPOINTMENT_TYPES.INTERVIEW,
      dateKey: payload.dateKey,
      timeKey: payload.timeKey,
      duration,
      interviewerUserId: assignedInterviewerUserId,
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
        attendeeEmail,
        interviewerUserId: assignedInterviewerUserId,
        assignedInterviewerUserId
      },
      timezone: payload.timezone || "America/New_York"
    });
  } catch (calendarError) {
    try {
      const {
        EVENTS,
        emitRecruitAiV2Signal
      } = require("../core/recruitAiV2/stage1Observability");
      emitRecruitAiV2Signal(EVENTS.CALENDAR_CREATE_FAILED, {
        organizationId,
        agentId: scheduleAgentId || null,
        phone,
        prospectId: options.recruitAiV2CoreProspectId || null,
        decisionCode: "create_appointment",
        reasonCodes: ["CALENDAR_FAILED"],
        detail: String(calendarError.message || "").slice(0, 200),
        outcome: "failure",
        level: "error"
      });
    } catch {
      // ignore
    }
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

  const calendarStatus = await getCalendarStatus(organizationId);

  if (
    calendarStatus?.connected &&
    !bookingResult.googleCalendarEventId &&
    !shouldMockExternalComms()
  ) {
    await rollbackBooking(bookingResult, organizationId, prospect, {
      phase: "calendar_validation"
    });

    try {
      const {
        EVENTS,
        emitRecruitAiV2Signal
      } = require("../core/recruitAiV2/stage1Observability");
      emitRecruitAiV2Signal(EVENTS.CALENDAR_CREATE_FAILED, {
        organizationId,
        agentId: scheduleAgentId || null,
        phone,
        prospectId: options.recruitAiV2CoreProspectId || null,
        decisionCode: "create_appointment",
        reasonCodes: ["CALENDAR_FAILED"],
        detail: "connected_but_missing_event_id",
        outcome: "failure",
        level: "error"
      });
    } catch {
      // ignore
    }

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "CALENDAR_FAILED",
      "Google Calendar is connected but the meeting invitation could not be created."
    );
  }

  let appointmentRecord = null;

  try {
    appointmentRecord = await persistScheduleAppointment({
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
    await rollbackBooking(bookingResult, organizationId, prospect, {
      phase: "appointment_persistence"
    });

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "APPOINTMENT_PERSISTENCE_FAILED",
      error.message || "Unable to persist appointment record."
    );
  }

  if (!appointmentRecord?.id) {
    await rollbackBooking(bookingResult, organizationId, prospect, {
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

  // Implements BR-127 — hydrate null legacy qual columns in the SAME prospect UPDATE as
  // schedule confirmation fields (single atomic row update). capturedFields stay in-memory.
  if (qualificationSyncPlan?.legacyUpdates) {
    Object.assign(prospectUpdates, qualificationSyncPlan.legacyUpdates);
  }

  try {
    await updateProspectFn(prospect.phone, prospectUpdates);
  } catch (error) {
    await rollbackBooking(bookingResult, organizationId, prospect, {
      phase: "qualification_fact_sync_write"
    });
    await rollbackPersisted(appointmentRecord, organizationId, scheduleAgentId, {
      reason: "schedule_workflow_rollback",
      phase: "qualification_fact_sync_write"
    });

    return buildActionError(
      ACTION_IDS.SCHEDULE,
      "QUALIFICATION_SYNC_WRITE_FAILED",
      "I'm sorry, I couldn't complete the appointment just now. A team member will help you confirm the time shortly."
    );
  }

  if (qualificationSyncPlan?.legacyUpdates) {
    Object.assign(prospect, qualificationSyncPlan.legacyUpdates);
  }

  // Implements BR-127 — enrichment for milestone validation (no second DB write).
  let advanceCapturedFields = {
    interviewDateTime: bookingResult.startTimeISO,
    interviewType,
    confirmed: true,
    appointmentDate: payload.dateKey,
    preferredTime: payload.timeKey,
    email: attendeeEmail || undefined,
    appointmentId: appointmentRecord.id
  };

  if (qualificationSyncPlan) {
    const sync = await synchronizeQualificationFactsForSchedule({
      plan: qualificationSyncPlan,
      updateProspectFn: null,
      baseCapturedFields: advanceCapturedFields,
      prospect
    });
    advanceCapturedFields = sync.capturedFields;
  }

  const advanceResult = await advanceWorkflow(phone, {
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    organizationId,
    capturedFields: advanceCapturedFields,
    interactionNotes: payload.notes || null,
    interactionType: "agent_schedule"
  });

  if (!advanceResult.success) {
    await rollbackBooking(bookingResult, organizationId, prospect, {
      phase: "workflow_advance"
    });
    await rollbackPersisted(appointmentRecord, organizationId, scheduleAgentId, {
      reason: "schedule_workflow_rollback",
      phase: "workflow_advance"
    });

    // Implements BR-122 — never advertise booking failure while a live scheduled appointment remains.
    const postRollback = await findApptById(appointmentRecord.id, organizationId).catch(
      () => null
    );

    if (postRollback && isActiveAppointment(postRollback)) {
      const postStart = postRollback.startDateTime || postRollback.start_date_time;
      const expectedStart = bookingResult.startTimeISO;
      const sameAttemptInstant =
        postStart &&
        expectedStart &&
        new Date(postStart).getTime() === new Date(expectedStart).getTime();

      if (!sameAttemptInstant) {
        return buildActionError(
          ACTION_IDS.SCHEDULE,
          advanceResult.error || "WORKFLOW_ADVANCE_FAILED",
          advanceResult.message || "Unable to advance workflow after scheduling."
        );
      }

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
