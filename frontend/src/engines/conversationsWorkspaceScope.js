/**
 * Conversations My Prospects / Team Prospects tab + list scope.
 * Mirrors BR-165: default is owner_user_id = current user; Team is explicit oversight.
 */

import { ROLES, PERMISSIONS, normalizeRole, roleHasPermission } from "../security/workspacePermissions.js";

export const CONVERSATIONS_WORKSPACE_TABS = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

export const CONVERSATIONS_WORKSPACE_SCOPES = Object.freeze({
  MINE: "mine",
  OVERSIGHT: "oversight"
});

export function canSeeConversationsTeamProspects(user) {
  const role = normalizeRole(user?.role);
  if (
    role === ROLES.ADMINISTRATOR ||
    role === ROLES.RVP ||
    role === ROLES.DIVISION_LEADER
  ) {
    return true;
  }
  return roleHasPermission(role, PERMISSIONS.DASHBOARD_EXECUTIVE);
}

export function resolveConversationsWorkspaceTab({
  workspaceScopeParam = "",
  canSeeTeam = false
} = {}) {
  const requested = String(workspaceScopeParam || "").trim().toLowerCase();
  if (requested === CONVERSATIONS_WORKSPACE_SCOPES.OVERSIGHT) {
    if (canSeeTeam) {
      return {
        tab: CONVERSATIONS_WORKSPACE_TABS.TEAM,
        workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.OVERSIGHT,
        unauthorizedTeam: false
      };
    }
    return {
      tab: CONVERSATIONS_WORKSPACE_TABS.MINE,
      workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.MINE,
      unauthorizedTeam: true
    };
  }

  return {
    tab: CONVERSATIONS_WORKSPACE_TABS.MINE,
    workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.MINE,
    unauthorizedTeam: false
  };
}
