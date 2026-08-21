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
const {
  updateProspectInOrganization,
  findProspectInOrganization
} = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const { recordBusinessEvent } = require("../core/recruitingBusinessEventBridge");
const {
  findCoreProspectIdByPhone,
  resolveCanonicalProspectIdentity,
  REASON_CODES: PROSPECT_IDENTITY_REASON_CODES
} = require("../core/recruitingProspectBridge");
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
const {
  demotePersistedScheduleClaimAfterCancel
} = require("../core/appointmentMilestoneTruth");
const {
  syncAppointmentGoogleCalendar,
  buildCalendarEventPayload
} = require("../core/appointmentGoogleSyncEngine");
const {
  VIRTUAL_MEETING_URL_SOURCES,
  VIRTUAL_URL_STATUSES,
  isZoomProvider,
  resolveCanonicalVirtualMeetingUrl
} = require("../core/virtualMeetingUrlResolver");
const {
  OFFICE_ADDRESS_SOURCES,
  OFFICE_ADDRESS_STATUSES,
  composeOfficeAddressFromOfficeModel,
  resolveCanonicalOfficeAddress
} = require("../core/officeAddressResolver");

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

  // Implements BR-077 — office branch prefers complete fullAddress / street+suite.
  // Final in-person snapshot is applied via resolveCanonicalOfficeAddress in createAppointment.
  if (locationType === MEETING_LOCATION_TYPES.OFFICE) {
    const office = profile?.office || getOrganizationSettings().office;
    const composed = composeOfficeAddressFromOfficeModel(office);

    return {
      meetingLocationType: MEETING_LOCATION_TYPES.OFFICE,
      meetingLocationName: office.name || "Office",
      meetingAddress: composed,
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

  if (payload.meetingLocationName || payload.meetingAddress || payload.meetingLocationAddress) {
    return {
      meetingLocationType: locationType,
      meetingLocationName: payload.meetingLocationName || null,
      meetingAddress:
        payload.meetingAddress || payload.meetingLocationAddress || null,
      meetingNotes: payload.meetingNotes || null,
      meetingLocationUrl: payload.meetingLocationUrl || null
    };
  }

  return {
    meetingLocationType: locationType,
    meetingLocationName: null,
    meetingAddress: null,
    meetingNotes: null,
    meetingLocationUrl: null
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
  // Implements BR-120 — org-scoped core lookup when organizationId is known.
  const prospectId = await findCoreProspectIdByPhone(
    phone,
    payload.organizationId || undefined
  );

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

async function syncProspectContact(phone, contact = {}, organizationId) {
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

  if (Object.keys(patch).length && organizationId) {
    await updateProspectInOrganization(phone, organizationId, patch).catch(() => {});
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

  // Implements BR-120 — resolve/ensure canonical core BEFORE Calendar or appointment writes.
  // Never persist atlas_appointments.prospect_id = null on the booking path.
  const identity = await resolveCanonicalProspectIdentity({
    phone: prospectPhone,
    organizationId,
    displayName: contact?.firstName
      ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()
      : prospect.name || null,
    email: contact?.email || null,
    legacyProspectId: prospect.id || null,
    ensureCore: true
  });

  if (!identity.ok || !identity.coreProspectId) {
    throw buildError(
      identity.reasonCode || PROSPECT_IDENTITY_REASON_CODES.UNRESOLVED,
      "Canonical prospect identity could not be resolved for this organization.",
      409
    );
  }

  const prospectId = identity.coreProspectId;

  await syncProspectContact(prospectPhone, contact, organizationId);

  const isVirtual = meeting.meetingType === MEETING_TYPES.VIRTUAL;
  const email = normalizeEmail(contact.email) || extractEmailFromProspectNotes(prospect.notes);
  const attendeeEmail = email && validateEmailFormat(email) ? email : null;

  let meetingUrl = null;
  let officeLocation = null;
  // Implements BR-076 — incomplete existingBooking must not suppress org Personal Meeting URL.
  let virtualUrlResult = {
    url: null,
    status: isVirtual ? VIRTUAL_URL_STATUSES.PENDING : VIRTUAL_URL_STATUSES.NOT_APPLICABLE,
    source: VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE,
    provider: meeting.meetingProvider || null
  };
  // Implements BR-077 — complete office address snapshot (includes suite/unit).
  let officeAddressResult = {
    address: null,
    status: isVirtual ? OFFICE_ADDRESS_STATUSES.NOT_APPLICABLE : OFFICE_ADDRESS_STATUSES.UNAVAILABLE,
    source: OFFICE_ADDRESS_SOURCES.UNAVAILABLE
  };

  if (isVirtual) {
    virtualUrlResult = await resolveCanonicalVirtualMeetingUrl({
      organizationId,
      meetingType: meeting.meetingType,
      meetingProvider: meeting.meetingProvider,
      existingBooking
    });

    meetingUrl = virtualUrlResult.url;

    if (
      !existingBooking &&
      isZoomProvider(meeting.meetingProvider, meeting.meetingType) &&
      !meetingUrl
    ) {
      throw buildError(
        "MEETING_URL_NOT_CONFIGURED",
        "Personal meeting URL is not configured. Add it under Organization → Meeting Management.",
        400
      );
    }
  } else if (location.meetingLocationType === MEETING_LOCATION_TYPES.PUBLIC_LOCATION) {
    // Implements BR-078 — never substitute office address for public-location appointments.
    const {
      hasPublicLocationDetails,
      composePublicLocationDisplay
    } = require("../core/publicLocationDetails");

    if (
      !hasPublicLocationDetails({
        meetingLocationName: input.meetingLocationName || location.meetingLocationName,
        meetingLocationAddress: input.meetingAddress || location.meetingAddress
      })
    ) {
      throw buildError(
        "PUBLIC_LOCATION_REQUIRED",
        "Public location requires a place name or address.",
        400
      );
    }

    location.meetingLocationName =
      input.meetingLocationName || location.meetingLocationName || null;
    location.meetingAddress = input.meetingAddress || location.meetingAddress || null;
    location.meetingLocationUrl =
      input.meetingLocationUrl || location.meetingLocationUrl || null;
    officeLocation =
      composePublicLocationDisplay({
        meetingLocationName: location.meetingLocationName,
        meetingLocationAddress: location.meetingAddress
      }) || location.meetingAddress;
    officeAddressResult = {
      address: location.meetingAddress || null,
      status: location.meetingAddress
        ? OFFICE_ADDRESS_STATUSES.CONFIGURED
        : OFFICE_ADDRESS_STATUSES.UNAVAILABLE,
      source: OFFICE_ADDRESS_SOURCES.REQUEST
    };
  } else {
    officeAddressResult = await resolveCanonicalOfficeAddress({
      organizationId,
      meetingType: meeting.meetingType,
      requestAddress: input.meetingAddress || location.meetingAddress || null
    });
    officeLocation = officeAddressResult.address;
    location.meetingAddress = officeLocation;
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
        interviewType: isVirtual
          ? "Zoom"
          : location.meetingLocationType === MEETING_LOCATION_TYPES.PUBLIC_LOCATION
            ? "Public Location"
            : "In Person",
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

  if (isVirtual) {
    // Re-resolve after booking so booking-echoed URLs still win over org settings.
    virtualUrlResult = await resolveCanonicalVirtualMeetingUrl({
      organizationId,
      meetingType: meeting.meetingType,
      meetingProvider: meeting.meetingProvider,
      existingBooking: {
        success: existingBooking?.success,
        startTimeISO: bookingResult.startTimeISO || existingBooking?.startTimeISO,
        endTimeISO: bookingResult.endTimeISO || existingBooking?.endTimeISO,
        googleCalendarEventId:
          bookingResult.googleCalendarEventId || existingBooking?.googleCalendarEventId || null,
        meetingUrl: bookingResult.meetingUrl || existingBooking?.meetingUrl || meetingUrl,
        zoomLink: bookingResult.zoomLink || existingBooking?.zoomLink || null,
        zoomUrl: bookingResult.zoomUrl || existingBooking?.zoomUrl || null,
        meetLink: bookingResult.meetLink || existingBooking?.meetLink || null
      }
    });
    meetingUrl = virtualUrlResult.url;
  }

  const emailStatus = resolveEmailStatus(email);
  const confirmationStatus =
    emailStatus === "missing" ? CONFIRMATION_STATUSES.MISSING_EMAIL : CONFIRMATION_STATUSES.PENDING;

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

  const {
    meetingLocationUrl: resolvedMeetingLocationUrl = null,
    ...persistedLocation
  } = location;

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
      ...persistedLocation,
      meetingAddress: isVirtual
        ? null
        : persistedLocation.meetingLocationType === MEETING_LOCATION_TYPES.PUBLIC_LOCATION
          ? persistedLocation.meetingAddress
          : officeLocation,
      meetingNotes: notes || null,
      virtualMeetingUrl: isVirtual ? virtualUrlResult.url : null,
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
        virtualUrlSource: virtualUrlResult.source,
        officeAddressStatus: officeAddressResult.status,
        officeAddressSource: officeAddressResult.source,
        meetingLocationUrl:
          persistedLocation.meetingLocationType === MEETING_LOCATION_TYPES.PUBLIC_LOCATION
            ? resolvedMeetingLocationUrl || input.meetingLocationUrl || null
            : null,
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
    await updateProspectInOrganization(prospectPhone, organizationId, {
      calendar_event_id: bookingResult.googleCalendarEventId,
      appointment_date: bookingResult.startTimeISO,
      interview_time: bookingResult.startTimeISO,
      interview_type: isVirtual ? "Zoom" : "In Person",
      current_step: "CONFIRMED"
    });
  }

  if (purpose === APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW && !skipWorkflowSideEffects) {
    await advanceProspectWorkflow(prospectPhone, {
      organizationId,
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

function resolveRescheduleSlot(appointment, input = {}) {
  const { dateKey, timeKey } = input;

  if (input.skipSlotValidation && input.scheduledTime) {
    const durationMinutes = Number(appointment.durationMinutes) || 30;

    return {
      dateKey: dateKey || null,
      timeKey: timeKey || null,
      startTimeISO: input.scheduledTime,
      endTimeISO:
        input.endDateTime ||
        new Date(Date.parse(input.scheduledTime) + durationMinutes * 60_000).toISOString()
    };
  }

  if (!dateKey || !timeKey) {
    throw buildError("VALIDATION_FAILED", "dateKey and timeKey are required.");
  }

  return null;
}

async function persistRescheduledAppointment(appointment, input, context = {}) {
  const { organizationId, agentId } = context;
  const reason = input.reason;

  if (!isValidRescheduleReason(reason)) {
    throw buildError("INVALID_REASON", "Invalid reschedule reason.");
  }

  let matchedSlot = resolveRescheduleSlot(appointment, input);

  if (!matchedSlot) {
    const { dateKey, timeKey } = input;

    const slotCheck = await appointmentSchedulingEngine.getAvailableSlots({
      agentId: appointment.agentId,
      organizationId: appointment.organizationId,
      date: dateKey,
      purpose: appointment.purpose,
      durationMinutes: appointment.durationMinutes,
      maxResults: 50,
      excludeAppointmentId: appointment.id
    });

    matchedSlot = slotCheck.slots.find(
      (slot) => slot.dateKey === dateKey && slot.timeKey === timeKey
    );

    if (!matchedSlot) {
      throw buildError("UNAVAILABLE", "Selected slot is no longer available.");
    }
  }

  const previousStart = appointment.startDateTime;
  const { dateKey, timeKey } = matchedSlot;

  // Implements BR-076 — preserve persisted Zoom URL; fill missing from org settings only.
  const virtualUrlResolution = await resolveCanonicalVirtualMeetingUrl({
    organizationId: appointment.organizationId || organizationId,
    meetingType: appointment.meetingType,
    meetingProvider: appointment.meetingProvider,
    persistedAppointment: appointment
  });

  const appointmentForSync = {
    ...appointment,
    startDateTime: matchedSlot.startTimeISO,
    endDateTime: matchedSlot.endTimeISO,
    virtualMeetingUrl:
      appointment.meetingType === MEETING_TYPES.VIRTUAL
        ? virtualUrlResolution.url || appointment.virtualMeetingUrl || null
        : null
  };

  // Implements BR-039/BR-050 — never silently skip Google sync when event id is missing/stale.
  const calendarPayload = buildCalendarEventPayload(appointmentForSync, {
    summary: formatAppointmentTitle(appointment.purpose, appointment.metadata),
    startTimeISO: matchedSlot.startTimeISO,
    endTimeISO: matchedSlot.endTimeISO,
    timezone: appointment.timezone
  });
  const calendarSync = await syncAppointmentGoogleCalendar(appointmentForSync, {
    organizationId: appointment.organizationId,
    eventOverrides: {
      summary: calendarPayload.summary,
      description: calendarPayload.description,
      startTimeISO: calendarPayload.startTimeISO,
      endTimeISO: calendarPayload.endTimeISO,
      timezone: calendarPayload.timezone,
      location: calendarPayload.location,
      zoomUrl: calendarPayload.zoomUrl
    }
  });

  appointmentReminderEngine.cancelReminders(appointment.id);

  const domainUpdated = await appointmentDomainService.rescheduleAppointment(appointment, {
    actor: agentId,
    reason,
    scheduledTime: matchedSlot.startTimeISO,
    endDateTime: matchedSlot.endTimeISO,
    channel: input.channel || "mission_control",
    payload: { dateKey, timeKey, previousStart, newStart: matchedSlot.startTimeISO },
    newValues: { dateKey, timeKey }
  });

  const updated = {
    ...domainUpdated,
    virtualMeetingUrl:
      appointment.meetingType === MEETING_TYPES.VIRTUAL
        ? virtualUrlResolution.url || domainUpdated.virtualMeetingUrl || appointment.virtualMeetingUrl || null
        : domainUpdated.virtualMeetingUrl || null,
    confirmationStatus: appointment.confirmationStatus,
    reminderStatus: appointment.reminderStatus,
    calendarEventId: calendarSync.calendarEventId,
    calendarProvider: calendarSync.calendarProvider,
    metadata: {
      ...(domainUpdated.metadata || appointment.metadata || {}),
      virtualUrlStatus:
        appointment.meetingType === MEETING_TYPES.VIRTUAL
          ? virtualUrlResolution.status
          : domainUpdated.metadata?.virtualUrlStatus || appointment.metadata?.virtualUrlStatus,
      virtualUrlSource:
        appointment.meetingType === MEETING_TYPES.VIRTUAL
          ? virtualUrlResolution.source
          : domainUpdated.metadata?.virtualUrlSource || appointment.metadata?.virtualUrlSource,
      calendarSyncStatus: calendarSync.calendarSyncStatus,
      calendarSyncError: calendarSync.calendarSyncError,
      calendarSyncedAt: new Date().toISOString(),
      calendarSyncAction: calendarSync.action
    }
  };

  const saved = await appointmentRepository.save(updated);
  const reminderResult = appointmentReminderEngine.replaceReminders(saved);

  await appointmentRepository.save({
    ...saved,
    reminderStatus: reminderResult.status
  });

  await updateProspectInOrganization(
    appointment.prospectPhone,
    appointment.organizationId || organizationId,
    {
      appointment_date: matchedSlot.startTimeISO,
      interview_time: matchedSlot.startTimeISO,
      calendar_event_id: calendarSync.calendarEventId || null
    }
  ).catch(() => {});

  if (!input.skipWorkflowAdvance) {
    await advanceProspectWorkflow(appointment.prospectPhone, {
      organizationId: appointment.organizationId || organizationId,
      targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      capturedFields: {
        interviewDateTime: matchedSlot.startTimeISO,
        confirmed: true
      },
      interactionNotes:
        dateKey && timeKey
          ? `Interview rescheduled to ${dateKey} at ${timeKey}.`
          : `Interview rescheduled to ${matchedSlot.startTimeISO}.`,
      interactionType: "appointment_reschedule"
    }).catch((error) => {
      console.error("[appointment/reschedule/workflow]", error.message);
    });
  }

  return enrichWithProspect(saved);
}

async function rescheduleAppointment(id, input, context = {}) {
  const { organizationId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  return persistRescheduledAppointment(appointment, input, context);
}

async function cancelAppointment(id, input, context = {}) {
  const { organizationId, agentId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  // Implements BR-121 — Calendar already-absent / unexpected Calendar failures must not
  // leave Atlas appointment scheduled. Domain cancel always continues after Calendar attempt.
  let calendarCancelResult = null;
  try {
    calendarCancelResult = await cancelCapacitySlot({
      appointmentType:
        appointment.purpose === APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW
          ? APPOINTMENT_TYPES.INTERVIEW
          : APPOINTMENT_TYPES.MEETING,
      startTimeISO: appointment.startDateTime,
      googleCalendarEventId: appointment.calendarEventId,
      organizationId: appointment.organizationId
    });
  } catch (error) {
    console.error(
      "[appointments] calendar/capacity cancel failed; continuing domain cancel (BR-121):",
      error.message,
      { appointmentId: appointment.id, calendarEventId: appointment.calendarEventId }
    );
  }

  if (calendarCancelResult?.calendarError) {
    console.error(
      "[appointments] calendar delete reported error; continuing domain cancel (BR-121):",
      calendarCancelResult.calendarError,
      { appointmentId: appointment.id, calendarEventId: appointment.calendarEventId }
    );
  }

  appointmentReminderEngine.cancelReminders(appointment.id);

  const domainUpdated = await appointmentDomainService.cancelAppointment(appointment, {
    actor: agentId || "agent",
    reason: input.reason || "unspecified",
    channel: "mission_control"
  });

  const saved = await appointmentRepository.save({
    ...domainUpdated,
    // BR-121 — reconcile Calendar linkage once domain cancel succeeds.
    calendarEventId: null,
    reminderStatus: REMINDER_STATUSES.CANCELLED
  });

  await updateProspectInOrganization(
    appointment.prospectPhone,
    appointment.organizationId || organizationId,
    {
      interview_time: null,
      appointment_date: null,
      calendar_event_id: null,
      current_step: "SCHEDULE"
    }
  ).catch((error) => {
    console.error("[appointments] cancel prospect sync failed:", error.message);
  });

  // BR-039 write-side — cancel must not leave durable INTERVIEW_SCHEDULED claim.
  // Rollback also enters here via missionExecutionApplicationService.rollbackPersistedAppointment.
  try {
    await demotePersistedScheduleClaimAfterCancel(appointment.prospectPhone, {
      organizationId: appointment.organizationId || organizationId || null,
      prospectId: appointment.prospectId || null
    });
  } catch (error) {
    console.error(
      "[appointments] cancel workflow schedule-claim demotion failed:",
      error.message,
      { phone: appointment.prospectPhone, appointmentId: appointment.id }
    );
  }

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

  await syncProspectContact(phone, { email: normalized }, organizationId);

  return {
    email: normalized,
    emailStatus: resolveEmailStatus(normalized),
    typoSuggestion
  };
}

/**
 * Create-or-update Google Calendar for an existing persisted appointment.
 * Used by repair/reconnect paths when calendarEventId is missing or stale.
 */
async function reconcileAppointmentGoogleCalendar(id, context = {}) {
  const { organizationId } = context;
  const appointment = await appointmentRepository.findById(id, organizationId);

  if (!appointment) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }

  const calendarSync = await syncAppointmentGoogleCalendar(appointment, {
    organizationId: appointment.organizationId
  });

  const saved = await appointmentRepository.save({
    ...appointment,
    calendarEventId: calendarSync.calendarEventId,
    calendarProvider: calendarSync.calendarProvider,
    metadata: {
      ...(appointment.metadata || {}),
      calendarSyncStatus: calendarSync.calendarSyncStatus,
      calendarSyncError: calendarSync.calendarSyncError,
      calendarSyncedAt: new Date().toISOString(),
      calendarSyncAction: calendarSync.action
    },
    updatedAt: nowIso()
  });

  await updateProspectInOrganization(
    appointment.prospectPhone,
    appointment.organizationId || organizationId,
    {
      calendar_event_id: calendarSync.calendarEventId || null,
      appointment_date: appointment.startDateTime,
      interview_time: appointment.startDateTime
    }
  ).catch(() => {});

  return enrichWithProspect(saved);
}

module.exports = {
  getProfile,
  updateProfile,
  getSlots,
  getAppointment,
  listAppointments,
  createAppointment,
  rescheduleAppointment,
  reconcileAppointmentGoogleCalendar,
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
