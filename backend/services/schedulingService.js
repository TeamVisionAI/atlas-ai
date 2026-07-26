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

  if (metadata.notes) {
    lines.push(`Notes: ${metadata.notes}`);
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
  timezone = "America/New_York"
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

  const startTimeISO = buildIsoTimestamp(dateKey, timeKey);
  const endTimeISO = new Date(
    new Date(startTimeISO).getTime() + durationMinutes * 60 * 1000
  ).toISOString();

  let googleEvent = null;

  if (organizationId) {
    try {
      const isZoomInterview =
        metadata.interviewType === "Zoom" ||
        String(metadata.interviewType || "").toLowerCase().includes("zoom");

      googleEvent = await googleCalendarIntegrationService.createCalendarEvent(organizationId, {
        summary: formatAppointmentTitle(appointmentType, metadata),
        description: buildEventDescription(appointmentType, metadata),
        startTimeISO,
        endTimeISO,
        timezone,
        location: metadata.location || null,
        createMeetLink: Boolean(metadata.createMeetLink ?? isZoomInterview)
      });
    } catch (calendarError) {
      releaseSlotByIso(startTimeISO, appointmentType);
      throw calendarError;
    }
  }

  const meetLink =
    googleEvent?.hangoutLink ||
    googleEvent?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")
      ?.uri ||
    null;

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
    meetLink,
    googleCalendarLink: googleEvent?.htmlLink || null
  };
}

async function cancelAppointment({ appointmentType, startTimeISO, googleCalendarEventId, organizationId }) {
  if (startTimeISO && appointmentType) {
    releaseSlotByIso(startTimeISO, appointmentType);
  }

  if (googleCalendarEventId && organizationId) {
    await googleCalendarIntegrationService.deleteCalendarEvent(
      organizationId,
      googleCalendarEventId
    );
  }

  return { cancelled: true };
}

module.exports = {
  APPOINTMENT_TYPES,
  scheduleAppointment,
  cancelAppointment,
  formatAppointmentTitle
};
