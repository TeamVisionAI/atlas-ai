/**
 * Sprint 12.5.3 — Mission Control manual schedule → communication preview helpers.
 */

import { resolvePersistedAppointmentId } from "./appointmentIdEngine.js";

export function resolveScheduledAppointmentId(scheduleResult) {
  return resolvePersistedAppointmentId(
    scheduleResult?.appointmentId || scheduleResult?.appointment?.id || null
  );
}

export function shouldOpenScheduleCommunicationPreview(scheduleResult) {
  return Boolean(resolveScheduledAppointmentId(scheduleResult));
}
