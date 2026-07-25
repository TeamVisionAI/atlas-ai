/**
 * LC1 — Atlas role definitions.
 */

const ROLES = Object.freeze({
  ADMINISTRATOR: "administrator",
  RVP: "rvp",
  DIVISION_LEADER: "division_leader",
  AGENT: "agent",
  RECRUITER: "recruiter",
  OPERATIONS: "operations",
  SUPPORT: "support"
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

const USER_STATUSES = Object.freeze({
  ACTIVE: "active",
  INVITED: "invited",
  DISABLED: "disabled"
});

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ALL_ROLES.includes(role) ? role : null;
}

module.exports = {
  ROLES,
  ALL_ROLES,
  USER_STATUSES,
  normalizeRole
};
