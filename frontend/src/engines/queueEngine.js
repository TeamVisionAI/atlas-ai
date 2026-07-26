/**
 * Sprint 19 — Mission Control queue helpers.
 * Navigation order is authoritative from backend prioritizedWorkflowQueue only.
 * @deprecated Local priority calculation removed — do not reintroduce client-side queue authority.
 */

export const QUEUE_PRIORITY = {
  WORKFLOW_GATE: 1,
  INTERVIEW_SOON: 2,
  FOLLOW_UP_DUE: 3,
  NEW_LEAD: 4,
  REMAINING: 5
};

function normalizeProspect(prospect, summary = {}) {
  return {
    phone: prospect.phone || summary.phone,
    name: summary.name || prospect.name || "Unknown Prospect",
    current_step: summary.currentStep || prospect.current_step,
    interview_time: prospect.interview_time,
    appointment_date: prospect.appointment_date,
    city: prospect.city,
    state: prospect.state,
    missionControlPriority: summary.missionControlPriority,
    missionControlPriorityTier: summary.missionControlPriorityTier,
    canonicalMilestone: summary.canonicalMilestone
  };
}

/**
 * Builds Mission Control navigation queue from backend prioritizedWorkflowQueue.
 * Sprint 19 — sole authoritative queue source for production Mission Control.
 */
export function buildQueueFromBackendWorkflowQueue(workflowQueue = [], prospects = []) {
  const prospectByPhone = new Map(prospects.map((row) => [row.phone, row]));

  return workflowQueue.map((summary) =>
    normalizeProspect(prospectByPhone.get(summary.phone) || { phone: summary.phone }, summary)
  );
}

/** @deprecated Use buildQueueFromBackendWorkflowQueue — retained for compatibility. */
export function buildPrioritizedQueue(prospects = [], workflowQueue = []) {
  if (workflowQueue.length) {
    return buildQueueFromBackendWorkflowQueue(workflowQueue, prospects);
  }

  return prospects.map((prospect) => normalizeProspect(prospect));
}

export function findQueueIndex(queue, phone) {
  if (!phone) {
    return 0;
  }

  const index = queue.findIndex((item) => item.phone === phone);

  return index >= 0 ? index : 0;
}

export function getQueueNeighbors(queue, currentIndex) {
  const totalProspects = queue.length;
  const previousProspect = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextProspect =
    currentIndex < totalProspects - 1 ? queue[currentIndex + 1] : null;

  return {
    totalProspects,
    previousProspect,
    nextProspect
  };
}

export function getNextPriorityProspect(queue, currentIndex) {
  if (!queue.length) {
    return null;
  }

  if (currentIndex < queue.length - 1) {
    return { index: currentIndex + 1, prospect: queue[currentIndex + 1] };
  }

  return null;
}

export { buildMockMissionControlFromQueueProspect as buildMockMissionFromProspect } from "../adapters/missionControlAdapter";

/** @deprecated Mock queue prospects removed in Sprint 19. */
export function isMockQueueProspect() {
  return false;
}
