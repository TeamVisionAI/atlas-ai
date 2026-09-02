/**
 * BR-218 — Conversations privacy boundary.
 * Decision engine only: owner/servicing-user scope, plus explicit Support Mode.
 * Hierarchy, org membership, RVP/SRL/RL/DL, and team/oversight never grant content.
 */

const { ROLES } = require("../security/roles");
const { isSuperAdmin, isOrgAdmin } = require("../security/saasRoles");
const { PERMISSIONS } = require("../security/permissions");

const CONVERSATIONS_SUPPORT_PERMISSION = PERMISSIONS.CONVERSATIONS_SUPPORT;

const CONVERSATIONS_LIST_SCOPES = Object.freeze({
  MINE: "mine",
  SUPPORT: "support"
});

const UPLINE_ROLES_WITHOUT_CONVERSATION_ACCESS = Object.freeze([
  ROLES.RVP,
  ROLES.DIVISION_LEADER,
  "regional_leader",
  "district_leader",
  "srl",
  "rl"
]);

function truthyFlag(value) {
  if (value === true || value === 1) {
    return true;
  }
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function sameId(left, right) {
  return Boolean(left) && Boolean(right) && String(left) === String(right);
}

function conversationOwnerUserId(prospect) {
  return prospect?.owner_user_id || prospect?.ownerUserId || null;
}

function isOwnerOfConversation(prospect, userId) {
  return sameId(conversationOwnerUserId(prospect), userId);
}

function isSaasOrWorkspaceAdmin(authContext) {
  if (!authContext) {
    return false;
  }
  if (isOrgAdmin(authContext.saasRole || authContext.role)) {
    return true;
  }
  return String(authContext.role || "").trim().toLowerCase() === ROLES.ADMINISTRATOR;
}

function hasInjectedConversationsSupportGrant(authContext) {
  if (!authContext) {
    return false;
  }
  if (authContext.explicitConversationsSupport === true) {
    return true;
  }
  const explicit = authContext.explicitPermissions;
  return Array.isArray(explicit) && explicit.includes(CONVERSATIONS_SUPPORT_PERMISSION);
}

/**
 * Capability only — never use hasPermission / admin wildcards (BR-074 pattern).
 * SUPER_ADMIN always; ADMIN only with an explicit conversations:support grant.
 */
function canUseConversationsSupportAccess(authContext) {
  if (!authContext) {
    return false;
  }

  if (isSuperAdmin(authContext.saasRole || authContext.role)) {
    return true;
  }

  if (!isSaasOrWorkspaceAdmin(authContext)) {
    return false;
  }

  return hasInjectedConversationsSupportGrant(authContext);
}

function isExplicitConversationsSupportContext(authContext, options = {}) {
  if (!canUseConversationsSupportAccess(authContext)) {
    return false;
  }

  const supportModeActive =
    options.supportModeActive === true || Boolean(authContext?.supportMode?.active);

  if (isSuperAdmin(authContext.saasRole || authContext.role)) {
    return supportModeActive === true;
  }

  return truthyFlag(options.conversationsSupport);
}

function normalizeSupportTargetUserId(value) {
  const id = String(value || "").trim();
  return id || null;
}

/**
 * Implements BR-218 — normal Conversations lists are owner/servicing-user only.
 * workspaceScope=oversight is ignored. Support requires capability + context + target user.
 */
function resolveConversationsListScope(authContext, options = {}) {
  if (!authContext?.userId) {
    return { denied: true };
  }

  const organizationId = authContext.organizationId || null;
  const supportUserId = normalizeSupportTargetUserId(
    options.supportUserId || options.supportTargetUserId
  );

  if (
    supportUserId &&
    isExplicitConversationsSupportContext(authContext, options)
  ) {
    return {
      organizationId,
      ownerUserId: supportUserId,
      workspaceScope: CONVERSATIONS_LIST_SCOPES.SUPPORT,
      supportAccess: true,
      supportTargetUserId: supportUserId
    };
  }

  return {
    organizationId,
    ownerUserId: authContext.userId,
    workspaceScope: CONVERSATIONS_LIST_SCOPES.MINE,
    supportAccess: false,
    supportTargetUserId: null
  };
}

function isProspectInConversationsPrivacyScope(
  prospect,
  organizationId,
  authContext,
  options = {}
) {
  if (!prospect || !organizationId || !authContext) {
    return false;
  }

  const prospectOrg = prospect.organization_id || prospect.organizationId || null;
  if (!sameId(prospectOrg, organizationId)) {
    return false;
  }

  const listScope = resolveConversationsListScope(authContext, options);
  if (!listScope || listScope.denied === true || !listScope.ownerUserId) {
    return false;
  }

  return isOwnerOfConversation(prospect, listScope.ownerUserId);
}

function readConversationsSupportRequest(req = {}) {
  const query = req.query || {};
  const body = req.body || {};
  return {
    supportUserId: normalizeSupportTargetUserId(
      query.supportUserId || query.support_user_id || body.supportUserId || body.support_user_id
    ),
    conversationsSupport: truthyFlag(
      query.conversationsSupport || query.conversations_support || body.conversationsSupport
    ),
    supportModeActive: Boolean(req.supportContext?.organizationId)
  };
}

async function resolveConversationsSupportCapability(authContext, options = {}) {
  if (!authContext) {
    return false;
  }
  if (isSuperAdmin(authContext.saasRole || authContext.role)) {
    return true;
  }
  if (hasInjectedConversationsSupportGrant(authContext)) {
    return isSaasOrWorkspaceAdmin(authContext);
  }
  if (!isSaasOrWorkspaceAdmin(authContext)) {
    return false;
  }

  const { hasExplicitUserPermission } = require("../security/explicitUserPermissionService");
  return hasExplicitUserPermission({
    organizationId: authContext.organizationId,
    userId: authContext.userId,
    permissionCode: CONVERSATIONS_SUPPORT_PERMISSION,
    loadUserPermissions: options.loadUserPermissions,
    loadUserOrganizationId: options.loadUserOrganizationId
  });
}

async function withConversationsSupportCapability(authContext, options = {}) {
  if (!authContext) {
    return null;
  }
  const granted = await resolveConversationsSupportCapability(authContext, options);
  return {
    ...authContext,
    explicitConversationsSupport: granted === true
  };
}

function shouldAuditConversationsSupportAccess(listScope) {
  return Boolean(listScope?.supportAccess && listScope.supportTargetUserId);
}

module.exports = {
  CONVERSATIONS_SUPPORT_PERMISSION,
  CONVERSATIONS_LIST_SCOPES,
  UPLINE_ROLES_WITHOUT_CONVERSATION_ACCESS,
  canUseConversationsSupportAccess,
  isExplicitConversationsSupportContext,
  resolveConversationsListScope,
  isProspectInConversationsPrivacyScope,
  isOwnerOfConversation,
  readConversationsSupportRequest,
  resolveConversationsSupportCapability,
  withConversationsSupportCapability,
  shouldAuditConversationsSupportAccess
};
