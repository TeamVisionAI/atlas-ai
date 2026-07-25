/**
 * LC1 / LC1.1 — Atlas role and user status definitions.
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
  PENDING_INVITATION: "pending_invitation",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  ARCHIVED: "archived",
  DISABLED: "disabled"
});

const LOGIN_BLOCKED_STATUSES = Object.freeze([
  USER_STATUSES.PENDING_INVITATION,
  USER_STATUSES.SUSPENDED,
  USER_STATUSES.ARCHIVED,
  USER_STATUSES.DISABLED
]);

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ALL_ROLES.includes(role) ? role : null;
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();

  if (status === "invited") {
    return USER_STATUSES.PENDING_INVITATION;
  }

  return Object.values(USER_STATUSES).includes(status) ? status : null;
}

function canUserLogin(status) {
  return status === USER_STATUSES.ACTIVE;
}

module.exports = {
  ROLES,
  ALL_ROLES,
  USER_STATUSES,
  LOGIN_BLOCKED_STATUSES,
  normalizeRole,
  normalizeStatus,
  canUserLogin
};
