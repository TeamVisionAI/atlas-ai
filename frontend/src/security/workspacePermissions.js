/**
 * Sprint 20.0 — Frontend permission matrix (mirrors backend/security/permissions.js).
 */

export const ROLES = Object.freeze({
  ADMINISTRATOR: "administrator",
  RVP: "rvp",
  DIVISION_LEADER: "division_leader",
  AGENT: "agent",
  RECRUITER: "recruiter",
  OPERATIONS: "operations",
  SUPPORT: "support"
});

export const PERMISSIONS = Object.freeze({
  PROSPECT_READ: "prospect:read",
  PROSPECT_WRITE: "prospect:write",
  PROSPECT_ASSIGN: "prospect:assign",
  PROSPECT_COMMUNICATE: "prospect:communicate",
  DASHBOARD_EXECUTIVE: "dashboard:executive",
  ORG_READ: "org:read",
  ORG_WRITE: "org:write",
  OPERATIONS_ACCESS: "operations:access",
  ADMIN_USERS: "admin:users",
  ADMIN_ROLES: "admin:roles",
  AUDIT_READ: "audit:read"
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMINISTRATOR]: Object.values(PERMISSIONS),
  [ROLES.OPERATIONS]: [PERMISSIONS.OPERATIONS_ACCESS, PERMISSIONS.AUDIT_READ],
  [ROLES.RVP]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_ASSIGN,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.DASHBOARD_EXECUTIVE,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.AUDIT_READ
  ],
  [ROLES.DIVISION_LEADER]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_ASSIGN,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.DASHBOARD_EXECUTIVE,
    PERMISSIONS.ORG_READ
  ],
  [ROLES.AGENT]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_COMMUNICATE
  ],
  [ROLES.RECRUITER]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_COMMUNICATE
  ],
  [ROLES.SUPPORT]: [PERMISSIONS.PROSPECT_READ, PERMISSIONS.AUDIT_READ]
});

export function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return Object.values(ROLES).includes(role) ? role : ROLES.RECRUITER;
}

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS[ROLES.RECRUITER];
}

export function roleHasPermission(role, permission) {
  if (normalizeRole(role) === ROLES.ADMINISTRATOR) {
    return true;
  }

  return permissionsForRole(role).includes(permission);
}
