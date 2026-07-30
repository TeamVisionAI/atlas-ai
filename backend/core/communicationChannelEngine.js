/**
 * Channel-aware communication routing — email, calendar, WhatsApp.
 * Implements intelligent delivery selection for communication actions.
 */

const { extractEmailFromNotes } = require("./informationModel");
const { normalizeEmail, validateEmailFormat } = require("./emailNormalization");

const DELIVERY_CHANNELS = Object.freeze({
  EMAIL: "email",
  WHATSAPP: "whatsapp",
  AUTO: "auto"
});

function resolveProspectEmail(prospect) {
  if (!prospect) {
    return null;
  }

  const candidates = [prospect.email, extractEmailFromNotes(prospect.notes)];

  for (const candidate of candidates) {
    const normalized = normalizeEmail(candidate);

    if (validateEmailFormat(normalized)) {
      return normalized;
    }
  }

  return null;
}

async function resolveCalendarEventId(prospect, organizationId) {
  if (prospect?.calendar_event_id) {
    return prospect.calendar_event_id;
  }

  if (!organizationId || !prospect?.phone) {
    return null;
  }

  try {
    const appointmentRepository = require("../repositories/appointmentRepository");
    const { coerceAppointmentItems } = require("./appointmentCollection");
    const searchResult = await appointmentRepository.search({
      organizationId,
      prospectPhone: prospect.phone,
      status: ["scheduled", "confirmed"]
    });

    const appointments = coerceAppointmentItems(searchResult)
      .filter((item) => item.calendarEventId)
      .sort(
        (left, right) =>
          new Date(left.startDateTime).getTime() - new Date(right.startDateTime).getTime()
      );

    return appointments[0]?.calendarEventId || null;
  } catch {
    return null;
  }
}

function shouldAttemptEmailDelivery({ prospect, organizationId, forceWhatsApp = false }) {
  if (forceWhatsApp) {
    return false;
  }

  return Boolean(resolveProspectEmail(prospect) && organizationId);
}

module.exports = {
  DELIVERY_CHANNELS,
  resolveProspectEmail,
  resolveCalendarEventId,
  shouldAttemptEmailDelivery
};
