/**
 * LC1 — Permission matrix by role.
 */

const { ROLES } = require("./roles");

const PERMISSIONS = Object.freeze({
  PROSPECT_READ: "prospect:read",
  PROSPECT_WRITE: "prospect:write",
  PROSPECT_ASSIGN: "prospect:assign",
  PROSPECT_COMMUNICATE: "prospect:communicate",
  DASHBOARD_EXECUTIVE: "dashboard:executive",
  POLICY_READ: "policy:read",
  POLICY_WRITE: "policy:write",
  ORG_READ: "org:read",
  ORG_WRITE: "org:write",
  OPERATIONS_ACCESS: "operations:access",
  ADMIN_USERS: "admin:users",
  ADMIN_ROLES: "admin:roles",
  AUDIT_READ: "audit:read",
  // BR-074 — catalog constant only. Never grant via ROLE_PERMISSIONS / admin wildcard path.
  // Evaluate exclusively through hasExplicitUserPermission / canVerifySecuritiesAuthorization.
  SECURITIES_VERIFY: "securities:verify"
});

/** BR-074 — securities:verify must never appear in role matrices (explicit user grant only). */
const ROLE_GRANTABLE_PERMISSIONS = Object.freeze(
  Object.values(PERMISSIONS).filter((code) => code !== PERMISSIONS.SECURITIES_VERIFY)
);

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMINISTRATOR]: ROLE_GRANTABLE_PERMISSIONS,
  [ROLES.OPERATIONS]: [PERMISSIONS.OPERATIONS_ACCESS, PERMISSIONS.AUDIT_READ],
  [ROLES.RVP]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_ASSIGN,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.DASHBOARD_EXECUTIVE,
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.ORG_WRITE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ADMIN_USERS
  ],
  [ROLES.DIVISION_LEADER]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_ASSIGN,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE,
    PERMISSIONS.ORG_READ
  ],
  [ROLES.AGENT]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE
  ],
  [ROLES.RECRUITER]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE
  ],
  [ROLES.SUPPORT]: [PERMISSIONS.PROSPECT_READ, PERMISSIONS.POLICY_READ, PERMISSIONS.AUDIT_READ]
});

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function roleHasPermission(role, permission) {
  const granted = permissionsForRole(role);
  return granted.includes(permission);
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleHasPermission
};
