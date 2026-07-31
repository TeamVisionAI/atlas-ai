import { resolveOperationalInterviewActions } from "./interviewOperationalEngine.js";

/**
 * Quick Action schedule/reschedule — context-aware label and workflow entry.
 * Implements Sprint 12.3.7: Quick Actions are workflow entry points, not instant actions.
 */
export function resolveQuickActionScheduleBehavior(interview = {}) {
  const operational = resolveOperationalInterviewActions(interview);
  const hasScheduledInterview = Boolean(interview?.datetime || interview?.appointmentId);

  if (!operational.showReschedule && !operational.showComplete && !operational.showCancel) {
    if (interview?.gateActive || interview?.outcome) {
      return {
        visible: false,
        mode: null,
        labelKey: null,
        useAppointmentRescheduleDialog: false
      };
    }

    if (!hasScheduledInterview) {
      return {
        visible: true,
        mode: "schedule",
        labelKey: "workspaceActionScheduleInterview",
        useAppointmentRescheduleDialog: false
      };
    }
  }

  if (interview?.gateActive || interview?.outcome) {
    return {
      visible: false,
      mode: null,
      labelKey: null,
      useAppointmentRescheduleDialog: false
    };
  }

  if (hasScheduledInterview) {
    return {
      visible: true,
      mode: "reschedule",
      labelKey: "workspaceActionRescheduleInterview",
      useAppointmentRescheduleDialog: operational.useAppointmentDialogs
    };
  }

  return {
    visible: true,
    mode: "schedule",
    labelKey: "workspaceActionScheduleInterview",
    useAppointmentRescheduleDialog: false
  };
}
