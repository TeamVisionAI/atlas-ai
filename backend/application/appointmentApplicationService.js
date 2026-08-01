/**
 * Sprint 22 — Appointment Engine application service.
 * Orchestrates scheduling, calendar, reminders, timeline, and mission integration.
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const appointmentSchedulingEngine = require("../services/appointmentSchedulingEngine");
const {
  getAppointmentProfile,
  updateAppointmentProfile,
  resolveDurationForPurpose
} = require("../services/appointmentProfileService");
const {
  scheduleAppointment,
  cancelAppointment: cancelCapacitySlot,
  formatAppointmentTitle
} = require("../services/schedulingService");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const appointmentReminderEngine = require("../services/appointmentReminderEngine");
const meetingManagementService = require("../services/meetingManagementService");
const { updateProspect, findProspectInOrganization } = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const { recordBusinessEvent } = require("../core/recruitingBusinessEventBridge");
const { findCoreProspectIdByPhone } = require("../core/recruitingProspectBridge");
const { onInterviewScheduled } = require("../core/recruitingWorkflowOrchestrator");
const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
const { APPOINTMENT_EVENTS } = require("../modules/business-events/domain/EventTypes");
const { MILESTONES } = require("../core/workflowConstants");
const { APPOINTMENT_TYPES } = require("../core/configuration/appointmentTypes");
const {
  APPOINTMENT_STATUSES,
  APPOINTMENT_SOURCES,
  APPOINTMENT_PURPOSES,
  MEETING_TYPES,
  VIRTUAL_PROVIDERS,
  MEETING_LOCATION_TYPES,
  CONFIRMATION_STATUSES,
  REMINDER_STATUSES,
  isValidPurpose,
  isValidStatus,
  isValidOutcome,
  isValidRescheduleReason,
  isValidMeetingType,
  isValidSource
} = require("../core/configuration/appointmentDomain");
const {
  normalizeEmail,
  validateEmailFormat,
  resolveEmailStatus,
  formatEmailForProspectNotes,
  extractEmailFromProspectNotes,
  detectDomainTypo
} = require("../core/emailNormalization");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");
const { buildIsoTimestamp } = require("../services/availabilityService");
const { recordHistoryEvent } = require("../core/appointmentHistory");
const appointmentDomainService = require("../modules/appointments/application/appointmentDomainService");
const {
  emitAppointmentLifecycleEvent
} = require("../modules/appointments/application/appointmentEventAdapter");
const { findUserById } = require("../services/atlasUserService");
const {
  resolveInterviewAssignmentForSchedule
} = require("../core/interviewAssignmentEngine");
const { logInterviewerTrace } = require("../dev/interviewerTrace");
const {
  recordInterviewOutcomeFromAppointmentSlug
} = require("./interviewOutcomeApplicationService");
const { findActiveAppointmentForProspect } = require("../core/activeAppointmentResolver");

async function resolveOwnerRepId(agentId) {
  const user = await findUserById(agentId);
  return user?.rep_id || null;
}

async function resolveAppointmentForMutation(id, organizationId) {
  if (!id || !organizationId) {
    return null;
  }

  return appointmentRepository.findById(id, organizationId);
}

function resolveVirtualMeetingUrl(meetingProvider, options = {}) {
  const url = options.meetingUrl || options.zoomUrl || options.meetLink;

  if (meetingProvider === VIRTUAL_PROVIDERS.ZOOM && url) {
    return {
      url,
      status: "configured",
      provider: meetingProvider
    };
  }

  if (meetingProvider === VIRTUAL_PROVIDERS.ZOOM) {
    return {
      url: null,
      status: "pending",
      provider: meetingProvider,
      message: "Virtual meeting link will use the workspace personal meeting URL."
    };
  }

  if (meetingProvider === VIRTUAL_PROVIDERS.WHATSAPP_VIDEO) {
    return {
      url: null,
      status: "whatsapp_scheduled",
      provider: meetingProvider,
      message: "WhatsApp video call — no link required."
    };
  }

  if (meetingProvider === VIRTUAL_PROVIDERS.PHONE_CALL) {
    return {
      url: null,
      status: "phone_scheduled",
      provider: meetingProvider
    };
  }

  return { url: null, status: "pending", provider: meetingProvider || VIRTUAL_PROVIDERS.OTHER };
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function appendHistory(appointment, entry) {
  return recordHistoryEvent(appointment, entry);
}

function mapInterviewTypeToMeeting(meetingType, meetingProvider) {
  if (meetingType === MEETING_TYPES.IN_PERSON) {
    return { meetingType, meetingProvider: null };
  }

  if (meetingType === MEETING_TYPES.PHONE) {
    return { meetingType, meetingProvider: VIRTUAL_PROVIDERS.PHONE_CALL };
  }

  return {
    meetingType: MEETING_TYPES.VIRTUAL,
    meetingProvider: meetingProvider || VIRTUAL_PROVIDERS.ZOOM
  };
}

function resolveLocationDetails(profile, payload = {}) {
  const locationType = payload.meetingLocationType || MEETING_LOCATION_TYPES.OFFICE;

  if (locationType === MEETING_LOCATION_TYPES.OFFICE) {
    const office = profile?.office || getOrganizationSettings().office;
    const address = [office.address, office.city, office.state, office.postalCode]
      .filter(Boolean)
      .join(", ");

    return {
      meetingLocationType: MEETING_LOCATION_TYPES.OFFICE,
      meetingLocationName: office.name || "Office",
      meetingAddress: address || office.fullAddress || null,
      meetingNotes: office.parkingNotes || null
    };
  }

  if (locationType === MEETING_LOCATION_TYPES.PUBLIC_LOCATION && payload.publicLocationId) {
    const location = (profile?.favoritePublicLocations || []).find(
      (item) => item.id === payload.publicLocationId
    );

    if (location) {
      return {
        meetingLocationType: MEETING_LOCATION_TYPES.PUBLIC_LOCATION,
        meetingLocationName: location.name,
        meetingAddress: [location.address, location.city, location.state, location.postalCode]
          .filter(Boolean)
          .join(", "),
        meetingNotes: location.notes || null
      };
    }
  }

  if (payload.meetingLocationName || payload.meetingAddress) {
    return {
      meetingLocationType: locationType,
      meetingLocationName: payload.meetingLocationName || null,
      meetingAddress: payload.meetingAddress || null,
      meetingNotes: payload.meetingNotes || null
    };
  }

  return {
    meetingLocationType: locationType,
    meetingLocationName: null,
    meetingAddress: null,
    meetingNotes: null
  };
}

async function enrichWithProspect(appointment) {
  const prospect = await findProspectInOrganization(
    appointment.prospectPhone,
    appointment.organizationId
  );

  const email =
    prospect?.email ||
    extractEmailFromProspectNotes(prospect?.notes) ||
    appointment.metadata?.prospectEmail ||
    null;

  return {
    ...appointment,
    prospectName: prospect?.name || appointment.metadata?.prospectName || appointment.prospectPhone,
    prospectEmail: email,
    emailStatus: resolveEmailStatus(email)
  };
}

async function emitAppointmentEvent(phone, eventType, payload = {}, summary) {
  const prospectId = await findCoreProspectIdByPhone(phone);

  await recordBusinessEvent({
    phone,
    prospectId,
    eventType,
    actor: payload.actor || "AGENT",
    channel: payload.channel || "mission_control",
    organizationId: payload.organizationId,
    summary,
    payload
  }).catch(() => {});
}

async function syncProspectContact(phone, contact = {}) {
  const patch = {};

  if (contact.firstName) {
    patch.name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  }

  if (contact.city) {
    patch.city = contact.city;
  }

  if (contact.state) {
    patch.state = contact.state;
  }

  if (contact.preferredLanguage) {
    patch.language = contact.preferredLanguage;
  }

  if (contact.email) {
    const normalized = normalizeEmail(contact.email);

    if (validateEmailFormat(normalized)) {
      patch.notes = formatEmailForProspectNotes(normalized);
    }
  }

  if (Object.keys(patch).length) {
    await updateProspect(phone, patch).catch(() => {});
  }

  return patch;
}

async function getProfile(agentId) {
  return getAppointmentProfile(agentId);
}

async function updateProfile(agentId, input, auditMeta) {
  return updateAppointmentProfile(agentId, input, auditMeta);
}

async function getSlots(params) {
  return appointmentSchedulingEngine.getAvailableSlots(params);
}

async function getAppointment(id, organizationId) {
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  return enrichWithProspect(appointment);
}

async function listAppointments(filters) {
  const { listPersistedAppointments } = require("../services/appointmentListService");
  const result = await listPersistedAppointments(filters);
  const items = [];

  for (const appointment of result.items) {
    try {
      items.push(await enrichWithProspect(appointment));
    } catch (error) {
      console.error("[appointments] enrich failed:", error.message);
      items.push({
        ...appointment,
        prospectName: appointment.metadata?.prospectName || appointment.prospectPhone,
        prospectEmail: appointment.metadata?.prospectEmail || null,
        emailStatus: "missing"
      });
    }
  }

  return { items, total: items.length };
}

async function createAppointment(input, context = {}) {
  const {
    organizationId,
    agentId,
    prospectPhone,
    purpose = APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    dateKey,
    timeKey,
    source = APPOINTMENT_SOURCES.MISSION_CONTROL,
    meetingType = MEETING_TYPES.VIRTUAL,
    meetingProvider,
    contact = {},
    notes,
    createdBy,
    existingBooking = null,
    skipWorkflowSideEffects = false,
    skipReminders = false,
    skipProspectUpdate = false
  } = input;

  if (!organizationId || !agentId || !prospectPhone || !dateKey || !timeKey) {
    throw buildError("VALIDATION_FAILED", "Missing required appointment fields.");
  }

  if (!isValidPurpose(purpose)) {
    throw buildError("INVALID_PURPOSE", "Invalid appointment purpose.");
  }

  if (!isValidSource(source)) {
    throw buildError("INVALID_SOURCE", "Invalid appointment source.");
  }

  const profileResult = await getAppointmentProfile(agentId);
  const profile = profileResult.appointmentProfile;
  const durationMinutes =
    input.durationMinutes || resolveDurationForPurpose(profile, purpose);
  const timezone = profile.defaults.timezone || profileResult.timezone;
  const meeting = mapInterviewTypeToMeeting(meetingType, meetingProvider || profile.virtualMeeting.preferredProvider);
  const location = resolveLocationDetails(profile, input);

  const slotCheck = existingBooking
    ? { slots: [{ dateKey, timeKey, startTimeISO: existingBooking.startTimeISO, endTimeISO: existingBooking.endTimeISO }] }
    : await appointmentSchedulingEngine.getAvailableSlots({
        agentId,
        organizationId,
        date: dateKey,
        purpose,
        durationMinutes,
        maxResults: 50
      });

  const matchedSlot = slotCheck.slots.find(
    (slot) => slot.dateKey === dateKey && slot.timeKey === timeKey
  );

  if (!matchedSlot && !existingBooking) {
    throw buildError("UNAVAILABLE", "Selected slot is no longer available.");
  }

  const prospect = await findProspectInOrganization(prospectPhone, organizationId);

  if (!prospect) {
    throw buildError("PROSPECT_NOT_FOUND", "Prospect not found.", 404);
  }

  await syncProspectContact(prospectPhone, contact);

  const isVirtual = meeting.meetingType === MEETING_TYPES.VIRTUAL;
  const email = normalizeEmail(contact.email) || extractEmailFromProspectNotes(prospect.notes);
  const attendeeEmail = email && validateEmailFormat(email) ? email : null;

  let meetingUrl = null;
  let officeLocation = location.meetingAddress;

  if (isVirtual && !existingBooking) {
    const virtual = await meetingManagementService.resolveVirtualMeetingUrl(organizationId);

    if (!virtual.configured) {
      throw buildError(
        "MEETING_URL_NOT_CONFIGURED",
        "Personal meeting URL is not configured. Add it under Organization → Meeting Management.",
        400
      );
    }

    meetingUrl = virtual.url;
  } else if (isVirtual && existingBooking) {
    meetingUrl =
      existingBooking.meetingUrl || existingBooking.zoomLink || existingBooking.meetLink || null;
  } else if (!officeLocation) {
    officeLocation = await meetingManagementService.resolveOfficeAddress(organizationId);
  }

  const bookingResult =
    existingBooking ||
    (await scheduleAppointment({
      organizationId,
      appointmentType:
        purpose === APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW
          ? APPOINTMENT_TYPES.INTERVIEW
          : APPOINTMENT_TYPES.MEETING,
      dateKey,
      timeKey,
      duration: durationMinutes,
      metadata: {
        name: prospect.name,
        prospectName: prospect.name,
        phone: prospectPhone,
        notes,
        interviewType: isVirtual ? "Zoom" : "In Person",
        location: isVirtual ? meetingUrl : officeLocation,
        meetingUrl,
        zoomUrl: meetingUrl,
        attendeeEmail
      },
      timezone
    }));

  if (!existingBooking && !bookingResult.success) {
    throw buildError(bookingResult.reason || "UNAVAILABLE", "Unable to book selected slot.");
  }

  const virtualUrlResult = resolveVirtualMeetingUrl(meeting.meetingProvider, {
    meetLink: bookingResult.meetingUrl || bookingResult.zoomLink || bookingResult.meetLink,
    meetingUrl: bookingResult.meetingUrl || bookingResult.zoomLink || meetingUrl,
    zoomUrl: bookingResult.meetingUrl || bookingResult.zoomLink || meetingUrl
  });

  const emailStatus = resolveEmailStatus(email);
  const confirmationStatus =
    emailStatus === "missing" ? CONFIRMATION_STATUSES.MISSING_EMAIL : CONFIRMATION_STATUSES.PENDING;

  const prospectId = await findCoreProspectIdByPhone(prospectPhone);
  const timestamp = nowIso();
  const ownerRepId = input.ownerRepId || (await resolveOwnerRepId(agentId));
  const interviewAssignment = await resolveInterviewAssignmentForSchedule(input, {
    organizationId,
    userId: createdBy || agentId,
    agentId
  });

  logInterviewerTrace({
    authenticatedUserId: createdBy || agentId,
    authenticatedUserName: null,
    interviewerUserId: interviewAssignment.interviewerUserId,
    interviewerName: interviewAssignment.interviewerName,
    appointmentId: null,
    source: "appointmentApplicationService.createAppointment.beforeSave"
  });

  const scheduledResult = appointmentDomainService.scheduleAppointment(
    {
      id: appointmentRepository.generateId(),
      organizationId,
      prospectId,
      prospectPhone,
      agentId,
      purpose,
      source,
      startDateTime: bookingResult.startTimeISO,
      endDateTime: bookingResult.endTimeISO,
      durationMinutes,
      timezone,
      meetingType: meeting.meetingType,
      meetingProvider: meeting.meetingProvider,
      ...location,
      meetingNotes: notes || location.meetingNotes,
      virtualMeetingUrl: virtualUrlResult.url,
      calendarEventId: bookingResult.googleCalendarEventId,
      calendarProvider: bookingResult.googleCalendarSynced ? "google_calendar" : null,
      confirmationStatus,
      emailInvitationStatus: email ? "pending" : "missing",
      reminderStatus: REMINDER_STATUSES.PENDING,
      humanAssistRequired: false,
      humanAssistReason: null,
      rescheduleCount: 0,
      cancellationReason: null,
      outcome: null,
      outcomeNotes: null,
      ownerRepId,
      interviewerUserId: interviewAssignment.interviewerUserId,
      interviewerName: interviewAssignment.interviewerName,
      metadata: {
        ...(input.metadata || {}),
        prospectName: prospect.name,
        prospectEmail: email,
        emailStatus,
        virtualUrlStatus: virtualUrlResult.status,
        ownerRepId,
        interviewerUserId: interviewAssignment.interviewerUserId,
        interviewerName: interviewAssignment.interviewerName
      },
      createdBy: createdBy || agentId,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      actor: createdBy || agentId,
      summary: "Appointment scheduled"
    }
  );

  const appointment = scheduledResult.appointment;

  const saved = await appointmentRepository.save(appointment);

  logInterviewerTrace({
    authenticatedUserId: createdBy || agentId,
    authenticatedUserName: null,
    interviewerUserId: saved.interviewerUserId || interviewAssignment.interviewerUserId,
    interviewerName: saved.interviewerName || interviewAssignment.interviewerName,
    appointmentId: saved.id || null,
    source: "appointmentApplicationService.createAppointment.afterSave"
  });

  if (!skipReminders) {
    const reminderResult = appointmentReminderEngine.scheduleReminders(saved);

    await appointmentRepository.save({
      ...saved,
      reminderStatus: reminderResult.status,
      updatedAt: nowIso()
    });
  }

  if (!skipProspectUpdate) {
    await updateProspect(prospectPhone, {
      calendar_event_id: bookingResult.googleCalendarEventId,
      appointment_date: bookingResult.startTimeISO,
      interview_time: bookingResult.startTimeISO,
      interview_type: isVirtual ? "Zoom" : "In Person",
      current_step: "CONFIRMED"
    });
  }

  if (purpose === APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW && !skipWorkflowSideEffects) {
    await advanceProspectWorkflow(prospectPhone, {
      targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      capturedFields: {
        interviewDateTime: bookingResult.startTimeISO,
        interviewType: isVirtual ? "Zoom" : "In Person",
        confirmed: true,
        appointmentDate: dateKey,
        preferredTime: timeKey,
        email
      },
      interactionType: "agent_schedule"
    }).catch(() => {});

    await onInterviewScheduled({
      phone: prospectPhone,
      prospect: { ...prospect, appointment_date: bookingResult.startTimeISO },
      profile: {
        appointmentDate: dateKey,
        interviewType: isVirtual ? "Zoom" : "In Person",
        preferredTime: timeKey
      },
      calendarEvent: {
        id: bookingResult.googleCalendarEventId,
        hangoutLink: virtualUrlResult.url || bookingResult.meetLink
      }
    }).catch(() => {});
  }

  if (!skipWorkflowSideEffects) {
    await emitAppointmentLifecycleEvent(saved, scheduledResult.transition);

    await logConversation({
      phone: prospectPhone,
      name: prospect.name,
      direction: "outgoing",
      message: `Appointment scheduled for ${dateKey} at ${timeKey}.`,
      intent: "APPOINTMENT",
      pipeline: "AGENT",
      currentStep: prospect.current_step
    }).catch(() => {});
  }

  return enrichWithProspect(saved);
}

async function rescheduleAppointment(id, input, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const reason = input.reason;

  if (!isValidRescheduleReason(reason)) {
    throw buildError("INVALID_REASON", "Invalid reschedule reason.");
  }

  const { dateKey, timeKey } = input;

  if (!dateKey || !timeKey) {
    throw buildError("VALIDATION_FAILED", "dateKey and timeKey are required.");
  }

  const slotCheck = await appointmentSchedulingEngine.getAvailableSlots({
    agentId: appointment.agentId,
    organizationId: appointment.organizationId,
    date: dateKey,
    purpose: appointment.purpose,
    durationMinutes: appointment.durationMinutes,
    maxResults: 50
  });

  const matchedSlot = slotCheck.slots.find(
    (slot) => slot.dateKey === dateKey && slot.timeKey === timeKey
  );

  if (!matchedSlot) {
    throw buildError("UNAVAILABLE", "Selected slot is no longer available.");
  }

  const previousStart = appointment.startDateTime;
  const previousEnd = appointment.endDateTime;

  if (appointment.calendarEventId) {
    await googleCalendarIntegrationService
      .updateCalendarEvent(appointment.organizationId, appointment.calendarEventId, {
        summary: formatAppointmentTitle(appointment.purpose, appointment.metadata),
        description: appointment.meetingNotes || "",
        startTimeISO: matchedSlot.startTimeISO,
        endTimeISO: matchedSlot.endTimeISO,
        timezone: appointment.timezone,
        location: appointment.meetingAddress
      })
      .catch(() => {});
  }

  appointmentReminderEngine.cancelReminders(appointment.id);

  const domainUpdated = await appointmentDomainService.rescheduleAppointment(appointment, {
    actor: agentId,
    reason,
    scheduledTime: matchedSlot.startTimeISO,
    endDateTime: matchedSlot.endTimeISO,
    channel: "mission_control",
    payload: { dateKey, timeKey, previousStart, newStart: matchedSlot.startTimeISO },
    newValues: { dateKey, timeKey }
  });

  const updated = {
    ...domainUpdated,
    confirmationStatus: appointment.confirmationStatus,
    reminderStatus: appointment.reminderStatus
  };

  const saved = await appointmentRepository.save(updated);
  const reminderResult = appointmentReminderEngine.replaceReminders(saved);

  await appointmentRepository.save({
    ...saved,
    reminderStatus: reminderResult.status
  });

  await updateProspect(appointment.prospectPhone, {
    appointment_date: matchedSlot.startTimeISO,
    interview_time: matchedSlot.startTimeISO
  }).catch(() => {});

  return enrichWithProspect(saved);
}

async function cancelAppointment(id, input, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  await cancelCapacitySlot({
    appointmentType:
      appointment.purpose === APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW
        ? APPOINTMENT_TYPES.INTERVIEW
        : APPOINTMENT_TYPES.MEETING,
    startTimeISO: appointment.startDateTime,
    googleCalendarEventId: appointment.calendarEventId,
    organizationId: appointment.organizationId
  });

  appointmentReminderEngine.cancelReminders(appointment.id);

  const domainUpdated = await appointmentDomainService.cancelAppointment(appointment, {
    actor: agentId || "agent",
    reason: input.reason || "unspecified",
    channel: "mission_control"
  });

  const saved = await appointmentRepository.save({
    ...domainUpdated,
    reminderStatus: REMINDER_STATUSES.CANCELLED
  });

  return enrichWithProspect(saved);
}

async function completeAppointment(id, input, context = {}) {
  const { organizationId, agentId } = context;
  const resolved = await resolveAppointmentForMutation(id, organizationId);

  if (!resolved) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const outcome = input.outcome;

  if (!isValidOutcome(outcome)) {
    throw buildError("INVALID_OUTCOME", "Valid outcome is required to complete appointment.");
  }

  const result = await recordInterviewOutcomeFromAppointmentSlug({
    phone: resolved.prospectPhone,
    appointmentId: resolved.id,
    outcomeSlug: outcome,
    outcomeNotes: input.outcomeNotes || null,
    organizationId,
    agentId
  });

  if (!result.success) {
    throw buildError(
      result.error || "OUTCOME_FAILED",
      result.message || "Could not record interview outcome.",
      result.status || 400
    );
  }

  const saved = result.appointment || (await resolveAppointmentForMutation(id, organizationId));

  return enrichWithProspect(saved);
}

async function requestHumanAssist(id, input, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const saved = await appointmentRepository.save({
    ...appointment,
    status: APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED,
    humanAssistRequired: true,
    humanAssistReason: input.reason || "unspecified",
    history: appendHistory(appointment, {
      type: "human_assist",
      actor: agentId || "ATLAS",
      reason: input.reason,
      summary: input.summary,
      oldValues: { status: appointment.status, humanAssistRequired: false },
      newValues: { status: APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED, humanAssistRequired: true }
    }),
    metadata: {
      ...appointment.metadata,
      humanAssist: {
        reason: input.reason,
        summary: input.summary || null,
        priority: input.priority || "normal",
        status: "open",
        createdAt: nowIso()
      }
    },
    updatedAt: nowIso()
  });

  await emitAppointmentEvent(
    appointment.prospectPhone,
    APPOINTMENT_EVENTS.APPOINTMENT_HUMAN_ASSIST,
    {
      organizationId: appointment.organizationId,
      appointmentId: saved.id,
      reason: input.reason,
      summary: input.summary,
      priority: input.priority || "normal"
    },
    input.summary || "Human assist required for appointment"
  );

  return enrichWithProspect(saved);
}

async function resolveHumanAssist(id, input, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const domainUpdated = await appointmentDomainService.confirmAppointment(appointment, {
    actor: agentId || "agent",
    reason: input.resolutionNotes,
    summary: "Human assist resolved",
    channel: "mission_control"
  });

  const saved = await appointmentRepository.save({
    ...domainUpdated,
    humanAssistRequired: false,
    metadata: {
      ...domainUpdated.metadata,
      humanAssist: {
        ...(appointment.metadata?.humanAssist || {}),
        status: "resolved",
        resolutionNotes: input.resolutionNotes,
        resolvedAt: nowIso()
      }
    }
  });

  return enrichWithProspect(saved);
}

async function confirmAppointmentRecord(id, input = {}, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const domainUpdated = await appointmentDomainService.confirmAppointment(appointment, {
    actor: agentId || "agent",
    reason: input.reason,
    summary: input.summary || "Appointment confirmed",
    channel: "mission_control"
  });

  const saved = await appointmentRepository.save(domainUpdated);
  return enrichWithProspect(saved);
}

async function markNoShowRecord(id, input = {}, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const domainUpdated = await appointmentDomainService.markNoShow(appointment, {
    actor: agentId || "agent",
    reason: input.reason,
    outcomeNotes: input.outcomeNotes,
    channel: "mission_control"
  });

  const saved = await appointmentRepository.save(domainUpdated);
  return enrichWithProspect(saved);
}

async function recruitFromAppointmentRecord(id, input = {}, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const domainUpdated = await appointmentDomainService.recruitFromAppointment(appointment, {
    actor: agentId || "agent",
    outcomeNotes: input.outcomeNotes,
    channel: "mission_control"
  });

  const saved = await appointmentRepository.save(domainUpdated);
  return enrichWithProspect(saved);
}

async function createClientFromAppointmentRecord(id, input = {}, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const domainUpdated = await appointmentDomainService.createClientFromAppointment(appointment, {
    actor: agentId || "agent",
    outcomeNotes: input.outcomeNotes,
    channel: "mission_control"
  });

  const saved = await appointmentRepository.save(domainUpdated);
  return enrichWithProspect(saved);
}

async function collectProspectEmail(phone, email, organizationId) {
  const normalized = normalizeEmail(email);

  if (!validateEmailFormat(normalized)) {
    throw buildError("INVALID_EMAIL", "Invalid email format.");
  }

  const typoSuggestion = detectDomainTypo(normalized);

  await syncProspectContact(phone, { email: normalized });

  return {
    email: normalized,
    emailStatus: resolveEmailStatus(normalized),
    typoSuggestion
  };
}

module.exports = {
  getProfile,
  updateProfile,
  getSlots,
  getAppointment,
  listAppointments,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  completeAppointment,
  confirmAppointment: confirmAppointmentRecord,
  markNoShow: markNoShowRecord,
  recruitFromAppointment: recruitFromAppointmentRecord,
  createClientFromAppointment: createClientFromAppointmentRecord,
  requestHumanAssist,
  resolveHumanAssist,
  collectProspectEmail,
  enrichWithProspect,
  findActiveAppointmentForProspect,
  findPersistedAppointmentForProspect: findActiveAppointmentForProspect
};
