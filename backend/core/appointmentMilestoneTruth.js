/**
 * BR-039 — Mission Control / workflow milestone must not claim an interview
 * is scheduled unless a persisted active atlas_appointments row exists.
 */

const { MILESTONES } = require("./workflowConstants");
const {
  findActiveAppointmentForProspect,
  isActiveAppointment
} = require("./activeAppointmentResolver");

const APPOINTMENT_CLAIMING_MILESTONES = new Set([
  MILESTONES.INTERVIEW_SCHEDULED,
  MILESTONES.INTERVIEW_DUE,
  MILESTONES.INTERVIEW_COMPLETED,
  MILESTONES.INTERVIEW_RESULT_PENDING
]);

function claimsScheduledInterview(milestone) {
  return APPOINTMENT_CLAIMING_MILESTONES.has(milestone);
}

/**
 * Downgrade appointment-claiming milestones when no active persisted appointment exists.
 * @returns {{ milestone: string, downgraded: boolean, hasActiveAppointment: boolean, activeAppointment: object|null }}
 */
function applyAppointmentMilestoneTruth(milestone, activeAppointment = null) {
  const hasActiveAppointment = Boolean(
    activeAppointment && isActiveAppointment(activeAppointment)
  );

  if (!claimsScheduledInterview(milestone)) {
    return {
      milestone,
      downgraded: false,
      hasActiveAppointment,
      activeAppointment: hasActiveAppointment ? activeAppointment : null
    };
  }

  if (hasActiveAppointment) {
    return {
      milestone,
      downgraded: false,
      hasActiveAppointment: true,
      activeAppointment
    };
  }

  return {
    milestone: MILESTONES.INTERVIEW_READY,
    downgraded: true,
    hasActiveAppointment: false,
    activeAppointment: null
  };
}

async function resolveAppointmentMilestoneTruth({
  phone,
  organizationId,
  milestone,
  prospect = null
}) {
  const orgId = organizationId || prospect?.organization_id || null;
  let activeAppointment = null;

  if (phone && orgId && claimsScheduledInterview(milestone)) {
    activeAppointment = await findActiveAppointmentForProspect(phone, orgId).catch(
      () => null
    );
  }

  return applyAppointmentMilestoneTruth(milestone, activeAppointment);
}

module.exports = {
  APPOINTMENT_CLAIMING_MILESTONES,
  claimsScheduledInterview,
  applyAppointmentMilestoneTruth,
  resolveAppointmentMilestoneTruth
};
