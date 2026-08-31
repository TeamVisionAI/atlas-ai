/**
 * Appointment Settings presentation helpers.
 * Calendar status must use personal Google / iCloud sources — never a single
 * organization-legacy "Disconnected" flag.
 */

export const APPOINTMENT_TIMEZONES = Object.freeze([
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/Denver", label: "America/Denver" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "America/Phoenix", label: "America/Phoenix" },
  { value: "America/Puerto_Rico", label: "America/Puerto_Rico" },
  { value: "America/Santo_Domingo", label: "America/Santo_Domingo" },
  { value: "America/Bogota", label: "America/Bogota" },
  { value: "America/Mexico_City", label: "America/Mexico_City" },
  { value: "UTC", label: "UTC" }
]);

export const DURATION_OPTIONS = Object.freeze([15, 30, 45, 60, 90]);
export const BUFFER_OPTIONS = Object.freeze([0, 5, 10, 15, 30, 45, 60]);
export const LEAD_TIME_OPTIONS = Object.freeze([60, 90, 120, 180, 240]);

export function resolveCalendarSources(payload = {}) {
  const google = payload.calendarSources?.google || null;
  const icloud = payload.calendarSources?.icloud || null;

  return {
    google: {
      available: google?.available !== false,
      connected: google?.connected === true,
      reconnectRequired: Boolean(google?.reconnectRequired),
      account: google?.googleAccountEmail || null
    },
    icloud: {
      available: icloud?.available === true,
      connected: icloud?.connected === true,
      reconnectRequired: Boolean(icloud?.reconnectRequired),
      account: icloud?.appleAccountEmail || null
    }
  };
}

export function calendarStatusLabel(source, translate) {
  if (!source?.available) {
    return translate("appointmentsCalendarUnavailable");
  }
  if (source.reconnectRequired) {
    return translate("configurationGoogleReconnectBadge");
  }
  return source.connected
    ? translate("configurationConnected")
    : translate("configurationNotConnected");
}

export function calendarStatusVariant(source) {
  if (!source?.available) {
    return "neutral";
  }
  if (source.reconnectRequired) {
    return "warning";
  }
  return source.connected ? "success" : "neutral";
}

export function formatLocationAddress(location = {}) {
  return [location.address, location.city, location.state, location.postalCode]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

export function buildAppointmentSettingsSnapshot(profile) {
  if (!profile?.appointmentProfile) {
    return "";
  }
  const appointmentProfile = profile.appointmentProfile;
  return JSON.stringify({
    workingSchedule: appointmentProfile.workingSchedule,
    defaults: appointmentProfile.defaults,
    virtualMeeting: {
      preferredProvider: appointmentProfile.virtualMeeting?.preferredProvider || "zoom"
    },
    office: appointmentProfile.office,
    favoritePublicLocations: appointmentProfile.favoritePublicLocations
  });
}

export function buildAppointmentSettingsSavePayload(profile) {
  const appointmentProfile = profile?.appointmentProfile;
  if (!appointmentProfile) {
    return null;
  }
  return {
    workingSchedule: appointmentProfile.workingSchedule,
    defaults: appointmentProfile.defaults,
    virtualMeeting: {
      preferredProvider: appointmentProfile.virtualMeeting?.preferredProvider || "zoom"
    },
    office: appointmentProfile.office,
    favoritePublicLocations: appointmentProfile.favoritePublicLocations
  };
}

export function hasTeamVisionFallbackCopy(text) {
  return /team vision default|google calendar status for this organization/i.test(
    String(text || "")
  );
}
