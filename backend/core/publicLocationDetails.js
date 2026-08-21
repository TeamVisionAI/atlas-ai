/**
 * Public-location appointment helpers (in_person + meetingLocationType=public_location).
 * Implements BR-078 — never substitute office address for public-location appointments.
 */

function trimText(value) {
  return String(value || "").trim();
}

function composePublicLocationDisplay({
  meetingLocationName = null,
  meetingLocationAddress = null
} = {}) {
  const name = trimText(meetingLocationName);
  const address = trimText(meetingLocationAddress);
  if (name && address) {
    return `${name} — ${address}`;
  }
  return name || address || null;
}

function composePublicLocationCalendarLocation({
  meetingLocationName = null,
  meetingLocationAddress = null
} = {}) {
  return composePublicLocationDisplay({
    meetingLocationName,
    meetingLocationAddress
  });
}

function composePublicLocationCalendarDescription({
  meetingLocationUrl = null,
  meetingNotes = null
} = {}) {
  const parts = [];
  const url = trimText(meetingLocationUrl);
  const notes = trimText(meetingNotes);
  if (url) {
    parts.push(`Directions: ${url}`);
  }
  if (notes) {
    parts.push(notes);
  }
  return parts.join("\n\n") || "";
}

function hasPublicLocationDetails(payload = {}) {
  return Boolean(
    trimText(payload.meetingLocationName) || trimText(payload.meetingLocationAddress)
  );
}

function resolveMeetingLocationUrl(appointment = {}) {
  return (
    trimText(appointment.meetingLocationUrl) ||
    trimText(appointment.metadata?.meetingLocationUrl) ||
    null
  );
}

module.exports = {
  composePublicLocationDisplay,
  composePublicLocationCalendarLocation,
  composePublicLocationCalendarDescription,
  hasPublicLocationDetails,
  resolveMeetingLocationUrl,
  trimText
};
