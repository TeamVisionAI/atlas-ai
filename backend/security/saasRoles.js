/**
 * Sprint 16.9 — SaaS role definitions and legacy mapping.
 * DB table `roles` is source of truth; this module provides runtime constants and aliases.
 */

const SAAS_ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  OPERATIONS: "OPERATIONS",
  RVP: "RVP",
  DIVISION_LEADER: "DIVISION_LEADER",
  REGIONAL_LEADER: "REGIONAL_LEADER",
  FIELD_TRAINER: "FIELD_TRAINER",
  REPRESENTATIVE: "REPRESENTATIVE",
  SUPPORT: "SUPPORT"
});

const ALL_SAAS_ROLES = Object.freeze(Object.values(SAAS_ROLES));

/** Maps LC1 legacy role codes to SaaS role codes. */
const LEGACY_TO_SAAS = Object.freeze({
  administrator: SAAS_ROLES.ADMIN,
  rvp: SAAS_ROLES.RVP,
  division_leader: SAAS_ROLES.DIVISION_LEADER,
  regional_leader: SAAS_ROLES.REGIONAL_LEADER,
  field_trainer: SAAS_ROLES.FIELD_TRAINER,
  representative: SAAS_ROLES.REPRESENTATIVE,
  agent: SAAS_ROLES.REPRESENTATIVE,
  recruiter: SAAS_ROLES.REPRESENTATIVE,
  operations: SAAS_ROLES.OPERATIONS,
  support: SAAS_ROLES.SUPPORT
});

/** Maps SaaS role codes back to LC1 legacy codes for backward-compatible services. */
const SAAS_TO_LEGACY = Object.freeze({
  [SAAS_ROLES.SUPER_ADMIN]: "administrator",
  [SAAS_ROLES.ADMIN]: "administrator",
  [SAAS_ROLES.OPERATIONS]: "operations",
  [SAAS_ROLES.SUPPORT]: "support",
  [SAAS_ROLES.RVP]: "rvp",
  [SAAS_ROLES.DIVISION_LEADER]: "division_leader",
  [SAAS_ROLES.REGIONAL_LEADER]: "division_leader",
  [SAAS_ROLES.FIELD_TRAINER]: "agent",
  [SAAS_ROLES.REPRESENTATIVE]: "recruiter"
});

const SUBSCRIPTION_PLANS = Object.freeze({
  STARTER: "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise"
});

function normalizeSaasRole(value) {
  const role = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (ALL_SAAS_ROLES.includes(role)) {
    return role;
  }

  const legacy = String(value || "").trim().toLowerCase();
  return LEGACY_TO_SAAS[legacy] || null;
}

function toLegacyRole(saasRole) {
  const normalized = normalizeSaasRole(saasRole);
  return SAAS_TO_LEGACY[normalized] || String(saasRole || "recruiter").toLowerCase();
}

function isSuperAdmin(role) {
  return normalizeSaasRole(role) === SAAS_ROLES.SUPER_ADMIN;
}

function isOrgAdmin(role) {
  const normalized = normalizeSaasRole(role);
  return normalized === SAAS_ROLES.SUPER_ADMIN || normalized === SAAS_ROLES.ADMIN;
}

module.exports = {
  SAAS_ROLES,
  ALL_SAAS_ROLES,
  LEGACY_TO_SAAS,
  SAAS_TO_LEGACY,
  SUBSCRIPTION_PLANS,
  normalizeSaasRole,
  toLegacyRole,
  isSuperAdmin,
  isOrgAdmin
};
