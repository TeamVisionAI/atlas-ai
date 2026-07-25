/**
 * LC1 — Centralized authorization decisions.
 */

const { ROLES } = require("./roles");
const { permissionsForRole, roleHasPermission } = require("./permissions");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

function buildAuthContext(user) {
  if (!user) {
    return null;
  }

  const role = String(user.role || ROLES.RECRUITER).toLowerCase();

  return {
    userId: user.id,
    email: user.email,
    role,
    organizationId: user.organization_id || user.organizationId || DEFAULT_ORGANIZATION_ID,
    divisionId: user.division_id || user.divisionId || null,
    permissions: permissionsForRole(role),
    status: user.status || "active"
  };
}

function isActiveContext(context) {
  return Boolean(context && context.status !== "disabled");
}

function hasPermission(context, permission) {
  if (!isActiveContext(context)) {
    return false;
  }

  if (context.role === ROLES.ADMINISTRATOR) {
    return true;
  }

  return roleHasPermission(context.role, permission);
}

function sameOrganization(context, organizationId) {
  if (!organizationId) {
    return true;
  }

  return String(context.organizationId) === String(organizationId);
}

function canAccessProspect(context, prospect = {}) {
  if (!isActiveContext(context) || !prospect) {
    return false;
  }

  const orgId = prospect.organization_id || prospect.organizationId || DEFAULT_ORGANIZATION_ID;

  if (!sameOrganization(context, orgId)) {
    return false;
  }

  if (context.role === ROLES.ADMINISTRATOR || context.role === ROLES.RVP) {
    return true;
  }

  if (context.role === ROLES.OPERATIONS) {
    return false;
  }

  const ownerUserId = prospect.owner_user_id || prospect.ownerUserId;
  const assignedAgentId = prospect.assigned_agent_id || prospect.assignedAgentId;
  const assignedDivisionId = prospect.assigned_division_id || prospect.assignedDivisionId;
  const assignedRvpId = prospect.assigned_rvp_id || prospect.assignedRvpId;

  if (context.role === ROLES.DIVISION_LEADER) {
    if (context.divisionId && assignedDivisionId) {
      return String(context.divisionId) === String(assignedDivisionId);
    }

    return String(context.userId) === String(assignedRvpId);
  }

  if (context.role === ROLES.AGENT || context.role === ROLES.RECRUITER) {
    return (
      String(context.userId) === String(ownerUserId) ||
      String(context.userId) === String(assignedAgentId)
    );
  }

  if (context.role === ROLES.SUPPORT) {
    return hasPermission(context, "prospect:read");
  }

  return false;
}

function assertProspectAccess(context, prospect) {
  if (!canAccessProspect(context, prospect)) {
    const error = new Error("You do not have access to this prospect.");
    error.statusCode = 403;
    error.publicCode = "FORBIDDEN";
    throw error;
  }
}

function getProspectListScope(context) {
  if (!isActiveContext(context)) {
    return { denied: true };
  }

  if (context.role === ROLES.ADMINISTRATOR || context.role === ROLES.RVP) {
    return { organizationId: context.organizationId };
  }

  if (context.role === ROLES.DIVISION_LEADER) {
    return {
      organizationId: context.organizationId,
      divisionId: context.divisionId
    };
  }

  if (context.role === ROLES.AGENT || context.role === ROLES.RECRUITER) {
    return {
      organizationId: context.organizationId,
      ownerUserId: context.userId
    };
  }

  if (context.role === ROLES.SUPPORT) {
    return { organizationId: context.organizationId, readOnly: true };
  }

  return { denied: true };
}

function canAccessOperationsCenter(context) {
  return (
    isActiveContext(context) &&
    (context.role === ROLES.ADMINISTRATOR || context.role === ROLES.OPERATIONS)
  );
}

function resolveOrganizationId(context, requestedOrganizationId) {
  if (context.role === ROLES.ADMINISTRATOR && requestedOrganizationId) {
    return requestedOrganizationId;
  }

  return context.organizationId;
}

module.exports = {
  buildAuthContext,
  isActiveContext,
  hasPermission,
  canAccessProspect,
  assertProspectAccess,
  getProspectListScope,
  canAccessOperationsCenter,
  resolveOrganizationId,
  sameOrganization
};
