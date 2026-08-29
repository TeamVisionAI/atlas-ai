const crypto = require("crypto");
const agendaContactRepository = require("../repositories/agendaContactRepository");
const appointmentRepository = require("../repositories/appointmentRepository");
const appointmentSchedulingEngine = require("../services/appointmentSchedulingEngine");
const { getAppointmentProfile, resolveDurationForPurpose } = require("../services/appointmentProfileService");
const { scheduleAppointment } = require("../services/schedulingService");
const { findUserById } = require("../services/atlasUserService");
const { resolveCanonicalVirtualMeetingUrl, isZoomProvider } = require("../core/virtualMeetingUrlResolver");
const { resolveCanonicalOfficeAddress } = require("../core/officeAddressResolver");
const { APPOINTMENT_TYPES } = require("../core/configuration/appointmentTypes");
const {
  APPOINTMENT_PURPOSES,
  APPOINTMENT_SOURCES,
  MEETING_TYPES,
  VIRTUAL_PROVIDERS,
  MEETING_LOCATION_TYPES,
  CONFIRMATION_STATUSES,
  REMINDER_STATUSES,
  isValidPurpose,
  isValidMeetingType
} = require("../core/configuration/appointmentDomain");

const STANDALONE_PURPOSES = new Set([
  APPOINTMENT_PURPOSES.TRAINING,
  APPOINTMENT_PURPOSES.CLIENT_SERVICE,
  APPOINTMENT_PURPOSES.FNA,
  APPOINTMENT_PURPOSES.POLICY_REVIEW,
  APPOINTMENT_PURPOSES.OTHER
]);

