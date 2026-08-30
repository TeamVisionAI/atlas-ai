const crypto = require("crypto");
const agendaContactRepository = require("../repositories/agendaContactRepository");
const agendaClientRepository = require("../repositories/agendaClientRepository");
const appointmentRepository = require("../repositories/appointmentRepository");
const appointmentSchedulingEngine = require("../services/appointmentSchedulingEngine");
const { getAppointmentProfile, resolveDurationForPurpose } = require("../services/appointmentProfileService");
const {
  scheduleAppointment,
  cancelAppointment: cancelScheduledAppointment
} = require("../services/schedulingService");
const { findUserById } = require("../services/atlasUserService");
const { resolveCanonicalVirtualMeetingUrl, isZoomProvider } = require("../core/virtualMeetingUrlResolver");
const { resolveCanonicalOfficeAddress } = require("../core/officeAddressResolver");
const { APPOINTMENT_TYPES } = require("../core/configuration/appointmentTypes");
const {
  APPOINTMENT_PURPOSES,
  APPOINTMENT_SOURCES,
  APPOINTMENT_OUTCOMES,
  MEETING_TYPES,
  VIRTUAL_PROVIDERS,
  MEETING_LOCATION_TYPES,
  CONFIRMATION_STATUSES,
  REMINDER_STATUSES,
  isValidPurpose,
  isValidMeetingType,
  isValidOutcome
} = require("../core/configuration/appointmentDomain");
const { recordHistoryEvent } = require("../core/appointmentHistory");
const { normalizePhoneNumber, formatPhoneForStorage } = require("../core/phoneNormalizer");
const { normalizePreferredLanguage } = require("../core/prospectLanguage");
const {
  normalizeEmail,
  validateEmailFormat,
  formatEmailForProspectNotes
} = require("../core/emailNormalization");
const { generateNextProspectNumber } = require("../services/prospectNumberService");
const {
  supabase,
  findProspectByNormalizedPhoneInOrganization,
  findProspectInOrganization
} = require("../services/supabaseService");

const STANDALONE_PURPOSES = new Set([
  APPOINTMENT_PURPOSES.TRAINING,
  APPOINTMENT_PURPOSES.CLIENT_SERVICE,
  APPOINTMENT_PURPOSES.FNA,
  APPOINTMENT_PURPOSES.POLICY_REVIEW,
  APPOINTMENT_PURPOSES.OTHER
]);

const AGENDA_ENTRY_METHOD = "AGENDA_PROMOTION";
const AGENDA_SOURCE = "AGENDA";

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

function resolveActorId(context = {}) {
  return context.userId || context.agentId || null;
}

function resolveUserDisplayName(user) {
  if (!user) return null;
  const named = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return named || user.name || user.email || null;
}

function splitPersonName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return { firstName: "Agenda", lastName: "Contact" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Contact" };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function contactLanguage(contact = {}, fallback = null) {
  return (
    normalizePreferredLanguage(
      contact.preferredLanguage || contact.metadata?.preferredLanguage || fallback
    ) || null
  );
}

function contactSource(contact = {}, fallback = null) {
  return clean(contact.source || contact.metadata?.source || fallback);
}

function contactNotes(contact = {}, fallback = null) {
  return clean(contact.notes || contact.metadata?.notes || fallback);
}

// Live production prospects has no email column. Canonical store is notes EMAIL: token.
function buildPromotedRecruitNotes(contact = {}) {
  const notes = contactNotes(contact);
  const email = normalizeEmail(contact.email);
  const emailToken =
    email && validateEmailFormat(email) ? formatEmailForProspectNotes(email) : null;
  if (notes && emailToken) {
    return String(notes).includes(emailToken) ? notes : `${notes} | ${emailToken}`;
  }
  return notes || emailToken || null;
}

