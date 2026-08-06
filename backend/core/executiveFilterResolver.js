/**
 * Sprint 10.3 — Shared executive filter resolution for read models.
 * Business rules stay in workflow engines; this module only maps filters → phones.
 * Implements BR-079 — interviews today/tomorrow use organization-local windows.
 */

const {
  parseInterviewDatetime,
  isTomorrow,
  isSameLocalDay
} = require("./appointmentListQuery");
const { loadAgentState } = require("./agentActionState");
const { MILESTONES, PRIORITY_TIERS } = require("./workflowConstants");

const EXECUTIVE_FILTERS = Object.freeze({
  INTERVIEWS_TODAY: "interviews-today",
  TOMORROWS_INTERVIEWS: "tomorrows-interviews",
  PENDING_OUTCOMES: "pending-outcomes",
  HIGH_PRIORITY: "high-priority",
  ORIENTATION_READY: "orientation-ready",
  STALLED: "stalled",
  // Implements BR-080
  UNASSIGNED: "unassigned",
  NEW_UNACKNOWLEDGED: "new-unacknowledged",
  HUMAN_ATTENTION: "human-attention"
});

function findProspectByPhone(prospects, phone) {
  return prospects.find((row) => row.phone === phone) || null;
}

function resolveExecutiveFilterPhones(
  filter,
  prospects = [],
  queue = [],
  options = {}
) {
  if (!filter || filter === "all" || !queue.length) {
    return queue.map((row) => row.phone);
  }

  const organizationId = options.organizationId || null;
  const reference = options.reference || new Date();

  switch (filter) {
    case EXECUTIVE_FILTERS.INTERVIEWS_TODAY:
      return queue
        .filter((summary) => {
          const prospect = findProspectByPhone(prospects, summary.phone);
          return isSameLocalDay(
            parseInterviewDatetime(prospect),
            reference,
            organizationId
          );
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS:
      return queue
        .filter((summary) => {
          const prospect = findProspectByPhone(prospects, summary.phone);
          return isTomorrow(
            parseInterviewDatetime(prospect),
            reference,
            organizationId
          );
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

    case EXECUTIVE_FILTERS.UNASSIGNED:
      return queue
        .filter((summary) => {
          const prospect = findProspectByPhone(prospects, summary.phone);
          return Boolean(prospect) && !prospect.owner_user_id;
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.NEW_UNACKNOWLEDGED:
      return queue
        .filter((summary) => {
          const prospect = findProspectByPhone(prospects, summary.phone);
          if (!prospect || prospect.acknowledged_at) {
            return false;
          }

          return (
            prospect.attention_status === "new" ||
            prospect.attention_status === "ai_responding" ||
            prospect.attention_status === "waiting_for_prospect" ||
            prospect.attention_status === "human_required" ||
            Boolean(prospect.new_lead_received_at)
          );
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.HUMAN_ATTENTION:
      return queue
        .filter((summary) => {
          const prospect = findProspectByPhone(prospects, summary.phone);
          return (
            Boolean(summary.needsHumanAttention) ||
            prospect?.attention_status === "human_required"
          );
        })
        .map((row) => row.phone);

    default:
      return [];
  }
}

function buildExecutiveFilterCounts(prospects = [], queue = [], options = {}) {
  return [
    { id: "all", count: queue.length },
    {
      id: EXECUTIVE_FILTERS.INTERVIEWS_TODAY,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.INTERVIEWS_TODAY,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.PENDING_OUTCOMES,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.PENDING_OUTCOMES,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.HIGH_PRIORITY,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.HIGH_PRIORITY,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.ORIENTATION_READY,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.ORIENTATION_READY,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.STALLED,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.STALLED,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.UNASSIGNED,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.UNASSIGNED,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.NEW_UNACKNOWLEDGED,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.NEW_UNACKNOWLEDGED,
        prospects,
        queue,
        options
      ).length
    },
    {
      id: EXECUTIVE_FILTERS.HUMAN_ATTENTION,
      count: resolveExecutiveFilterPhones(
        EXECUTIVE_FILTERS.HUMAN_ATTENTION,
        prospects,
        queue,
        options
      ).length
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
