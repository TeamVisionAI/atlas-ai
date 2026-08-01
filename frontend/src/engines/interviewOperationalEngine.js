/**
 * Operational interview actions — visibility rules for Prospect Workspace.
 */

import { resolvePersistedAppointmentId } from "./appointmentIdEngine.js";

export function resolveOperationalInterviewActions(interview = {}) {
  const lifecycle = String(interview?.lifecycleState || "").toLowerCase();
  const appointmentStatus = String(interview?.appointmentStatus || "").toLowerCase();

  if (lifecycle === "cancelled" || appointmentStatus === "cancelled") {
    return {
      showReschedule: false,
      showComplete: false,
      showCancel: false,
      useAppointmentDialogs: false
    };
  }

  const hasScheduledInterview = Boolean(interview?.datetime);
  const hasAppointment = Boolean(resolvePersistedAppointmentId(interview?.appointmentId));
  const hasOutcome = Boolean(interview?.outcome);
  const gateActive = Boolean(interview?.gateActive);

  if (gateActive || hasOutcome) {
    return {
      showReschedule: false,
      showComplete: false,
      showCancel: false,
      useAppointmentDialogs: false
    };
  }

  if (!hasScheduledInterview && !hasAppointment) {
    return {
      showReschedule: false,
      showComplete: false,
      showCancel: false,
      useAppointmentDialogs: false
    };
  }

  return {
    showReschedule: true,
    showComplete: hasAppointment,
    showCancel: hasAppointment,
    useAppointmentDialogs: hasAppointment
  };
}
