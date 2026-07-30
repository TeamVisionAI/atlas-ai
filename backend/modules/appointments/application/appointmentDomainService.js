/**
 * Sprint 12.2 Phase 1 — Reusable Appointment Domain Service.
 * Pure lifecycle transitions; persistence and integrations remain in application layer.
 */

const { recordHistoryEvent } = require("../../../core/appointmentHistory");
const {
  APPOINTMENT_LIFECYCLE_STATES,
  LIFECYCLE_TO_PERSISTENCE,
  LIFECYCLE_HISTORY_TYPES,
  canTransitionLifecycle,
  resolveLifecycleState,
  isTerminalLifecycleState
} = require("../domain/constants");
const {
  buildAppointmentOwnership,
  assertOwnershipFields,
  attachOwnershipMetadata
} = require("../domain/AppointmentOwnership");
const { AppointmentDomainError } = require("../domain/errors/AppointmentDomainError");
const { emitAppointmentLifecycleEvent } = require("./appointmentEventAdapter");

function nowIso() {
  return new Date().toISOString();
}

function applyLifecycleTransition(appointment, toState, context = {}) {
  const fromState = resolveLifecycleState(appointment);

  if (isTerminalLifecycleState(fromState)) {
    throw new AppointmentDomainError(
      `Appointment in terminal state "${fromState}" cannot transition to "${toState}".`,
      { code: "TERMINAL_STATE", statusCode: 409 }
    );
  }

  if (!canTransitionLifecycle(fromState, toState)) {
    throw new AppointmentDomainError(
      `Invalid appointment transition from "${fromState}" to "${toState}".`,
      { code: "INVALID_TRANSITION", statusCode: 409 }
    );
  }

  const persistence = LIFECYCLE_TO_PERSISTENCE[toState];
  const historyType = LIFECYCLE_HISTORY_TYPES[toState];

  const updated = attachOwnershipMetadata(
    {
      ...appointment,
      status: persistence.status,
      outcome: context.outcome ?? persistence.outcome ?? appointment.outcome ?? null,
      outcomeNotes: context.outcomeNotes ?? appointment.outcomeNotes ?? null,
      cancellationReason:
        toState === APPOINTMENT_LIFECYCLE_STATES.CANCELLED
          ? context.reason || appointment.cancellationReason || "unspecified"
          : appointment.cancellationReason,
      rescheduleCount:
        toState === APPOINTMENT_LIFECYCLE_STATES.RESCHEDULED
          ? (appointment.rescheduleCount || 0) + 1
          : appointment.rescheduleCount || 0,
      startDateTime: context.scheduledTime || appointment.startDateTime,
      endDateTime: context.endDateTime || appointment.endDateTime,
      history: recordHistoryEvent(appointment, {
        type: historyType,
        actor: context.actor || "system",
        reason: context.reason || null,
        summary: context.summary || `Appointment ${toState.replace(/_/g, " ")}`,
        oldValues: {
          lifecycleState: fromState,
          status: appointment.status,
          outcome: appointment.outcome || null,
          scheduledTime: appointment.startDateTime
        },
        newValues: {
          lifecycleState: toState,
          status: persistence.status,
          outcome: context.outcome ?? persistence.outcome ?? null,
          scheduledTime: context.scheduledTime || appointment.startDateTime,
          ...(context.newValues || {})
        }
      }),
      updatedAt: nowIso()
    },
    {
      ...buildAppointmentOwnership(appointment),
      currentState: toState
    }
  );

  return {
    appointment: updated,
    transition: {
      previousState: fromState,
      currentState: toState,
      actor: context.actor || "system",
      reason: context.reason || null,
      summary: context.summary || null,
      channel: context.channel || "mission_control",
      payload: context.payload || {}
    }
  };
}

async function transitionAndEmit(appointment, toState, context = {}) {
  const result = applyLifecycleTransition(appointment, toState, context);
  await emitAppointmentLifecycleEvent(result.appointment, result.transition);
  return result.appointment;
}

