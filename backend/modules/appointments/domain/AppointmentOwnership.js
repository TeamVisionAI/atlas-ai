/**
 * Sprint 12.2 Phase 1 — Appointment ownership contract.
 */

const { resolveLifecycleState } = require("./constants");
const { AppointmentDomainError } = require("./errors/AppointmentDomainError");

function buildAppointmentOwnership(appointment = {}) {
  const ownerRepId =
    appointment.ownerRepId ||
    appointment.metadata?.ownerRepId ||
    appointment.metadata?.owner_rep_id ||
    null;

  return {
    prospectId: appointment.prospectId || null,
    prospectPhone: appointment.prospectPhone || null,
    ownerRepId,
    organizationId: appointment.organizationId || null,
    appointmentType: appointment.purpose || appointment.appointmentType || null,
    scheduledTime: appointment.startDateTime || appointment.scheduledTime || null,
    currentState: resolveLifecycleState(appointment)
  };
}

function assertOwnershipFields(input = {}) {
  const missing = [];

  if (!input.prospectPhone && !input.prospectId) {
    missing.push("prospect");
  }

  if (!input.organizationId) {
    missing.push("organization");
  }

  if (!input.appointmentType && !input.purpose) {
    missing.push("appointmentType");
  }

  if (!input.scheduledTime && !input.startDateTime) {
    missing.push("scheduledTime");
  }

  if (missing.length) {
    throw new AppointmentDomainError(
      `Appointment ownership requires: ${missing.join(", ")}.`,
      { code: "INVALID_OWNERSHIP", statusCode: 400 }
    );
  }

  return buildAppointmentOwnership({
    prospectId: input.prospectId,
    prospectPhone: input.prospectPhone,
    ownerRepId: input.ownerRepId || null,
    organizationId: input.organizationId,
    purpose: input.appointmentType || input.purpose,
    startDateTime: input.scheduledTime || input.startDateTime,
    status: input.currentState || input.status,
    metadata: input.metadata || {}
  });
}

function attachOwnershipMetadata(appointment, ownership) {
  return {
    ...appointment,
    ownerRepId: ownership.ownerRepId || appointment.ownerRepId || null,
    metadata: {
      ...(appointment.metadata || {}),
      ownerRepId: ownership.ownerRepId || appointment.metadata?.ownerRepId || null,
      lifecycleState: ownership.currentState
    }
  };
}

module.exports = {
  buildAppointmentOwnership,
  assertOwnershipFields,
  attachOwnershipMetadata
};
