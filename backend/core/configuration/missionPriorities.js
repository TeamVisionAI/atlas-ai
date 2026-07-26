/**
 * Sprint 18.3 — Mission priority tiers.
 */

const MISSION_PRIORITIES = Object.freeze({
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low"
});

const PRIORITY_RANK = Object.freeze({
  [MISSION_PRIORITIES.CRITICAL]: 0,
  [MISSION_PRIORITIES.HIGH]: 1,
  [MISSION_PRIORITIES.MEDIUM]: 2,
  [MISSION_PRIORITIES.LOW]: 3
});

function compareMissionPriority(left, right) {
  const leftRank = PRIORITY_RANK[left?.priority] ?? 99;
  const rightRank = PRIORITY_RANK[right?.priority] ?? 99;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftDue = Date.parse(left?.dueDate || "") || Number.MAX_SAFE_INTEGER;
  const rightDue = Date.parse(right?.dueDate || "") || Number.MAX_SAFE_INTEGER;

  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  return String(left?.prospectId || "").localeCompare(String(right?.prospectId || ""));
}

function sortMissions(missions = []) {
  return [...missions].sort(compareMissionPriority);
}

module.exports = {
  MISSION_PRIORITIES,
  PRIORITY_RANK,
  compareMissionPriority,
  sortMissions
};
