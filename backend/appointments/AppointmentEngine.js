/**
 * Sprint 12.0.3 — Production Appointment Engine (channel-agnostic).
 * Books interviews only after Google Calendar confirms event creation.
 */

const crypto = require("crypto");

const appointmentStore = require("./AppointmentStore");
const {
  buildConfirmation,
  resolveMeetingDetails
} = require("./ConfirmationService");
const { buildConfirmationDetails } = require("../core/interviewScheduling");
const { responseBuilder } = require("../core/responseBuilder");
const { releaseSlotByIso } = require("../core/capacityEngine");
const { updateProspect } = require("../services/supabaseService");
const jsonOrganizationRepository = require("../repositories/jsonOrganizationRepository");
const { getConnectorRegistry } = require("../connectors");
const { AppointmentEvent } = require("./AppointmentEvents");

const PROSPECT_STATUS = Object.freeze({
  APPOINTMENT_BOOKED: "APPOINTMENT_BOOKED"
});

const TIME_ZONE = "America/New_York";
const SLOT_DURATION_MS = 30 * 60 * 1000;

function normalizeInterviewType(interviewType) {
  const value = String(interviewType || "office").toLowerCase();

  if (value.includes("zoom")) {
    return "zoom";
  }

  return "office";
}

async function resolveDefaultOrganizationId() {
  const organization = await jsonOrganizationRepository.findFirstActivatedOrganization();
  return organization?.id || null;
}

async function resolveOrganization(organizationId) {
  if (!organizationId) {
    return null;
  }

  return jsonOrganizationRepository.findById(organizationId);
}

