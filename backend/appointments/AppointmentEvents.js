/**
 * Journey #2 — Appointment domain events.
 */

const AppointmentEvent = Object.freeze({
  SCHEDULED: "appointment.scheduled",
  CONFIRMED: "appointment.confirmed",
  CANCELLED: "appointment.cancelled"
});

module.exports = {
  AppointmentEvent
};
