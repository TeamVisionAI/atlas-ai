/**
 * Sprint 10.3 — Shared executive filter resolution for read models.
 * Business rules stay in workflow engines; this module only maps filters → phones.
 */

const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const { loadAgentState } = require("./agentActionState");
const { MILESTONES, PRIORITY_TIERS } = require("./workflowConstants");

const EXECUTIVE_FILTERS = Object.freeze({
  INTERVIEWS_TODAY: "interviews-today",
  TOMORROWS_INTERVIEWS: "tomorrows-interviews",
  PENDING_OUTCOMES: "pending-outcomes",
  HIGH_PRIORITY: "high-priority",
  ORIENTATION_READY: "orientation-ready",
  STALLED: "stalled"
});

function startOfLocalDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function endOfLocalDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.getTime();
}

function isSameLocalDay(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const dayStart = startOfLocalDay(reference);
  const dayEnd = endOfLocalDay(reference);
  return timestampMs >= dayStart && timestampMs <= dayEnd;
}

function isTomorrow(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const tomorrow = new Date(reference);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameLocalDay(timestampMs, tomorrow);
}

function findProspectByPhone(prospects, phone) {
  return prospects.find((row) => row.phone === phone) || null;
}

function resolveExecutiveFilterPhones(filter, prospects = [], queue = []) {
  if (!filter || filter === "all" || !queue.length) {
    return queue.map((row) => row.phone);
  }

  switch (filter) {
    case EXECUTIVE_FILTERS.INTERVIEWS_TODAY:
      return queue
        .filter((summary) => {
          const prospect = findProspectByPhone(prospects, summary.phone);
          return isSameLocalDay(parseInterviewDatetime(prospect));
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS:
      return queue
        .filter((summary) => {
          const prospect = findProspectByPhone(prospects, summary.phone);
          return isTomorrow(parseInterviewDatetime(prospect));
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.PENDING_OUTCOMES:
      return queue
        .filter(
          (summary) =>
            summary.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS" ||
            summary.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING
        )
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.HIGH_PRIORITY:
      return queue
        .filter((summary) => summary.missionControlPriority <= PRIORITY_TIERS.HUMAN_ESCALATION)
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.ORIENTATION_READY:
      return queue
        .filter((summary) => {
          if (summary.canonicalMilestone !== MILESTONES.ORIENTATION) {
            return false;
          }

          const agentState = loadAgentState(summary.phone);
          return agentState.outcome === "Recruited" && !agentState.orientationScheduled;
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.STALLED:
      return queue.filter((summary) => Boolean(summary.stalledAt)).map((row) => row.phone);

    default:
      return [];
  }
}

function buildExecutiveFilterCounts(prospects = [], queue = []) {
  return [
    { id: "all", count: queue.length },
    {
      id: EXECUTIVE_FILTERS.INTERVIEWS_TODAY,
      count: resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.INTERVIEWS_TODAY, prospects, queue).length
    },
    {
      id: EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS,
      count: resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS, prospects, queue).length
    },
    {
      id: EXECUTIVE_FILTERS.PENDING_OUTCOMES,
      count: resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.PENDING_OUTCOMES, prospects, queue).length
    },
    {
      id: EXECUTIVE_FILTERS.HIGH_PRIORITY,
      count: resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.HIGH_PRIORITY, prospects, queue).length
    },
    {
      id: EXECUTIVE_FILTERS.ORIENTATION_READY,
      count: resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.ORIENTATION_READY, prospects, queue).length
    },
    {
      id: EXECUTIVE_FILTERS.STALLED,
      count: resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.STALLED, prospects, queue).length
    }
  ];
}

module.exports = {
  EXECUTIVE_FILTERS,
  resolveExecutiveFilterPhones,
  buildExecutiveFilterCounts,
  isSameLocalDay,
  isTomorrow
};
