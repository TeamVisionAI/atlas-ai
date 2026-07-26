/**
 * Sprint 18.2 — User roles (permissions are separate from organization level).
 */

const USER_ROLES = Object.freeze({
  ORGANIZATION_OWNER: "organization_owner",
  ORGANIZATION_ADMIN: "organization_admin",
  LEADER: "leader",
  AGENT: "agent",
  ASSISTANT: "assistant"
});

const USER_ROLE_VALUES = Object.freeze(Object.values(USER_ROLES));

function isValidUserRole(role) {
  return USER_ROLE_VALUES.includes(role);
}

module.exports = {
  USER_ROLES,
  USER_ROLE_VALUES,
  isValidUserRole
};
