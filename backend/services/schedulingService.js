/**
 * Sprint 18.2 — Generic scheduling service.
 * Supports all appointment types; pushes one-way to Google Calendar when connected.
 */

const { bookSlot, releaseSlotByIso } = require("../core/capacityEngine");
const {
  isValidAppointmentType,
  resolveDurationMinutes,
  APPOINTMENT_TYPES
} = require("../core/configuration/appointmentTypes");
const { buildIsoTimestamp } = require("./availabilityService");
const googleCalendarIntegrationService = require("./googleCalendarIntegrationService");

function formatAppointmentTitle(appointmentType, metadata = {}) {
  const label = appointmentType.replace(/_/g, " ");
  const name = metadata.name || metadata.prospectName || "Appointment";
  return `${label} — ${name}`;
}

function buildEventDescription(appointmentType, metadata = {}) {
  const lines = [`Type: ${appointmentType}`];

  if (metadata.name || metadata.prospectName) {
    lines.push(`Name: ${metadata.name || metadata.prospectName}`);
  }

  if (metadata.phone) {
    lines.push(`Phone: ${metadata.phone}`);
  }

  if (metadata.interviewType) {
    lines.push(`Interview Type: ${metadata.interviewType}`);
  }

  if (metadata.notes) {
    lines.push(`Notes: ${metadata.notes}`);
  }

  if (metadata.meetingUrl || metadata.zoomUrl) {
    lines.push(`Meeting link: ${metadata.meetingUrl || metadata.zoomUrl}`);
  }

  return lines.join("\n");
}

/**
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.appointmentType
 * @param {string} params.dateKey - YYYY-MM-DD
 * @param {string} params.timeKey - HH:mm
 * @param {number} [params.duration]
 * @param {Object} [params.metadata]
 * @param {string} [params.timezone]
 */
async function scheduleAppointment({
  organizationId,
  appointmentType,
  dateKey,
  timeKey,
  duration,
  metadata = {},
  timezone = "America/New_York",
  interviewerUserId = null
}) {
  if (!isValidAppointmentType(appointmentType)) {
    const error = new Error("Invalid appointment type.");
    error.statusCode = 400;
    throw error;
  }

  if (!dateKey || !timeKey) {
    const error = new Error("dateKey and timeKey are required.");
    error.statusCode = 400;
    throw error;
  }

  const durationMinutes = resolveDurationMinutes(appointmentType, duration);
  const booking = bookSlot(dateKey, timeKey, appointmentType);

  if (!booking.success) {
    return {
      success: false,
      reason: booking.reason || "UNAVAILABLE",
      appointmentType,
      dateKey,
      timeKey
    };
  }

  // BR-050 / BR-079 — wall clock in appointment timezone → UTC instant.
  const startTimeISO = buildIsoTimestamp(dateKey, timeKey, timezone);
  const endTimeISO = new Date(
    new Date(startTimeISO).getTime() + durationMinutes * 60 * 1000
  ).toISOString();

  let googleEvent = null;

  if (organizationId) {
    try {
      googleEvent = await googleCalendarIntegrationService.createCalendarEvent(organizationId, {
        summary: metadata.eventTitlePrefix
          ? `${metadata.eventTitlePrefix} ${formatAppointmentTitle(appointmentType, metadata)}`
          : formatAppointmentTitle(appointmentType, metadata),
        description: metadata.eventDescription || buildEventDescription(appointmentType, metadata),
        startTimeISO,
        endTimeISO,
        timezone,
        location: metadata.meetingUrl || metadata.zoomUrl || metadata.location || null,
        attendeeEmail: metadata.attendeeEmail || null,
        interviewerUserId: interviewerUserId || metadata.interviewerUserId || null,
        stagingCalendarTarget: metadata.stagingCalendarTarget || null
      });
    } catch (calendarError) {
      releaseSlotByIso(startTimeISO, appointmentType);
      throw calendarError;
    }
  }

  const meetingUrl = metadata.meetingUrl || metadata.zoomUrl || null;

  return {
    success: true,
    appointmentType,
    dateKey,
    timeKey,
    startTimeISO,
    endTimeISO,
    durationMinutes,
    capacity: booking.availability,
    googleCalendarEventId: googleEvent?.id || null,
    googleCalendarSynced: Boolean(googleEvent?.id),
    meetLink: meetingUrl,
    zoomLink: meetingUrl,
    meetingUrl,
    googleCalendarLink: googleEvent?.htmlLink || null
  };
}

async function cancelAppointment({ appointmentType, startTimeISO, googleCalendarEventId, organizationId }) {
  if (startTimeISO && appointmentType) {
    releaseSlotByIso(startTimeISO, appointmentType);
  }

  // Implements BR-121 — Calendar cleanup must not throw on already-absent events.
  // Unexpected Calendar failures are reported but do not abort cancel/rollback callers.
  let calendarResult = null;
  let calendarError = null;

  if (googleCalendarEventId && organizationId) {
    try {
      calendarResult = await googleCalendarIntegrationService.deleteCalendarEvent(
        organizationId,
        googleCalendarEventId
      );
    } catch (error) {
      calendarError = String(error?.message || "CALENDAR_DELETE_FAILED").slice(0, 200);
      console.error("[schedulingService] calendar delete failed during cancel:", calendarError, {
        organizationId,
        googleCalendarEventId
      });
    }
  }

  return {
    cancelled: true,
    calendarDeleted: Boolean(calendarResult?.deleted),
    calendarAlreadyAbsent: Boolean(calendarResult?.alreadyAbsent),
    calendarError
  };
}

module.exports = {
  APPOINTMENT_TYPES,
  scheduleAppointment,
  cancelAppointment,
  formatAppointmentTitle
};
