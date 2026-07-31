/**
 * Applies interview outcomes to persisted appointment rows.
 */

const appointmentDomainService = require("../modules/appointments/application/appointmentDomainService");
const appointmentRepository = require("../repositories/appointmentRepository");
const {
  resolveAppointmentOutcomeSlug,
  mapAppointmentSlugToOutcomeId
} = require("./interviewOutcomeSlugMap");

function isProspectDerivedAppointment(appointment = {}) {
  return Boolean(
    appointment.derivedFromProspect ||
      appointment.metadata?.derivedFromProspect ||
      String(appointment.id || "").startsWith("prospect-derived:")
  );
}

async function materializeDerivedAppointment(appointment, agentId) {
  const { findUserById } = require("../services/atlasUserService");
  const user = agentId ? await findUserById(agentId) : null;
  const ownerRepId = appointment.ownerRepId || user?.rep_id || null;

  return {
    ...appointment,
    id: appointmentRepository.generateId(),
    ownerRepId,
    metadata: {
      ...(appointment.metadata || {}),
      derivedFromProspect: true,
      sourceDerivedId: appointment.id,
      ownerRepId
    }
  };
}

async function applyInterviewOutcomeToAppointment(appointment, outcomeId, context = {}) {
  if (!appointment) {
    return null;
  }

  let workingAppointment = appointment;

  if (isProspectDerivedAppointment(workingAppointment)) {
    workingAppointment = await materializeDerivedAppointment(workingAppointment, context.agentId);
  }

  const domainContext = {
    actor: context.agentId || "agent",
    outcomeNotes: context.outcomeNotes || null,
    channel: context.channel || "mission_control"
  };

  const outcomeSlug = resolveAppointmentOutcomeSlug(outcomeId);
  let domainUpdated;

  if (outcomeSlug === "recruited") {
    domainUpdated = await appointmentDomainService.recruitFromAppointment(workingAppointment, domainContext);
  } else if (outcomeSlug === "client") {
    domainUpdated = await appointmentDomainService.createClientFromAppointment(
      workingAppointment,
      domainContext
    );
  } else if (outcomeSlug === "no_show") {
    domainUpdated = await appointmentDomainService.markNoShow(workingAppointment, domainContext);
  } else if (outcomeId === "Reschedule Interview") {
    return workingAppointment;
  } else {
    domainUpdated = await appointmentDomainService.completeAppointment(workingAppointment, {
      ...domainContext,
      outcome: outcomeSlug
    });
  }

  return appointmentRepository.save(domainUpdated);
}

module.exports = {
  mapAppointmentSlugToOutcomeId,
  resolveAppointmentOutcomeSlug,
  applyInterviewOutcomeToAppointment,
  isProspectDerivedAppointment
};
