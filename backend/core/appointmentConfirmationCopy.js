/**
 * Single customer-facing appointment confirmation copy.
 * Built only from persisted atlas_appointments + canonical preferred_language (BR-041).
 * In-person office text uses snapshotted meetingAddress; BR-018 fullAddress only as last resort (BR-077).
 */

const { getOfficeLocation } = require("./businessRulesEngine");
const { isTeamVisionSeedTenant } = require("./teamVisionSeedTenant");
const {
  resolveProspectPreferredLanguage,
  preferredLanguageToCommunicationCode
} = require("./prospectLanguage");

const CONFIRMATION_IDEMPOTENCY_PREFIX = "appointment-confirmation:";

function buildAppointmentConfirmationIdempotencyKey(appointmentId) {
  if (!appointmentId) {
    return null;
  }

  return `${CONFIRMATION_IDEMPOTENCY_PREFIX}${appointmentId}`;
}

function isVirtualMeeting(appointment = {}) {
  const meetingType = String(
    appointment.meetingType || appointment.meeting_type || ""
  ).toLowerCase();
  const locationType = String(
    appointment.meetingLocationType || appointment.meeting_location_type || ""
  ).toLowerCase();
  const provider = String(
    appointment.meetingProvider || appointment.meeting_provider || ""
  ).toLowerCase();

  return (
    meetingType.includes("virtual") ||
    meetingType.includes("zoom") ||
    locationType.includes("virtual") ||
    provider.includes("zoom") ||
    Boolean(appointment.virtualMeetingUrl || appointment.virtual_meeting_url)
  );
}

function resolveAppointmentStartIso(appointment = {}) {
  return (
    appointment.startDateTime ||
    appointment.start_date_time ||
    appointment.startsAt ||
    null
  );
}

function resolveAppointmentTimezone(appointment = {}) {
  return appointment.timezone || appointment.timeZone || "America/New_York";
}

function formatAppointmentWhen(appointment = {}, languageCode = "en") {
  const startIso = resolveAppointmentStartIso(appointment);
  const timezone = resolveAppointmentTimezone(appointment);

  if (!startIso) {
    return "";
  }

  const locale = languageCode === "es" ? "es-US" : "en-US";

  try {
    return new Date(startIso).toLocaleString(locale, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone
    });
  } catch {
    return String(startIso);
  }
}

function resolveOfficeAddress(appointment = {}) {
  const snapshotted =
    appointment.meetingAddress ||
    appointment.meeting_address ||
    null;

  if (snapshotted && String(snapshotted).trim()) {
    return String(snapshotted).trim();
  }

  // Implements BR-146 — BR-018 office is Team Vision seed only.
  const organizationId = appointment.organizationId || appointment.organization_id || null;
  if (isTeamVisionSeedTenant(organizationId)) {
    return getOfficeLocation().fullAddress || null;
  }
  return null;
}

/**
 * @param {object} appointment — persisted appointment (camel or snake)
 * @param {object} prospect
 * @returns {{ text: string, language: 'en'|'es', idempotencyKey: string|null, isVirtual: boolean, whenLabel: string }}
 */
function buildPersistedAppointmentConfirmation(appointment, prospect = {}) {
  const preferred = resolveProspectPreferredLanguage(prospect);
  const language = preferredLanguageToCommunicationCode(preferred);
  const whenLabel = formatAppointmentWhen(appointment, language);
  const isVirtual = isVirtualMeeting(appointment);
  const meetLink =
    appointment.virtualMeetingUrl || appointment.virtual_meeting_url || null;
  const office = resolveOfficeAddress(appointment);
  const idempotencyKey = buildAppointmentConfirmationIdempotencyKey(
    appointment.id || appointment.appointmentId || null
  );

  let text;

  if (language === "es") {
    if (isVirtual) {
      const linkLine = meetLink ? `\nEnlace: ${meetLink}` : "";
      text = `Listo, quedaste programado para ${whenLabel} por Zoom.${linkLine}\n\n¡Esperamos conocerte!`;
    } else {
      text = `Listo, quedaste programado para ${whenLabel} en nuestras oficinas (${office}).\n\n¡Esperamos conocerte!`;
    }
  } else if (isVirtual) {
    const linkLine = meetLink ? `\nLink: ${meetLink}` : "";
    text = `You're all set for ${whenLabel} via Zoom.${linkLine}\n\nWe look forward to meeting you!`;
  } else {
    text = `You're all set for ${whenLabel} at our office (${office}).\n\nWe look forward to meeting you!`;
  }

  return {
    text,
    language,
    preferredLanguage: preferred,
    idempotencyKey,
    isVirtual,
    whenLabel
  };
}

module.exports = {
  CONFIRMATION_IDEMPOTENCY_PREFIX,
  buildAppointmentConfirmationIdempotencyKey,
  buildPersistedAppointmentConfirmation,
  formatAppointmentWhen,
  isVirtualMeeting
};
