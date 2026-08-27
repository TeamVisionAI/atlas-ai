/**
 * Display-only first-admin resolution for the Super Admin tenant console.
 * Does not change invitation sending, billing, or Support Mode.
 */

const { ROLES, USER_STATUSES } = require("../security/roles");
const { isSuperAdmin } = require("../security/saasRoles");

const FIRST_ADMIN_STATUSES = Object.freeze([
  USER_STATUSES.ACTIVE,
  USER_STATUSES.PENDING_INVITATION
]);

function isFirstAdminCandidate(row = null) {
  if (!row) {
    return false;
  }

  if (isSuperAdmin(row.saas_role || row.saasRole || row.role)) {
    return false;
  }

  const role = String(row.role || "").trim().toLowerCase();
  const rank = String(row.business_rank || row.businessRank || "")
    .trim()
    .toUpperCase();

  return role === ROLES.ADMINISTRATOR || role === ROLES.RVP || rank === "RVP";
}

function isUsableFirstAdminStatus(status) {
  return FIRST_ADMIN_STATUSES.includes(String(status || "").trim().toLowerCase());
}

function presentFirstAdmin(row = null) {
  if (!row) {
    return null;
  }

  const firstName = row.first_name || row.firstName || null;
  const lastName = row.last_name || row.lastName || null;
  const displayName =
    row.display_name ||
    row.displayName ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    null;
  const status = row.status || null;

  return {
    id: row.id || null,
    firstName,
    lastName,
    displayName,
    email: row.email || null,
    status,
    invitationPending: status === USER_STATUSES.PENDING_INVITATION
  };
}

function resolveFirstAdminFromLoadedUsers({
  ownerUserId = null,
  organizationId = null,
  users = []
} = {}) {
  const rows = Array.isArray(users) ? users : [];
  const owner = ownerUserId
    ? rows.find((row) => String(row.id) === String(ownerUserId))
    : null;

  if (owner && isUsableFirstAdminStatus(owner.status)) {
    return presentFirstAdmin(owner);
  }

  const orgRows = rows
    .filter((row) => !organizationId || String(row.organization_id) === String(organizationId))
    .filter((row) => isUsableFirstAdminStatus(row.status))
    .filter((row) => isFirstAdminCandidate(row))
    .slice()
    .sort((left, right) => {
      const leftAt = new Date(left.created_at || left.createdAt || 0).getTime();
      const rightAt = new Date(right.created_at || right.createdAt || 0).getTime();
      return leftAt - rightAt;
    });

  if (orgRows[0]) {
    return presentFirstAdmin(orgRows[0]);
  }

  return presentFirstAdmin(owner);
}

function hasAssignedFirstAdmin({ ownerUserId = null, firstAdmin = null } = {}) {
  return Boolean(firstAdmin?.id || ownerUserId);
}

module.exports = {
  FIRST_ADMIN_STATUSES,
  isFirstAdminCandidate,
  presentFirstAdmin,
  resolveFirstAdminFromLoadedUsers,
  hasAssignedFirstAdmin
};
