/**
 * BR-176 — in-app notification copy. No phone numbers in titles/bodies.
 */

const { EVENT_TYPES, SEVERITIES } = require("./constants");

function appointmentWhen(appointment = {}) {
  return appointment.startDateTime || appointment.start_date_time || "";
}

function buildNotificationCopy(event = {}) {
  const type = event.eventType;
  if (type === EVENT_TYPES.NEW_APPOINTMENT) {
    return {
      title: "New appointment",
      body: appointmentWhen(event.appointment)
        ? `An appointment was scheduled for ${appointmentWhen(event.appointment)}.`
        : "An appointment was scheduled.",
      severity: SEVERITIES.HIGH,
      actionUrl: event.actionUrl || `/app/appointments`
    };
  }
  if (type === EVENT_TYPES.APPOINTMENT_RESCHEDULED) {
    return {
      title: "Appointment rescheduled",
      body: appointmentWhen(event.appointment)
        ? `The appointment was moved to ${appointmentWhen(event.appointment)}.`
        : "An appointment was rescheduled.",
      severity: SEVERITIES.HIGH,
      actionUrl: event.actionUrl || `/app/appointments`
    };
  }
  if (type === EVENT_TYPES.APPOINTMENT_CANCELLED) {
    return {
      title: "Appointment cancelled",
      body: "An appointment was cancelled.",
      severity: SEVERITIES.HIGH,
      actionUrl: event.actionUrl || `/app/appointments`
    };
  }
  if (type === EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED) {
    return {
      title: "Takeover requested",
      body: "A conversation needs you to take over.",
      severity: SEVERITIES.HIGH,
      actionUrl: event.actionUrl || `/app/conversations`
    };
  }
  return {
    title: "Needs attention",
    body: "A conversation entered Needs Attention.",
    severity: SEVERITIES.HIGH,
    actionUrl: event.actionUrl || `/app/conversations`
  };
}

module.exports = {
  buildNotificationCopy
};