function error(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

function clean(value) {
  const text = String(value || "").trim();
  return text || null;
}

async function createAgendaContact(input, context) {
  const name = clean(input.name);
  if (!name) throw error("VALIDATION_FAILED", "Name is required.");
  return agendaContactRepository.save({
    organizationId: context.organizationId,
    ownerUserId: context.userId,
    name,
    phone: clean(input.phone),
    email: clean(input.email)?.toLowerCase() || null,
    status: "active",
    metadata: input.metadata || {},
    createdBy: context.userId
  });
}

async function listAgendaContacts(context, filters = {}) {
  return agendaContactRepository.search({
    organizationId: context.organizationId,
    ownerUserId: context.userId,
    status: filters.status || null,
    limit: filters.limit || 100
  });
}

async function resolveContact(input, context) {
  if (input.agendaContactId) {
    const existing = await agendaContactRepository.findById(
      input.agendaContactId,
      context.organizationId
    );
    if (!existing) throw error("AGENDA_CONTACT_NOT_FOUND", "Agenda contact not found.", 404);
    if (existing.ownerUserId !== context.userId) {
      throw error("AGENDA_CONTACT_FORBIDDEN", "Agenda contact belongs to another user.", 403);
    }
    return existing;
  }
  return createAgendaContact(input.contact || input, context);
}

async function createStandaloneAppointment(input, context) {
  const { organizationId, userId } = context;
  if (!organizationId || !userId) throw error("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);

  const purpose = input.purpose || APPOINTMENT_PURPOSES.TRAINING;
  if (!isValidPurpose(purpose) || !STANDALONE_PURPOSES.has(purpose)) {
    throw error("INVALID_PURPOSE", "Standalone Agenda appointments cannot use recruiting_interview.");
  }
  const meetingType = input.meetingType || MEETING_TYPES.VIRTUAL;
  if (!isValidMeetingType(meetingType)) throw error("INVALID_MEETING_TYPE", "Invalid meeting type.");
  if (!input.dateKey || !input.timeKey) throw error("VALIDATION_FAILED", "dateKey and timeKey are required.");

  const contact = await resolveContact(input, context);
  const profileResult = await getAppointmentProfile(userId);
  const profile = profileResult.appointmentProfile;
  const durationMinutes = Number(input.durationMinutes) || resolveDurationForPurpose(profile, purpose);
  const timezone = profile.defaults.timezone || profileResult.timezone || "America/New_York";

  const slots = await appointmentSchedulingEngine.getAvailableSlots({
    agentId: userId,
    organizationId,
    date: input.dateKey,
    purpose,
    durationMinutes,
    maxResults: 100,
    assignmentMode: "explicit",
    interviewerUserId: userId
  });
  const matchedSlot = (slots.slots || []).find(
    (slot) => slot.dateKey === input.dateKey && slot.timeKey === input.timeKey
  );
  if (!matchedSlot) throw error("UNAVAILABLE", "Selected time is no longer available.", 409);

  const provider = input.meetingProvider || profile.virtualMeeting?.preferredProvider || VIRTUAL_PROVIDERS.ZOOM;
  let meetingUrl = null;
  let meetingAddress = clean(input.meetingAddress);
  let meetingLocationName = clean(input.meetingLocationName);
  let meetingLocationType = input.meetingLocationType || MEETING_LOCATION_TYPES.OFFICE;

  if (meetingType === MEETING_TYPES.VIRTUAL) {
    const virtual = await resolveCanonicalVirtualMeetingUrl({
      organizationId,
      interviewerUserId: userId,
      meetingType,
      meetingProvider: provider
    });
    meetingUrl = virtual.url || null;
    if (isZoomProvider(provider, meetingType) && !meetingUrl) {
      throw error("INTERVIEWER_ZOOM_NOT_CONFIGURED", "Your personal Zoom URL is not configured.");
    }
    meetingLocationType = null;
  } else if (meetingType === MEETING_TYPES.IN_PERSON && meetingLocationType === MEETING_LOCATION_TYPES.OFFICE) {
    const office = await resolveCanonicalOfficeAddress({
      organizationId,
      meetingType,
      requestAddress: meetingAddress
    });
    meetingAddress = office.address || meetingAddress;
    meetingLocationName = meetingLocationName || profile.office?.name || "Office";
  }

  const booking = await scheduleAppointment({
    organizationId,
    appointmentType: APPOINTMENT_TYPES.MEETING,
    dateKey: input.dateKey,
    timeKey: input.timeKey,
    duration: durationMinutes,
    interviewerUserId: userId,
    metadata: {
      name: contact.name,
      phone: contact.phone,
      notes: clean(input.notes),
      meetingUrl,
      zoomUrl: meetingUrl,
      location: meetingUrl || meetingAddress || null,
      attendeeEmail: contact.email,
      interviewerUserId: userId
    },
    timezone
  });
  if (!booking.success) throw error(booking.reason || "UNAVAILABLE", "Unable to book selected time.", 409);

  const owner = await findUserById(userId);
  const now = new Date().toISOString();
  const appointment = await appointmentRepository.save({
    id: crypto.randomUUID(),
    organizationId,
    prospectId: null,
    agendaContactId: contact.id,
    // Kept only as attendee contact data for legacy display compatibility. The
    // standaloneAgenda marker prevents this row from entering recruiting KPIs.
    prospectPhone: contact.phone,
    agentId: userId,
    ownerRepId: owner?.rep_id || null,
    interviewerUserId: userId,
    interviewerName: [owner?.first_name, owner?.last_name].filter(Boolean).join(" ") || owner?.name || null,
    purpose,
    status: "scheduled",
    source: APPOINTMENT_SOURCES.AGENT_MANUAL,
    startDateTime: booking.startTimeISO,
    endDateTime: booking.endTimeISO,
    durationMinutes,
    timezone,
    meetingType,
    meetingProvider: meetingType === MEETING_TYPES.VIRTUAL ? provider : null,
    meetingLocationType: meetingType === MEETING_TYPES.IN_PERSON ? meetingLocationType : null,
    meetingLocationName,
    meetingAddress,
    meetingNotes: clean(input.notes),
    virtualMeetingUrl: meetingUrl,
    calendarEventId: booking.googleCalendarEventId || null,
    calendarProvider: booking.googleCalendarEventId ? "google" : null,
    confirmationStatus: CONFIRMATION_STATUSES.CONFIRMED || "confirmed",
    emailInvitationStatus: contact.email ? "sent" : "not_applicable",
    reminderStatus: REMINDER_STATUSES.PENDING || "pending",
    humanAssistRequired: false,
    rescheduleCount: 0,
    outcome: null,
    outcomeNotes: null,
    history: [{
      type: "agenda_appointment_created",
      actor: userId,
      timestamp: now,
      summary: "Standalone Agenda appointment scheduled"
    }],
    metadata: {
      lifecycleState: "scheduled",
      standaloneAgenda: true,
      noRecruitAi: true,
      agendaContactName: contact.name,
      agendaContactPhone: contact.phone,
      agendaContactEmail: contact.email,
      agendaKind: clean(input.agendaKind) || purpose,
      notes: clean(input.notes)
    },
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  });

  return { contact, appointment };
}

async function recordStandaloneOutcome(appointmentId, input, context) {
  const appointment = await appointmentRepository.findById(appointmentId, context.organizationId);
  if (!appointment || !appointment.metadata?.standaloneAgenda) {
    throw error("AGENDA_APPOINTMENT_NOT_FOUND", "Standalone Agenda appointment not found.", 404);
  }
  if (appointment.agentId !== context.userId) {
    throw error("AGENDA_APPOINTMENT_FORBIDDEN", "Appointment belongs to another user.", 403);
  }
  const allowed = new Set(["recruited", "client", "follow_up", "no_show", "not_interested", "rescheduled", "other"]);
  const outcome = clean(input.outcome);
  if (!allowed.has(outcome)) throw error("INVALID_OUTCOME", "Invalid Agenda outcome.");
  const now = new Date().toISOString();
  const terminal = !["follow_up", "rescheduled"].includes(outcome);
  const saved = await appointmentRepository.save({
    ...appointment,
    status: outcome === "no_show" ? "no_show" : terminal ? "completed" : appointment.status,
    outcome,
    outcomeNotes: clean(input.outcomeNotes),
    history: [
      ...(appointment.history || []),
      { type: "agenda_outcome_recorded", actor: context.userId, timestamp: now, summary: `Agenda outcome: ${outcome}` }
    ],
    metadata: {
      ...(appointment.metadata || {}),
      lifecycleState: outcome === "no_show" ? "no_show" : terminal ? "completed" : appointment.metadata?.lifecycleState || "scheduled",
      promotionPending: outcome === "recruited" || outcome === "client"
    },
    updatedAt: now
  });
  return saved;
}

module.exports = {
  STANDALONE_PURPOSES,
  createAgendaContact,
  listAgendaContacts,
  createStandaloneAppointment,
  recordStandaloneOutcome
};
