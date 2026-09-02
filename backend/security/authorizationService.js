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
    organizationId: user.organization_id || user.organizationId || null,
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
  if (!context?.organizationId || !organizationId) {
    return false;
  }

  return String(context.organizationId) === String(organizationId);
}

function canAccessProspect(context, prospect = {}) {
  if (!isActiveContext(context) || !prospect) {
    return false;
  }

  const orgId = prospect.organization_id || prospect.organizationId || null;

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

const WORKSPACE_LIST_SCOPES = Object.freeze({
  MINE: "mine",
  OVERSIGHT: "oversight"
});

function canUseOversightWorkspaceList(context) {
  if (!isActiveContext(context)) {
    return false;
  }

  if (
    context.role === ROLES.ADMINISTRATOR ||
    context.role === ROLES.RVP ||
    context.role === ROLES.DIVISION_LEADER
  ) {
    return true;
  }

  // dashboard:team is Team Dashboard (BR-149), including agents — not Conversations access (BR-218).
  return hasPermission(context, "dashboard:executive");
}

/**
 * BR-165 — default My Prospects lists are owner_user_id = signed-in user.
 * Same-org visibility is not ownership. Prospect Center Team / oversight is explicit.
 * Conversations lists never use this helper (BR-218).
 */
function resolveWorkspaceListScope(context, workspaceScope = null) {
  if (!isActiveContext(context)) {
    return { denied: true };
  }

  const requested = String(workspaceScope || "").trim().toLowerCase();
  if (requested === WORKSPACE_LIST_SCOPES.OVERSIGHT && canUseOversightWorkspaceList(context)) {
    return excludeSelfFromOversightScope(getProspectListScope(context), context.userId);
  }

  return {
    organizationId: context.organizationId,
    ownerUserId: context.userId,
    workspaceScope: WORKSPACE_LIST_SCOPES.MINE
  };
}

function excludeSelfFromOversightScope(scope, userId) {
  if (!scope || scope.denied === true) {
    return scope;
  }

  const excludeOwnerUserId = userId || null;
  if (Array.isArray(scope.ownerUserIds)) {
    return {
      ...scope,
      ownerUserIds: scope.ownerUserIds.filter((id) => String(id) !== String(userId)),
      excludeOwnerUserId,
      workspaceScope: WORKSPACE_LIST_SCOPES.OVERSIGHT
    };
  }

  if (scope.ownerUserId && String(scope.ownerUserId) === String(userId)) {
    return {
      organizationId: scope.organizationId,
      ownerUserIds: [],
      excludeOwnerUserId,
      workspaceScope: WORKSPACE_LIST_SCOPES.OVERSIGHT
    };
  }

  return {
    ...scope,
    excludeOwnerUserId,
    workspaceScope: WORKSPACE_LIST_SCOPES.OVERSIGHT
  };
}

function isSafeListScopeId(value) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(value || ""));
}

function prospectMatchesOwnerScope(prospect, ownerIds) {
  // Implements BR-165 — list ownership is owner_user_id only (not assigned_agent_id).
  const ownerUserId = prospect?.owner_user_id || prospect?.ownerUserId || null;
  const ids = new Set((ownerIds || []).map((id) => String(id)));
  return Boolean(ownerUserId && ids.has(String(ownerUserId)));
}

function isProspectInWorkspaceListScope(prospect, listScope) {
  if (!prospect || !listScope || listScope.denied === true) {
    return false;
  }

  const orgId = prospect.organization_id || prospect.organizationId || null;
  if (
    listScope.organizationId &&
    String(orgId || "") !== String(listScope.organizationId)
  ) {
    return false;
  }

  const ownerUserId = prospect.owner_user_id || prospect.ownerUserId || null;
  if (
    listScope.excludeOwnerUserId &&
    ownerUserId &&
    String(ownerUserId) === String(listScope.excludeOwnerUserId)
  ) {
    return false;
  }

  if (listScope.ownerUserId) {
    return prospectMatchesOwnerScope(prospect, [listScope.ownerUserId]);
  }

  if (Array.isArray(listScope.ownerUserIds)) {
    return prospectMatchesOwnerScope(prospect, listScope.ownerUserIds);
  }

  return true;
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
  if (options.effectiveOrganizationId) {
    return options.effectiveOrganizationId;
  }

  return context?.organizationId || null;
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
  resolveWorkspaceListScope,
  canUseOversightWorkspaceList,
  isProspectInWorkspaceListScope,
  isSafeListScopeId,
  WORKSPACE_LIST_SCOPES,
  canAccessOperationsCenter,
  resolveOrganizationId,
  sameOrganization
};
