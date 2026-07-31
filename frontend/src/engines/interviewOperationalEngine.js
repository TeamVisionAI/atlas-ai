/**
 * Operational interview actions — visibility rules for Prospect Workspace.
 */

export function resolveOperationalInterviewActions(interview = {}) {
  const hasScheduledInterview = Boolean(interview?.datetime);
  const hasAppointment = Boolean(interview?.appointmentId);
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
