/**
 * Atlas Design System — shared action card presentation metadata.
 * Used by Mission Control, Prospect Workspace, and future modules.
 */

export const ACCENT_ACTIONS = new Set([
  "send_zoom_link",
  "send_office_location",
  "schedule",
  "send_missed_appointment",
  "enter_interview_outcome"
]);

export const ACTION_PRESENTATION = {
  call: {
    icon: "📞",
    titleKey: "missionControlActionCall",
    subtitleKey: "missionControlActionCallSubtitle"
  },
  whatsapp: {
    icon: "💬",
    titleKey: "missionControlActionSendViaWhatsapp",
    subtitleKey: "missionControlActionSendViaWhatsappSubtitle"
  },
  send_zoom_link: {
    icon: "💬",
    titleKey: "missionControlActionSendViaWhatsapp",
    subtitleKey: "missionControlActionSendViaWhatsappSubtitle"
  },
  send_office_location: {
    icon: "📍",
    titleKey: "missionControlActionSendOffice",
    subtitleKey: "missionControlActionSendOfficeSubtitle"
  },
  schedule: {
    icon: "📅",
    titleKey: "missionControlActionSchedule",
    subtitleKey: "missionControlActionScheduleSubtitle"
  },
  reschedule: {
    icon: "📅",
    titleKey: "missionControlActionReschedule",
    subtitleKey: "missionControlActionRescheduleSubtitle"
  },
  notes: {
    icon: "📝",
    titleKey: "missionControlActionNotes",
    subtitleKey: "missionControlActionNotesSubtitle"
  },
  send_missed_appointment: {
    icon: "📨",
    titleKey: "missionControlActionMissedAppointment",
    subtitleKey: "missionControlActionMissedAppointmentSubtitle"
  },
  send_interview_reminder: {
    icon: "⏰",
    titleKey: "whatsappActionSendReminder",
    subtitleKey: "whatsappActionOneClickHint"
  },
  enter_interview_outcome: {
    icon: "✅",
    titleKey: "missionControlActionRecordOutcome",
    subtitleKey: "missionControlActionRecordOutcomeSubtitle"
  }
};

export function getActionPresentation(actionId) {
  return ACTION_PRESENTATION[actionId] || null;
}

export function resolveActionVariant(actionId, priority) {
  if (priority === "primary") {
    if (actionId === "call") {
      return "primary";
    }

    if (ACCENT_ACTIONS.has(actionId)) {
      return "accent";
    }

    return actionId === "whatsapp" ? "primary" : "accent";
  }

  return "default";
}
