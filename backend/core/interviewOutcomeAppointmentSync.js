/**
 * Applies interview outcomes to persisted appointment rows.
 */

const appointmentDomainService = require("../modules/appointments/application/appointmentDomainService");
const appointmentRepository = require("../repositories/appointmentRepository");
const {
  resolveAppointmentOutcomeSlug,
  mapAppointmentSlugToOutcomeId
} = require("./interviewOutcomeSlugMap");
const { isPersistedAppointment } = require("./appointmentListQuery");

async function applyInterviewOutcomeToAppointment(appointment, outcomeId, context = {}) {
  if (!appointment || !isPersistedAppointment(appointment)) {
    return null;
  }

  const domainContext = {
    actor: context.agentId || "agent",
    outcomeNotes: context.outcomeNotes || null,
    channel: context.channel || "mission_control"
  };

  const outcomeSlug = resolveAppointmentOutcomeSlug(outcomeId);
  let domainUpdated;

  if (outcomeSlug === "recruited") {
    domainUpdated = await appointmentDomainService.recruitFromAppointment(appointment, domainContext);
  } else if (outcomeSlug === "client") {
    domainUpdated = await appointmentDomainService.createClientFromAppointment(
      appointment,
      domainContext
    );
  } else if (outcomeSlug === "no_show") {
    domainUpdated = await appointmentDomainService.markNoShow(appointment, domainContext);
  } else if (outcomeId === "Reschedule Interview") {
    // Implements BR-049/BR-050 — persistence delegated to appointmentApplicationService.
    return null;
  } else {
    domainUpdated = await appointmentDomainService.completeAppointment(appointment, {
      ...domainContext,
      outcome: outcomeSlug
    });
  }

  return appointmentRepository.save(domainUpdated);
}

module.exports = {
  mapAppointmentSlugToOutcomeId,
  resolveAppointmentOutcomeSlug,
  applyInterviewOutcomeToAppointment
};
