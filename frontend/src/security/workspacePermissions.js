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
  POLICY_READ: "policy:read",
  POLICY_WRITE: "policy:write",
  ORG_READ: "org:read",
  ORG_WRITE: "org:write",
  OPERATIONS_ACCESS: "operations:access",
  ADMIN_USERS: "admin:users",
  ADMIN_ROLES: "admin:roles",
  AUDIT_READ: "audit:read",
  BILLING_ACCESS: "billing:access",
  INTEGRATIONS_SELF: "integrations:self"
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
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.ORG_WRITE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ADMIN_USERS,
    PERMISSIONS.INTEGRATIONS_SELF
  ],
  [ROLES.DIVISION_LEADER]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_ASSIGN,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE,
    PERMISSIONS.INTEGRATIONS_SELF
  ],
  [ROLES.AGENT]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE,
    PERMISSIONS.INTEGRATIONS_SELF
  ],
  [ROLES.RECRUITER]: [
    PERMISSIONS.PROSPECT_READ,
    PERMISSIONS.PROSPECT_WRITE,
    PERMISSIONS.PROSPECT_COMMUNICATE,
    PERMISSIONS.POLICY_READ,
    PERMISSIONS.POLICY_WRITE,
    PERMISSIONS.INTEGRATIONS_SELF
  ],
  [ROLES.SUPPORT]: [PERMISSIONS.PROSPECT_READ, PERMISSIONS.POLICY_READ, PERMISSIONS.AUDIT_READ]
});

const ROLE_ALIASES = Object.freeze({
  admin: ROLES.ADMINISTRATOR,
  super_admin: ROLES.ADMINISTRATOR,
  organization_admin: ROLES.ADMINISTRATOR,
  organization_owner: ROLES.ADMINISTRATOR,
  org_admin: ROLES.ADMINISTRATOR,
  representative: ROLES.RECRUITER,
  field_trainer: ROLES.AGENT,
  regional_leader: ROLES.DIVISION_LEADER
});

const SAAS_ROLE_ALIASES = Object.freeze({
  ADMIN: ROLES.ADMINISTRATOR,
  SUPER_ADMIN: ROLES.ADMINISTRATOR,
  ORGANIZATION_ADMIN: ROLES.ADMINISTRATOR,
  ORGANIZATION_OWNER: ROLES.ADMINISTRATOR,
  RVP: ROLES.RVP,
  DIVISION_LEADER: ROLES.DIVISION_LEADER,
  REGIONAL_LEADER: ROLES.DIVISION_LEADER,
  FIELD_TRAINER: ROLES.AGENT,
  REPRESENTATIVE: ROLES.RECRUITER,
  OPERATIONS: ROLES.OPERATIONS,
  SUPPORT: ROLES.SUPPORT
});

export function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();

  if (Object.values(ROLES).includes(role)) {
    return role;
  }

  if (ROLE_ALIASES[role]) {
    return ROLE_ALIASES[role];
  }

  const saasRole = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (SAAS_ROLE_ALIASES[saasRole]) {
    return SAAS_ROLE_ALIASES[saasRole];
  }

  return ROLES.RECRUITER;
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
