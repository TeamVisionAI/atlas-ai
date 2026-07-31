/**
 * Appointment id guards — synthetic prospect-derived ids are UI-only.
 * Communication and mutation APIs require persisted atlas_appointments.id.
 */

export function isProspectDerivedAppointmentId(id) {
  return typeof id === "string" && id.startsWith("prospect-derived:");
}

export function resolvePersistedAppointmentId(id) {
  if (!id || isProspectDerivedAppointmentId(id)) {
    return null;
  }

  return id;
}