async function createAgendaContact(input, context) {
  const name = clean(input.name);
  if (!name) throw error("VALIDATION_FAILED", "Name is required.");
  const preferredLanguage = contactLanguage(input);
  const source = contactSource(input);
  const notes = contactNotes(input);
  return agendaContactRepository.save({
    organizationId: context.organizationId,
    ownerUserId: context.userId,
    name,
    phone: clean(input.phone),
    email: clean(input.email)?.toLowerCase() || null,
    preferredLanguage,
    source,
    notes,
    status: "active",
    metadata: {
      ...(input.metadata || {}),
      preferredLanguage,
      source,
      notes
    },
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

async function presentAgendaContact(contact) {
  if (!contact) return null;
  const owner = contact.ownerUserId ? await findUserById(contact.ownerUserId).catch(() => null) : null;
  return {
    ...contact,
    preferredLanguage: contactLanguage(contact),
    source: contactSource(contact),
    notes: contactNotes(contact),
    ownerDisplayName: resolveUserDisplayName(owner) || "Former teammate"
  };
}

async function getAgendaContact(contactId, context) {
  const contact = await agendaContactRepository.findById(contactId, context.organizationId);
  if (!contact) throw error("AGENDA_CONTACT_NOT_FOUND", "Agenda contact not found.", 404);
  return presentAgendaContact(contact);
}

async function resolveContact(input, context) {
  if (input.agendaContactId) {
    const existing = await agendaContactRepository.findById(
      input.agendaContactId,
      context.organizationId
    );
    if (!existing) throw error("AGENDA_CONTACT_NOT_FOUND", "Agenda contact not found.", 404);
    return existing;
  }
  return createAgendaContact(input.contact || input, context);
}

async function loadStandaloneAppointment(appointmentId, context) {
  const appointment = await appointmentRepository.findById(appointmentId, context.organizationId);
  if (!appointment || !appointment.metadata?.standaloneAgenda) {
    throw error("AGENDA_APPOINTMENT_NOT_FOUND", "Standalone Agenda appointment not found.", 404);
  }
  return appointment;
}

async function loadAgendaContactForAppointment(appointment, context) {
  if (!appointment.agendaContactId) {
    throw error("AGENDA_CONTACT_NOT_FOUND", "Appointment is not linked to an Agenda contact.", 404);
  }
  const contact = await agendaContactRepository.findById(
    appointment.agendaContactId,
    context.organizationId
  );
  if (!contact) {
    throw error("AGENDA_CONTACT_NOT_FOUND", "Agenda contact not found.", 404);
  }
  return contact;
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
  } else if (meetingType === MEETING_TYPES.PHONE) {
    meetingLocationType = null;
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
      notes: clean(input.notes) || contactNotes(contact),
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
  const draft = {
    id: crypto.randomUUID(),
    organizationId,
    prospectId: null,
    agendaContactId: contact.id,
    // BR-168 / BR-177 hard boundary: attendee phone is Agenda contact data, never prospect identity.
    prospectPhone: null,
    agentId: userId,
    ownerRepId: owner?.rep_id || null,
    interviewerUserId: userId,
    interviewerName: resolveUserDisplayName(owner),
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
    meetingNotes: clean(input.notes) || contactNotes(contact),
    virtualMeetingUrl: meetingUrl,
    calendarEventId: booking.googleCalendarEventId || null,
    calendarProvider: booking.googleCalendarEventId ? "google" : null,
    confirmationStatus: CONFIRMATION_STATUSES.CONFIRMED,
    emailInvitationStatus: contact.email ? "sent" : "not_applicable",
    reminderStatus: REMINDER_STATUSES.PENDING,
    humanAssistRequired: false,
    rescheduleCount: 0,
    outcome: null,
    outcomeNotes: null,
    metadata: {
      lifecycleState: "scheduled",
      standaloneAgenda: true,
      noRecruitAi: true,
      prospectName: contact.name,
      prospectEmail: contact.email,
      agendaContactName: contact.name,
      agendaContactPhone: contact.phone,
      agendaContactEmail: contact.email,
      agendaContactLanguage: contactLanguage(contact),
      agendaContactSource: contactSource(contact),
      agendaContactNotes: contactNotes(contact),
      agendaKind: clean(input.agendaKind) || purpose,
      notes: clean(input.notes) || contactNotes(contact)
    },
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  };
  draft.history = recordHistoryEvent(
    { history: [] },
    {
      type: "agenda_appointment_created",
      actor: userId,
      at: now,
      summary: "Standalone Agenda appointment scheduled"
    }
  );

  let appointment;
  try {
    appointment = await appointmentRepository.save(draft);
  } catch (saveError) {
    await cancelScheduledAppointment({
      appointmentType: APPOINTMENT_TYPES.MEETING,
      startTimeISO: booking.startTimeISO,
      googleCalendarEventId: booking.googleCalendarEventId || null,
      organizationId
    }).catch(() => {});
    throw saveError;
  }

  return { contact: await presentAgendaContact(contact), appointment };
}

function resolveOutcomeStatus(outcome, currentStatus) {
  if (outcome === APPOINTMENT_OUTCOMES.CANCELLED) return "cancelled";
  if (outcome === APPOINTMENT_OUTCOMES.NO_SHOW) return "no_show";
  if (outcome === APPOINTMENT_OUTCOMES.FOLLOW_UP || outcome === APPOINTMENT_OUTCOMES.RESCHEDULED) {
    return currentStatus;
  }
  return "completed";
}

function resolveOutcomeLifecycle(outcome, currentLifecycle) {
  if (outcome === APPOINTMENT_OUTCOMES.CANCELLED) return "cancelled";
  if (outcome === APPOINTMENT_OUTCOMES.NO_SHOW) return "no_show";
  if (outcome === APPOINTMENT_OUTCOMES.FOLLOW_UP || outcome === APPOINTMENT_OUTCOMES.RESCHEDULED) {
    return currentLifecycle || "scheduled";
  }
  return "completed";
}

async function recordStandaloneOutcome(appointmentId, input, context) {
  let appointment = await loadStandaloneAppointment(appointmentId, context);
  const outcome = clean(input.outcome);
  if (!isValidOutcome(outcome)) throw error("INVALID_OUTCOME", "Invalid Agenda outcome.");

  const notes = clean(input.outcomeNotes || input.notes);
  const actor = resolveActorId(context);
  const previousOutcome = clean(appointment.outcome);

  // Implements BR-177 — idempotent when the same outcome is already recorded.
  if (previousOutcome === outcome && (!notes || notes === clean(appointment.outcomeNotes))) {
    return appointment;
  }

  if (outcome === APPOINTMENT_OUTCOMES.CANCELLED && appointment.status !== "cancelled") {
    const { cancelAppointment } = require("./appointmentApplicationService");
    await cancelAppointment(
      appointmentId,
      { reason: notes || "outcome_cancelled" },
      { organizationId: context.organizationId, agentId: actor }
    );
    appointment =
      (await appointmentRepository.findById(appointmentId, context.organizationId)) || appointment;
  }

  const now = new Date().toISOString();
  const saved = await appointmentRepository.save({
    ...appointment,
    status: resolveOutcomeStatus(outcome, appointment.status),
    outcome,
    outcomeNotes: notes || appointment.outcomeNotes || null,
    history: recordHistoryEvent(appointment, {
      type: "agenda_outcome_recorded",
      actor: actor || "agent",
      at: now,
      reason: notes,
      summary: `Agenda outcome: ${outcome}`,
      oldValues: { outcome: previousOutcome },
      newValues: { outcome }
    }),
    metadata: {
      ...(appointment.metadata || {}),
      lifecycleState: resolveOutcomeLifecycle(outcome, appointment.metadata?.lifecycleState),
      // Recruited/client outcomes stay pending until an explicit promote action.
      promotionPending: outcome === APPOINTMENT_OUTCOMES.RECRUITED || outcome === APPOINTMENT_OUTCOMES.CLIENT
    },
    updatedAt: now
  });
  return saved;
}

async function insertPromotedRecruitProspect({ contact, context, storagePhone, normalizedPhone }) {
  const { firstName, lastName } = splitPersonName(contact.name);
  const preferredLanguage = contactLanguage(contact) || "english";
  const source = contactSource(contact, AGENDA_SOURCE);
  const notes = buildPromotedRecruitNotes(contact);
  const actor = resolveActorId(context);
  const prospectNumber = await generateNextProspectNumber(context.organizationId).catch(() => null);
  const communicationLanguage = preferredLanguage === "spanish" ? "es" : "en";

  // Implements BR-177 — same live prospects insert shape as Quick Capture / WhatsApp create.
  // Do not write prospects.email; production schema has no such column (PGRST204).
  const insertRow = {
    phone: storagePhone,
    normalized_phone: normalizedPhone,
    name: contact.name,
    first_name: firstName,
    last_name: lastName,
    preferred_language: preferredLanguage,
    communication_language: communicationLanguage,
    language: communicationLanguage,
    entry_method: AGENDA_ENTRY_METHOD,
    source,
    owner_user_id: contact.ownerUserId,
    created_by_user_id: actor,
    organization_id: context.organizationId,
    status: "NEW",
    current_step: "NEW",
    prospect_number: prospectNumber,
    preferred_communication_channel: "WHATSAPP",
    last_message: "",
    notes,
    assignment_status: "assigned",
    assignment_source: AGENDA_ENTRY_METHOD,
    attention_status: "none",
    escalation_level: 0
  };

  const { data, error: insertError } = await supabase.from("prospects").insert(insertRow).select("*").single();
  if (insertError) {
    if (insertError.code === "23505") {
      const existing =
        (await findProspectByNormalizedPhoneInOrganization(normalizedPhone, context.organizationId)) ||
        (await findProspectInOrganization(storagePhone, context.organizationId));
      if (existing) return { prospect: existing, created: false };
    }
    throw insertError;
  }
  return { prospect: data, created: true };
}

// Implements BR-177 — explicit recruit promotion only; never starts Recruit AI by itself.
async function promoteToRecruit(appointmentId, input, context) {
  const appointment = await loadStandaloneAppointment(appointmentId, context);
  const contact = await loadAgendaContactForAppointment(appointment, context);

  if (contact.promotedProspectId) {
    const existing = await findProspectInOrganization(
      appointment.prospectPhone,
      context.organizationId
    ).catch(() => null);
    return {
      alreadyPromoted: true,
      created: false,
      prospectId: contact.promotedProspectId,
      prospect: existing,
      contact: await presentAgendaContact(contact),
      appointment
    };
  }

  const rawPhone = clean(input?.phone) || clean(contact.phone) || clean(appointment.metadata?.agendaContactPhone);
  const normalizedPhone = normalizePhoneNumber(rawPhone);
  if (!normalizedPhone) {
    throw error("VALIDATION_FAILED", "Phone is required to promote an Agenda contact to Recruit.");
  }
  const storagePhone = formatPhoneForStorage(normalizedPhone);

  let prospect =
    (await findProspectByNormalizedPhoneInOrganization(normalizedPhone, context.organizationId)) ||
    (await findProspectInOrganization(storagePhone, context.organizationId));
  let created = false;

  if (!prospect) {
    const inserted = await insertPromotedRecruitProspect({
      contact,
      context,
      storagePhone,
      normalizedPhone
    });
    prospect = inserted.prospect;
    created = inserted.created;
  }

  const actor = resolveActorId(context);
  const now = new Date().toISOString();
  const savedContact = await agendaContactRepository.save({
    ...contact,
    phone: contact.phone || storagePhone,
    promotedProspectId: prospect.id,
    status: "promoted_recruit",
    updatedAt: now
  });

  const savedAppointment = await appointmentRepository.save({
    ...appointment,
    prospectId: prospect.id,
    prospectPhone: storagePhone,
    history: recordHistoryEvent(appointment, {
      type: "agenda_promoted_recruit",
      actor: actor || "agent",
      at: now,
      summary: created
        ? "Agenda contact promoted to Recruit"
        : "Agenda contact linked to existing Recruit prospect",
      newValues: { prospectId: prospect.id }
    }),
    metadata: {
      ...(appointment.metadata || {}),
      standaloneAgenda: true,
      noRecruitAi: true,
      promotedToRecruit: true,
      promotedProspectId: prospect.id,
      prospectName: prospect.name || contact.name,
      prospectEmail: prospect.email || contact.email,
      agendaContactPhone: contact.phone || storagePhone
    },
    updatedAt: now
  });

  return {
    alreadyPromoted: false,
    created,
    prospectId: prospect.id,
    prospect,
    contact: await presentAgendaContact(savedContact),
    appointment: savedAppointment
  };
}

// Implements BR-177 — explicit client promotion into atlas_agenda_clients, not prospects.
async function promoteToClient(appointmentId, input, context) {
  const appointment = await loadStandaloneAppointment(appointmentId, context);
  const contact = await loadAgendaContactForAppointment(appointment, context);

  if (contact.promotedClientId) {
    const existing = await agendaClientRepository.findById(
      contact.promotedClientId,
      context.organizationId
    );
    return {
      alreadyPromoted: true,
      created: false,
      clientId: contact.promotedClientId,
      client: existing,
      contact: await presentAgendaContact(contact),
      appointment
    };
  }

  const existingByContact = await agendaClientRepository.findByAgendaContactId(
    contact.id,
    context.organizationId
  );
  if (existingByContact) {
    const savedContact = await agendaContactRepository.save({
      ...contact,
      promotedClientId: existingByContact.id,
      status: contact.promotedProspectId ? contact.status : "promoted_client",
      updatedAt: new Date().toISOString()
    });
    return {
      alreadyPromoted: true,
      created: false,
      clientId: existingByContact.id,
      client: existingByContact,
      contact: await presentAgendaContact(savedContact),
      appointment
    };
  }

  const actor = resolveActorId(context);
  const now = new Date().toISOString();
  const notes = clean(input?.notes) || contactNotes(contact);
  const client = await agendaClientRepository.save({
    organizationId: context.organizationId,
    ownerUserId: contact.ownerUserId,
    agendaContactId: contact.id,
    name: contact.name,
    phone: contact.phone || appointment.metadata?.agendaContactPhone || null,
    email: contact.email || null,
    preferredLanguage: contactLanguage(contact),
    source: contactSource(contact, AGENDA_SOURCE),
    notes,
    createdBy: actor
  });

  const savedContact = await agendaContactRepository.save({
    ...contact,
    promotedClientId: client.id,
    status: contact.promotedProspectId ? contact.status : "promoted_client",
    updatedAt: now
  });

  const savedAppointment = await appointmentRepository.save({
    ...appointment,
    history: recordHistoryEvent(appointment, {
      type: "agenda_promoted_client",
      actor: actor || "agent",
      at: now,
      summary: "Agenda contact promoted to Client",
      newValues: { clientId: client.id }
    }),
    metadata: {
      ...(appointment.metadata || {}),
      standaloneAgenda: true,
      noRecruitAi: true,
      promotedToClient: true,
      promotedClientId: client.id
    },
    updatedAt: now
  });

  return {
    alreadyPromoted: false,
    created: true,
    clientId: client.id,
    client,
    contact: await presentAgendaContact(savedContact),
    appointment: savedAppointment
  };
}

module.exports = {
  STANDALONE_PURPOSES,
  AGENDA_ENTRY_METHOD,
  AGENDA_SOURCE,
  createAgendaContact,
  listAgendaContacts,
  getAgendaContact,
  presentAgendaContact,
  createStandaloneAppointment,
  recordStandaloneOutcome,
  promoteToRecruit,
  promoteToClient
};
