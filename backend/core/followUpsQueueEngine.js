/**
 * Pure follow-up queue classification and sorting helpers.
 * Sprint 12.5.2 — shared by read model and tests.
 * Implements BR-079 — overdue / due-today use organization-local calendar windows.
 */

const { MILESTONES } = require("./workflowConstants");
const {
  RELATIVE_PERIODS,
  getOrganizationDateWindow
} = require("./organizationDateWindow");

const FOLLOW_UP_FILTERS = Object.freeze({
  ALL: "all",
  NEEDS_DATE: "needs-date",
  DUE_TODAY: "due-today",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  COMPLETED: "completed"
});

const FOLLOW_UP_OUTCOMES = new Set([
  "Needs More Time",
  "No Show",
  "Thinking About It",
  "Wants to Talk to Spouse",
  "Call Back Later",
  "FNA Scheduled"
]);

function getNowMs() {
  try {
    return require("../dev/simulatorClock").getSimulatedNowMs();
  } catch {
    return Date.now();
  }
}

function parseFollowUpAtMs(followUpDate, followUpTime) {
  if (!followUpDate) {
    return null;
  }

  const parsed = Date.parse(`${followUpDate}T${followUpTime || "00:00"}`);

  return Number.isNaN(parsed) ? null : parsed;
}

function isActiveFollowUp(canonicalMilestone, priorityTier) {
  return (
    canonicalMilestone === MILESTONES.FOLLOW_UP ||
    priorityTier === "FOLLOW_UP_DUE"
  );
}

function classifyFollowUpStatus({
  canonicalMilestone,
  followUpAtMs,
  priorityTier,
  organizationId = null,
  reference = null,
  todayWindow = null
}) {
  const active = isActiveFollowUp(canonicalMilestone, priorityTier);

  if (!active) {
    if (followUpAtMs || canonicalMilestone !== MILESTONES.FOLLOW_UP) {
      return "completed";
    }

    return null;
  }

  // Implements BR-178 — no due date is Needs Date, never Overdue.
  if (followUpAtMs == null || !Number.isFinite(followUpAtMs)) {
    return "needs-date";
  }

  const window =
    todayWindow ||
    getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference: reference || new Date(getNowMs())
    });

  if (followUpAtMs < window.utcStartMs) {
    return "overdue";
  }

  if (followUpAtMs <= window.utcEndMs) {
    return "due-today";
  }

  return "upcoming";
}

function isFollowUpQueueCandidate(summary, agentState) {
  const milestone = String(summary?.canonicalMilestone || "").toUpperCase();
  if (milestone === MILESTONES.CLOSED || milestone === MILESTONES.DO_NOT_CONTACT) {
    return false;
  }

  if (isActiveFollowUp(summary.canonicalMilestone, summary.missionControlPriorityTier)) {
    return true;
  }

  if (!agentState?.followUpDate) {
    return false;
  }

  if (FOLLOW_UP_OUTCOMES.has(agentState.outcome)) {
    return true;
  }

  return summary.canonicalMilestone === MILESTONES.FOLLOW_UP;
}

function matchesSearch(item, query) {
  if (!query) {
    return true;
  }

  const normalized = query.toLowerCase().trim();
  const haystack = [
    item.name,
    item.phone,
    item.prospectNumber,
    item.followUpReason,
    item.representativeName
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return haystack.some((value) => value.includes(normalized));
}

function compareFollowUpItems(a, b, sortKey) {
  if (sortKey === "priority") {
    if (a.missionControlPriority !== b.missionControlPriority) {
      return a.missionControlPriority - b.missionControlPriority;
    }
  } else if (sortKey === "name") {
    const nameA = (a.name || a.phone || "").toLowerCase();
    const nameB = (b.name || b.phone || "").toLowerCase();

    if (nameA !== nameB) {
      return nameA.localeCompare(nameB);
    }
  } else {
    const dueA = a.followUpAtMs ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.followUpAtMs ?? Number.MAX_SAFE_INTEGER;

    if (dueA !== dueB) {
      return dueA - dueB;
    }

    if (a.missionControlPriority !== b.missionControlPriority) {
      return a.missionControlPriority - b.missionControlPriority;
    }
  }

  return String(a.phone).localeCompare(String(b.phone));
}

function buildFilterCounts(items) {
  const counts = {
    [FOLLOW_UP_FILTERS.ALL]: 0,
    [FOLLOW_UP_FILTERS.NEEDS_DATE]: 0,
    [FOLLOW_UP_FILTERS.DUE_TODAY]: 0,
    [FOLLOW_UP_FILTERS.OVERDUE]: 0,
    [FOLLOW_UP_FILTERS.UPCOMING]: 0,
    [FOLLOW_UP_FILTERS.COMPLETED]: 0
  };

  for (const item of items) {
    if (item.status === "completed") {
      counts[FOLLOW_UP_FILTERS.COMPLETED] += 1;
      continue;
    }

    counts[FOLLOW_UP_FILTERS.ALL] += 1;

    if (item.status === "needs-date") {
      counts[FOLLOW_UP_FILTERS.NEEDS_DATE] += 1;
    } else if (item.status === "due-today") {
      counts[FOLLOW_UP_FILTERS.DUE_TODAY] += 1;
    } else if (item.status === "overdue") {
      counts[FOLLOW_UP_FILTERS.OVERDUE] += 1;
    } else if (item.status === "upcoming") {
      counts[FOLLOW_UP_FILTERS.UPCOMING] += 1;
    }
  }

  return Object.entries(counts).map(([id, count]) => ({ id, count }));
}

module.exports = {
  FOLLOW_UP_FILTERS,
  FOLLOW_UP_OUTCOMES,
  parseFollowUpAtMs,
  classifyFollowUpStatus,
  isFollowUpQueueCandidate,
  matchesSearch,
  compareFollowUpItems,
  buildFilterCounts
};
