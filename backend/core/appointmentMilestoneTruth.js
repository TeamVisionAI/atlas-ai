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
  prospect = null,
  activeAppointment: preloadedActive
}) {
  const orgId = organizationId || prospect?.organization_id || null;
  let activeAppointment = preloadedActive === undefined ? null : preloadedActive;

  if (
    preloadedActive === undefined &&
    phone &&
    orgId &&
    claimsScheduledInterview(milestone)
  ) {
    activeAppointment = await findActiveAppointmentForProspect(phone, orgId).catch(
      () => null
    );
  }

  return applyAppointmentMilestoneTruth(milestone, activeAppointment);
}

/**
 * Write-side companion to BR-039 read demotion.
 * After a recruiting interview appointment is cancelled/rolled back, clear a stale
 * INTERVIEW_SCHEDULED / INTERVIEW_DUE claim so durable workflow matches reality.
 * Does not delete appointment history. Preserves HUMAN / manual ownership holds.
 *
 * @returns {Promise<{ demoted: boolean, previousMilestone: string|null, canonicalMilestone: string|null }>}
 */
async function demotePersistedScheduleClaimAfterCancel(phone, options = {}) {
  if (!phone) {
    return { demoted: false, previousMilestone: null, canonicalMilestone: null };
  }

  const {
    loadPersistedWorkflowState,
    savePersistedWorkflowState
  } = require("./workflowStateStore");
  const { OWNERSHIP } = require("./workflowConstants");
  const { deriveDefaultOwnership } = require("./milestoneMapper");
  const { loadAgentState } = require("./agentActionState");

  const persisted = await loadPersistedWorkflowState(phone, options);
  const previousMilestone = persisted.canonicalMilestone || null;

  if (
    previousMilestone !== MILESTONES.INTERVIEW_SCHEDULED &&
    previousMilestone !== MILESTONES.INTERVIEW_DUE
  ) {
    return {
      demoted: false,
      previousMilestone,
      canonicalMilestone: previousMilestone
    };
  }

  const nextMilestone = MILESTONES.INTERVIEW_READY;
  const humanHeld =
    persisted.manualAgentOwnership === true ||
    persisted.workflowOwnership === OWNERSHIP.AGENT;

  const agentState = {
    ...loadAgentState(phone),
    manualAgentOwnership: Boolean(persisted.manualAgentOwnership)
  };

  const ownershipAfter = humanHeld
    ? OWNERSHIP.AGENT
    : deriveDefaultOwnership(nextMilestone, agentState);

  await savePersistedWorkflowState(
    phone,
    {
      canonicalMilestone: nextMilestone,
      workflowOwnership: ownershipAfter
    },
    options
  );

  return {
    demoted: true,
    previousMilestone,
    canonicalMilestone: nextMilestone
  };
}

module.exports = {
  APPOINTMENT_CLAIMING_MILESTONES,
  claimsScheduledInterview,
  applyAppointmentMilestoneTruth,
  resolveAppointmentMilestoneTruth,
  demotePersistedScheduleClaimAfterCancel
};
