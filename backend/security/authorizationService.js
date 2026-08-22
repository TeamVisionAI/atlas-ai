/**
 * LC1 — Centralized authorization decisions.
 */

const { ROLES, canUserLogin, normalizeRole } = require("./roles");
const { permissionsForRole, roleHasPermission } = require("./permissions");
const {
  HIERARCHY_MODES,
  prospectBelongsToScopedUsers
} = require("../core/hierarchyScopeEngine");

const PERMISSION_ALIASES = Object.freeze({
  "admin:users": ["admin:users", "users:manage"],
  "admin:roles": ["admin:roles", "settings:manage"],
  "operations:access": ["operations:access"],
  "audit:read": ["audit:read"],
  "billing:access": ["billing:access"]
});

function permissionMatches(context, permission) {
  const aliases = PERMISSION_ALIASES[permission] || [permission];

  if (!Array.isArray(context.permissions)) {
    return false;
  }

  return aliases.some((code) => context.permissions.includes(code));
}
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { normalizeSaasRole, toLegacyRole, resolveCanonicalIdentity } = require("./saasRoles");
const { resolvePermissionsForUser } = require("./permissionService");

function resolveUserStatus(user) {
  if (typeof user.is_active === "boolean") {
    return user.is_active ? "active" : "suspended";
  }

  return user.status || "active";
}

function buildAuthContext(user, { jwtPayload = null, permissions = null, hierarchy = null } = {}) {
  if (!user) {
    return null;
  }

  const identity = resolveCanonicalIdentity({
    usersRole: user.users_role || user.saas_role || user.saasRole,
    atlasRole: user.role
  });
  const saasRole =
    identity.saasRole ||
    normalizeSaasRole(jwtPayload?.role) ||
    String(user.role || ROLES.RECRUITER).toUpperCase();
  const legacyRole = identity.legacyRole || normalizeRole(user.role) || toLegacyRole(saasRole);

  const hierarchyMode = hierarchy?.mode || null;
  const hierarchyUserIds =
    hierarchy && Object.prototype.hasOwnProperty.call(hierarchy, "userIds")
      ? hierarchy.userIds
      : undefined;

  return {
    userId: user.id,
    email: user.email,
    role: legacyRole,
    saasRole,
    businessRank: user.business_rank || user.businessRank || null,
    organizationId: user.organization_id || user.organizationId || DEFAULT_ORGANIZATION_ID,
    divisionId: user.division_id || user.divisionId || null,
    reportsToUserId: user.reports_to_user_id || user.reportsToUserId || null,
    permissions: permissions || jwtPayload?.permissions || permissionsForRole(legacyRole),
    status: resolveUserStatus(user),
    hierarchyMode,
    hierarchyUserIds,
    hierarchyReason: hierarchy?.reason || null
  };
}

async function buildAuthContextAsync(user, options = {}) {
  const permissions = user ? await resolvePermissionsForUser(user) : null;
  let hierarchy = options.hierarchy || null;

  if (user && !hierarchy) {
    try {
      const { resolveHierarchyScopeForUser } = require("../core/hierarchyScopeEngine");
      hierarchy = await resolveHierarchyScopeForUser(user);
    } catch (error) {
      console.error("[authContext] hierarchy resolve failed", error.message);
      hierarchy = {
        mode: HIERARCHY_MODES.SELF,
        userIds: user.id ? [String(user.id)] : [],
        reason: "HIERARCHY_RESOLVE_ERROR_FAIL_CLOSED"
      };
    }
  }

  return buildAuthContext(user, { ...options, permissions, hierarchy });
}

function isActiveContext(context) {
  return Boolean(context && canUserLogin(context.status));
}

function hasPermission(context, permission) {
  if (!isActiveContext(context)) {
    return false;
  }

  if (context.role === ROLES.ADMINISTRATOR) {
    return true;
  }

  if (Array.isArray(context.permissions) && context.permissions.includes(permission)) {
    return true;
  }

  if (permissionMatches(context, permission)) {
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

  if (context.role === ROLES.DIVISION_LEADER) {
    if (context.hierarchyMode === HIERARCHY_MODES.ORGANIZATION) {
      return true;
    }

    if (Array.isArray(context.hierarchyUserIds)) {
      if (prospectBelongsToScopedUsers(prospect, context.hierarchyUserIds)) {
        return true;
      }
      if (context.divisionId && assignedDivisionId) {
        return String(context.divisionId) === String(assignedDivisionId);
      }
      return false;
    }

    return (
      String(context.userId) === String(ownerUserId) ||
      String(context.userId) === String(assignedAgentId)
    );
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

function filterProspectsForAuthContext(context, prospects = []) {
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return [];
  }

  return prospects.filter((prospect) => canAccessProspect(context, prospect));
}

function getProspectListScope(context) {
  if (!isActiveContext(context)) {
    return { denied: true };
  }

  if (context.role === ROLES.ADMINISTRATOR || context.role === ROLES.RVP) {
    return { organizationId: context.organizationId };
  }

  if (context.role === ROLES.DIVISION_LEADER) {
    if (
      context.hierarchyMode === HIERARCHY_MODES.SUBTREE &&
      Array.isArray(context.hierarchyUserIds) &&
      context.hierarchyUserIds.length > 1
    ) {
      return {
        organizationId: context.organizationId,
        ownerUserIds: context.hierarchyUserIds
      };
    }

    return {
      organizationId: context.organizationId,
      ownerUserId: context.userId
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

function resolveOrganizationId(context, requestedOrganizationId, options = {}) {
  if (!context) {
    return DEFAULT_ORGANIZATION_ID;
  }

  if (options.effectiveOrganizationId) {
    return options.effectiveOrganizationId;
  }

  return context.organizationId || DEFAULT_ORGANIZATION_ID;
}

module.exports = {
  buildAuthContext,
  buildAuthContextAsync,
  isActiveContext,
  hasPermission,
  canAccessProspect,
  filterProspectsForAuthContext,
  assertProspectAccess,
  getProspectListScope,
  canAccessOperationsCenter,
  resolveOrganizationId,
  sameOrganization
};
