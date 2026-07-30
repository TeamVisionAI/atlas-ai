/**
 * Sprint 12.2 Phase 1 — Appointment lifecycle business event adapter.
 */

const { recordBusinessEvent } = require("../../../core/recruitingBusinessEventBridge");
const { APPOINTMENT_EVENTS } = require("../../business-events/domain/EventTypes");
const { APPOINTMENT_LIFECYCLE_STATES } = require("../domain/constants");
const { buildAppointmentOwnership } = require("../domain/AppointmentOwnership");

const LIFECYCLE_EVENT_MAP = Object.freeze({
  [APPOINTMENT_LIFECYCLE_STATES.SCHEDULED]: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
  [APPOINTMENT_LIFECYCLE_STATES.CONFIRMED]: APPOINTMENT_EVENTS.APPOINTMENT_CONFIRMED,
  [APPOINTMENT_LIFECYCLE_STATES.RESCHEDULED]: APPOINTMENT_EVENTS.APPOINTMENT_RESCHEDULED,
  [APPOINTMENT_LIFECYCLE_STATES.COMPLETED]: APPOINTMENT_EVENTS.APPOINTMENT_COMPLETED,
  [APPOINTMENT_LIFECYCLE_STATES.NO_SHOW]: APPOINTMENT_EVENTS.APPOINTMENT_NO_SHOW,
  [APPOINTMENT_LIFECYCLE_STATES.CANCELLED]: APPOINTMENT_EVENTS.APPOINTMENT_CANCELLED,
  [APPOINTMENT_LIFECYCLE_STATES.RECRUITED]: APPOINTMENT_EVENTS.APPOINTMENT_RECRUITED,
  [APPOINTMENT_LIFECYCLE_STATES.BECAME_CLIENT]: APPOINTMENT_EVENTS.APPOINTMENT_BECAME_CLIENT
});

function buildTransitionPayload(appointment, transition = {}) {
  const ownership = buildAppointmentOwnership(appointment);

  return {
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    prospectId: appointment.prospectId,
    ownerRepId: ownership.ownerRepId,
    appointmentType: ownership.appointmentType,
    scheduledTime: ownership.scheduledTime,
    previousState: transition.previousState || null,
    currentState: transition.currentState || ownership.currentState,
    actor: transition.actor || "AGENT",
    channel: transition.channel || "mission_control",
    reason: transition.reason || null,
    summary: transition.summary || null,
    ...transition.payload
  };
}

async function emitAppointmentLifecycleEvent(appointment, transition = {}) {
  const eventType =
    transition.eventType ||
    LIFECYCLE_EVENT_MAP[transition.currentState] ||
    LIFECYCLE_EVENT_MAP[transition.toState];

  if (!eventType || !appointment?.prospectPhone) {
    return null;
  }

  const payload = buildTransitionPayload(appointment, transition);

  return recordBusinessEvent({
    phone: appointment.prospectPhone,
    prospectId: appointment.prospectId,
    eventType,
    actor: payload.actor,
    channel: payload.channel,
    organizationId: appointment.organizationId,
    summary: transition.summary || `Appointment ${transition.currentState || transition.toState}`,
    payload
  }).catch(() => null);
}

module.exports = {
  LIFECYCLE_EVENT_MAP,
  buildTransitionPayload,
  emitAppointmentLifecycleEvent
};