function scheduleAppointment(input, context = {}) {
  const ownership = assertOwnershipFields({
    ...input,
    currentState: APPOINTMENT_LIFECYCLE_STATES.SCHEDULED
  });

  const appointment = attachOwnershipMetadata(
    {
      ...input,
      status: LIFECYCLE_TO_PERSISTENCE[APPOINTMENT_LIFECYCLE_STATES.SCHEDULED].status,
      outcome: null,
      history: recordHistoryEvent(
        { history: input.history || [] },
        {
          type: LIFECYCLE_HISTORY_TYPES[APPOINTMENT_LIFECYCLE_STATES.SCHEDULED],
          actor: context.actor || input.createdBy || input.agentId || "system",
          summary: context.summary || "Appointment scheduled",
          newValues: {
            lifecycleState: APPOINTMENT_LIFECYCLE_STATES.SCHEDULED,
            scheduledTime: ownership.scheduledTime,
            ownerRepId: ownership.ownerRepId
          }
        }
      ),
      updatedAt: nowIso(),
      createdAt: input.createdAt || nowIso()
    },
    ownership
  );

  return {
    appointment,
    transition: {
      previousState: null,
      currentState: APPOINTMENT_LIFECYCLE_STATES.SCHEDULED,
      actor: context.actor || input.createdBy || input.agentId || "system",
      summary: context.summary || "Appointment scheduled",
      channel: context.channel || "mission_control"
    }
  };
}

async function scheduleAppointmentWithEvent(input, context = {}) {
  const result = scheduleAppointment(input, context);
  await emitAppointmentLifecycleEvent(result.appointment, result.transition);
  return result.appointment;
}

async function confirmAppointment(appointment, context = {}) {
  return transitionAndEmit(appointment, APPOINTMENT_LIFECYCLE_STATES.CONFIRMED, {
    ...context,
    summary: context.summary || "Appointment confirmed"
  });
}

async function rescheduleAppointment(appointment, context = {}) {
  if (!context.scheduledTime) {
    throw new AppointmentDomainError("scheduledTime is required to reschedule.", {
      code: "VALIDATION_FAILED",
      statusCode: 400
    });
  }

  return transitionAndEmit(appointment, APPOINTMENT_LIFECYCLE_STATES.RESCHEDULED, {
    ...context,
    summary: context.summary || "Appointment rescheduled",
    newValues: {
      scheduledTime: context.scheduledTime,
      endDateTime: context.endDateTime || appointment.endDateTime
    }
  });
}

async function completeAppointment(appointment, context = {}) {
  return transitionAndEmit(appointment, APPOINTMENT_LIFECYCLE_STATES.COMPLETED, {
    ...context,
    outcome: context.outcome || null,
    summary: context.summary || "Appointment completed"
  });
}

async function markNoShow(appointment, context = {}) {
  return transitionAndEmit(appointment, APPOINTMENT_LIFECYCLE_STATES.NO_SHOW, {
    ...context,
    outcome: "no_show",
    summary: context.summary || "Appointment marked no-show"
  });
}

async function cancelAppointment(appointment, context = {}) {
  return transitionAndEmit(appointment, APPOINTMENT_LIFECYCLE_STATES.CANCELLED, {
    ...context,
    summary: context.summary || "Appointment cancelled"
  });
}

async function recruitFromAppointment(appointment, context = {}) {
  return transitionAndEmit(appointment, APPOINTMENT_LIFECYCLE_STATES.RECRUITED, {
    ...context,
    outcome: "recruited",
    summary: context.summary || "Prospect recruited from appointment"
  });
}

async function createClientFromAppointment(appointment, context = {}) {
  return transitionAndEmit(appointment, APPOINTMENT_LIFECYCLE_STATES.BECAME_CLIENT, {
    ...context,
    outcome: "client",
    summary: context.summary || "Prospect became client from appointment"
  });
}

module.exports = {
  scheduleAppointment,
  scheduleAppointmentWithEvent,
  confirmAppointment,
  rescheduleAppointment,
  completeAppointment,
  markNoShow,
  cancelAppointment,
  recruitFromAppointment,
  createClientFromAppointment,
  applyLifecycleTransition,
  buildAppointmentOwnership,
  resolveLifecycleState
};
