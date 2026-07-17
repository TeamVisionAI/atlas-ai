import {
  loadWorkflowState,
  shouldShowWorkflowGate
} from "./workflowEngine";

export const QUEUE_PRIORITY = {
  WORKFLOW_GATE: 1,
  INTERVIEW_SOON: 2,
  FOLLOW_UP_DUE: 3,
  NEW_LEAD: 4,
  REMAINING: 5
};

const MOCK_QUEUE_EXTRAS = [
  { phone: "queue-mock-01", name: "Maria Lopez", current_step: "CONFIRMED", interview_time: new Date(Date.now() + 3600000).toISOString(), city: "Miami", state: "FL" },
  { phone: "queue-mock-02", name: "Carlos Ruiz", current_step: "GREETING", city: "Hialeah", state: "FL" },
  { phone: "queue-mock-03", name: "Sofia Mendez", current_step: "SCHEDULE", city: "Doral", state: "FL" },
  { phone: "queue-mock-04", name: "James Carter", current_step: "CONFIRMED", interview_time: new Date(Date.now() - 3600000).toISOString(), city: "Kendall", state: "FL" },
  { phone: "queue-mock-05", name: "Elena Torres", current_step: "OCCUPATION", city: "Miramar", state: "FL" }
];

function isInterviewStartingSoon(prospect) {
  if (prospect.current_step !== "CONFIRMED" || !prospect.interview_time) {
    return false;
  }

  const interviewAt = Date.parse(prospect.interview_time);

  if (Number.isNaN(interviewAt)) {
    return false;
  }

  const twoHours = 2 * 60 * 60 * 1000;
  const now = Date.now();

  return interviewAt >= now && interviewAt - now <= twoHours;
}

function isFollowUpDue(prospect, workflowState) {
  if (workflowState.outcome !== "Needs More Time" && workflowState.milestone !== "Follow Up") {
    return false;
  }

  if (!workflowState.followUpDate) {
    return true;
  }

  const followUpAt = Date.parse(`${workflowState.followUpDate}T${workflowState.followUpTime || "00:00"}`);

  if (Number.isNaN(followUpAt)) {
    return true;
  }

  return followUpAt <= Date.now();
}

function isNewLead(prospect) {
  const step = prospect.current_step;

  return !step || step === "NEW" || step === "GREETING";
}

function hasUnresolvedWorkflowGate(prospect) {
  const workflowState = loadWorkflowState(prospect.phone);
  const missionStub = {
    brain: { currentStep: prospect.current_step || "CONFIRMED" }
  };

  return shouldShowWorkflowGate(missionStub, prospect, workflowState);
}

function getProspectPriority(prospect) {
  const workflowState = loadWorkflowState(prospect.phone);

  if (hasUnresolvedWorkflowGate(prospect)) {
    return QUEUE_PRIORITY.WORKFLOW_GATE;
  }

  if (isInterviewStartingSoon(prospect)) {
    return QUEUE_PRIORITY.INTERVIEW_SOON;
  }

  if (isFollowUpDue(prospect, workflowState)) {
    return QUEUE_PRIORITY.FOLLOW_UP_DUE;
  }

  if (isNewLead(prospect)) {
    return QUEUE_PRIORITY.NEW_LEAD;
  }

  return QUEUE_PRIORITY.REMAINING;
}

function normalizeProspect(prospect) {
  return {
    phone: prospect.phone,
    name: prospect.name || "Unknown Prospect",
    current_step: prospect.current_step,
    interview_time: prospect.interview_time,
    city: prospect.city,
    state: prospect.state
  };
}

/**
 * Builds today's prioritized queue from dashboard prospects plus mock placeholders.
 * Replace with Workflow Engine data when backend is ready.
 */
export function buildPrioritizedQueue(prospects = []) {
  const normalized = prospects.map(normalizeProspect);
  const seenPhones = new Set(normalized.map((prospect) => prospect.phone));

  MOCK_QUEUE_EXTRAS.forEach((mockProspect) => {
    if (!seenPhones.has(mockProspect.phone)) {
      normalized.push(normalizeProspect(mockProspect));
      seenPhones.add(mockProspect.phone);
    }
  });

  return normalized
    .map((prospect) => ({
      ...prospect,
      priority: getProspectPriority(prospect)
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.name.localeCompare(right.name);
    });
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

export function isMockQueueProspect(prospect) {
  return String(prospect?.phone || "").startsWith("queue-mock-");
}