function buildSlotDateTime(dateKey, timeKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function slotToInterval(slot) {
  const start = slot.startTimeISO
    ? new Date(slot.startTimeISO)
    : buildSlotDateTime(slot.dateKey, slot.timeKey);
  const end = new Date(start.getTime() + SLOT_DURATION_MS);

  return {
    start,
    end,
    startTimeISO: start.toISOString(),
    endTimeISO: end.toISOString()
  };
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

async function queryGoogleFreeBusy({ timeMin, timeMax, organizationId = null }) {
  try {
    const connector = getConnectorRegistry().get("google-calendar");

    return connector.send({
      operation: "queryFreeBusy",
      timeMin,
      timeMax,
      organizationId
    });
  } catch (error) {
    console.warn("[AppointmentEngine] Google free/busy unavailable:", error.message);
    return { status: "unavailable", busy: [] };
  }
}

function isSlotBusyOnCalendar(interval, busyPeriods = []) {
  for (const busy of busyPeriods) {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);

    if (intervalsOverlap(interval.start, interval.end, busyStart, busyEnd)) {
      return true;
    }
  }

  return false;
}

/**
 * Filter capacity-based open slots against Google Calendar availability.
 * @param {Array<{ dateKey: string, timeKey: string, interviewType: string }>} openSlots
 */
async function filterSlotsByGoogleCalendar(openSlots, organizationId = null) {
  if (!openSlots.length) {
    return openSlots;
  }

  const intervals = openSlots.map((slot) => ({
    slot,
    interval: slotToInterval(slot)
  }));

  const timeMin = intervals.reduce(
    (earliest, entry) =>
      entry.interval.start < earliest ? entry.interval.start : earliest,
    intervals[0].interval.start
  ).toISOString();

  const timeMax = intervals.reduce(
    (latest, entry) => (entry.interval.end > latest ? entry.interval.end : latest),
    intervals[0].interval.end
  ).toISOString();

  const freeBusy = await queryGoogleFreeBusy({ timeMin, timeMax, organizationId });

  if (freeBusy.status === "unavailable" || freeBusy.simulated) {
    return openSlots;
  }

  return intervals
    .filter((entry) => !isSlotBusyOnCalendar(entry.interval, freeBusy.busy || []))
    .map((entry) => entry.slot);
}

/**
 * Filter scheduling options returned by getSchedulingOptions().
 */
async function filterScheduleDaysByGoogleCalendar(schedule, organizationId = null) {
  if (!schedule?.days?.length) {
    return schedule;
  }

  const days = [];

  for (const day of schedule.days) {
    const sourceSlots =
      day.openSlots ||
      (day.timeKeys || []).map((timeKey) => ({
        dateKey: day.dateKey,
        timeKey,
        interviewType: day.interviewType || "office"
      }));

    const filtered = await filterSlotsByGoogleCalendar(sourceSlots, organizationId);
    const filteredKeys = new Set(filtered.map((slot) => slot.timeKey));

    days.push({
      ...day,
      openSlots: filtered,
      times: (day.times || []).filter((_label, index) => {
        const slot = sourceSlots[index];
        return slot ? filteredKeys.has(slot.timeKey) : false;
      })
    });
  }

  return {
    ...schedule,
    days: days.filter((day) => day.times.length > 0)
  };
}

async function findDuplicateAppointment({ prospectPhone, atlasProspectId, startTime }) {
  const appointments = await appointmentStore.listAppointments();
  const target = new Date(startTime).toISOString();

  return (
    appointments.find((entry) => {
      const sameTime = new Date(entry.startTime).toISOString() === target;
      const sameProspect =
        (prospectPhone && entry.prospectPhone === prospectPhone) ||
        (atlasProspectId && entry.atlasProspectId === atlasProspectId);

      return (
        sameTime &&
        sameProspect &&
        ["scheduled", "confirmed"].includes(String(entry.status || "").toLowerCase())
      );
    }) || null
  );
}

async function resolveAtlasProspectId(prospectPhone) {
  try {
    const { getSharedProspectRepository } = require("../prospects");
    const repository = getSharedProspectRepository();
    const prospects = await repository.listAll();
    const match = prospects.find((entry) => entry.storageKey === prospectPhone);

    return match?.atlasId || null;
  } catch {
    return null;
  }
}

async function linkAppointmentToAtlasProspect(atlasProspectId, appointmentRecord) {
  if (!atlasProspectId) {
    return null;
  }

  try {
    const { createProspectService } = require("../prospects");
    const prospectService = createProspectService({});
    const prospect = await prospectService.findByAtlasId(atlasProspectId);

    if (!prospect) {
      return null;
    }

    const now = new Date().toISOString();
    const updated = {
      ...prospect,
      recruitingStage: PROSPECT_STATUS.APPOINTMENT_BOOKED,
      assignedOwnerId: prospect.assignedOwnerId || null,
      appointment: {
        appointmentId: appointmentRecord.id,
        calendarEventId: appointmentRecord.calendarEventId,
        startTime: appointmentRecord.startTime,
        endTime: appointmentRecord.endTime,
        interviewType: appointmentRecord.interviewType,
        status: appointmentRecord.status,
        bookedAt: now
      },
      updatedAt: now,
      lastActivityAt: now
    };

    await prospectService.repository.save(updated);
    return updated;
  } catch (error) {
    console.warn("[AppointmentEngine] Atlas prospect link failed:", error.message);
    return null;
  }
}

function buildCalendarFailureReply(language) {
  if (language === "es") {
    return "Gracias por tu interés. Tuvimos un problema al confirmar la cita en el calendario. Por favor intenta de nuevo en unos minutos o escribe otro horario.";
  }

  return "Thanks for your patience. We had trouble confirming that time on our calendar. Please try again in a few minutes or send another time option.";
}

function buildDuplicateBookingReply(language) {
  if (language === "es") {
    return "Ya tenemos una cita registrada para ese horario. Si necesitas cambiarla, avísanos.";
  }

  return "We already have an appointment recorded for that time. Let us know if you need to change it.";
}

/**
 * Production booking entry point used by the Conversation Engine.
 */
async function bookProductionAppointment({
  prospect,
  profile,
  language = "en",
  channel = "whatsapp",
  atlasProspectId = null
}) {
  void channel;

  const startTime = prospect.appointment_date;

  if (!startTime) {
    throw new Error("Interview slot must be selected before confirming.");
  }

  const interviewType = normalizeInterviewType(profile.interviewType || prospect.interview_type);
  const endTime = new Date(new Date(startTime).getTime() + SLOT_DURATION_MS).toISOString();
  const resolvedAtlasProspectId = atlasProspectId || (await resolveAtlasProspectId(prospect.phone));
  const organizationId = await resolveDefaultOrganizationId();
  const organization = await resolveOrganization(organizationId);

  const duplicate = await findDuplicateAppointment({
    prospectPhone: prospect.phone,
    atlasProspectId: resolvedAtlasProspectId,
    startTime
  });

  if (duplicate) {
    return {
      success: false,
      reason: "DUPLICATE_BOOKING",
      reply: buildDuplicateBookingReply(language)
    };
  }

  const interval = slotToInterval({ startTimeISO: startTime });
  const freeBusy = await queryGoogleFreeBusy({
    timeMin: interval.start.toISOString(),
    timeMax: interval.end.toISOString(),
    organizationId
  });

  if (
    freeBusy.status !== "unavailable" &&
    !freeBusy.simulated &&
    isSlotBusyOnCalendar(interval, freeBusy.busy || [])
  ) {
    releaseSlotByIso(startTime, interviewType);

    return {
      success: false,
      reason: "SLOT_UNAVAILABLE",
      reply:
        language === "es"
          ? "Ese horario ya no está disponible. ¿Te funciona otro día u hora?"
          : "That time is no longer available. Would another day or time work for you?"
    };
  }

  const meetingDetails = resolveMeetingDetails(organization, interviewType);
  const meeting = {
    prospectName: prospect.name || "Prospect",
    meetingType: meetingDetails.meetingType,
    startTime,
    endTime,
    timeZone: TIME_ZONE,
    locationName: meetingDetails.locationName,
    address: meetingDetails.address
  };

  const connector = getConnectorRegistry().get("google-calendar");
  const calendar = await connector.send({
    operation: "createEvent",
    meeting,
    organizationId
  });

  if (calendar.status !== "created") {
    releaseSlotByIso(startTime, interviewType);

    return {
      success: false,
      reason: calendar.reason || "CALENDAR_FAILED",
      reply: buildCalendarFailureReply(language)
    };
  }

  const appointment = await appointmentStore.saveAppointment({
    id: crypto.randomUUID(),
    organizationId,
    atlasProspectId: resolvedAtlasProspectId,
    prospectPhone: prospect.phone,
    prospectName: prospect.name || "Prospect",
    interviewType,
    startTime,
    endTime,
    timeZone: TIME_ZONE,
    locationLabel: meetingDetails.address
      ? `${meetingDetails.locationName} · ${meetingDetails.address}`
      : meetingDetails.locationName,
    status: "confirmed",
    calendarEventId: calendar.calendarEventId,
    channel
  });

  const confirmation = buildConfirmation(appointment, organization);
  await appointmentStore.updateAppointment(appointment.id, {
    confirmation,
    status: "confirmed",
    calendarEventId: calendar.calendarEventId
  });

  await appointmentStore.appendActivity({
    type: AppointmentEvent.CONFIRMED,
    message: `Appointment confirmed for ${appointment.prospectName}.`,
    appointmentId: appointment.id,
    prospectName: appointment.prospectName
  });

  const email = profile.email || null;

  try {
    await updateProspect(prospect.phone, {
      notes: email ? `EMAIL:${email}` : prospect.notes || null,
      calendar_event_id: calendar.calendarEventId,
      appointment_date: startTime,
      interview_time: profile.preferredTime || prospect.interview_time,
      interview_type: profile.interviewType || prospect.interview_type,
      current_step: PROSPECT_STATUS.APPOINTMENT_BOOKED,
      last_message: prospect.last_message
    });
  } catch (error) {
    console.warn("[AppointmentEngine] Supabase prospect update failed:", error.message);
  }

  await linkAppointmentToAtlasProspect(resolvedAtlasProspectId, {
    id: appointment.id,
    calendarEventId: calendar.calendarEventId,
    startTime,
    endTime,
    interviewType,
    status: "confirmed"
  });

  const confirmationCopy = buildConfirmationDetails({
    interviewType: profile.interviewType,
    slotLabel: profile.preferredTime || prospect.interview_time,
    email: email || prospect.phone,
    language
  });

  const reply = responseBuilder({
    tone: "celebratory",
    acknowledgement: confirmationCopy.acknowledgement,
    transition: confirmationCopy.transition,
    question: confirmationCopy.question,
    typingDelay: 1500,
    responseStyle: "professional"
  }).text;

  return {
    success: true,
    appointment,
    calendar,
    confirmation,
    reply,
    prospectStatus: PROSPECT_STATUS.APPOINTMENT_BOOKED
  };
}

module.exports = {
  PROSPECT_STATUS,
  filterSlotsByGoogleCalendar,
  filterScheduleDaysByGoogleCalendar,
  bookProductionAppointment,
  findDuplicateAppointment,
  queryGoogleFreeBusy
};
