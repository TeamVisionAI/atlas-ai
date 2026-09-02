/**
 * BR-218 — Conversations are owner/servicing-user only.
 * Team Prospects / hierarchy oversight is removed from Conversations.
 * Support view is explicit and never mixed into My Conversations.
 */

export const CONVERSATIONS_WORKSPACE_TABS = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

export const CONVERSATIONS_WORKSPACE_SCOPES = Object.freeze({
  MINE: "mine",
  OVERSIGHT: "oversight",
  SUPPORT: "support"
});

/** Implements BR-218 — Team Prospects is never shown in Conversations. */
export function canSeeConversationsTeamProspects() {
  return false;
}

export function resolveConversationsWorkspaceTab({ workspaceScopeParam = "" } = {}) {
  const requested = String(workspaceScopeParam || "").trim().toLowerCase();
  const requestedTeam = requested === CONVERSATIONS_WORKSPACE_SCOPES.OVERSIGHT;

  return {
    tab: CONVERSATIONS_WORKSPACE_TABS.MINE,
    workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.MINE,
    unauthorizedTeam: requestedTeam
  };
}

export function canOpenConversationsSupportView({
  canUseConversationsSupport = false,
  isSuperAdmin = false,
  supportModeActive = false
} = {}) {
  if (canUseConversationsSupport !== true) {
    return false;
  }
  if (isSuperAdmin) {
    return supportModeActive === true;
  }
  return true;
}

export function resolveConversationsSupportView({
  supportUserId = "",
  conversationsSupport = false,
  canOpenSupport = false
} = {}) {
  const targetUserId = String(supportUserId || "").trim();
  const explicit = conversationsSupport === true || conversationsSupport === "1";

  if (!canOpenSupport || !explicit || !targetUserId) {
    return {
      active: false,
      supportUserId: null,
      workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.MINE
    };
  }

  return {
    active: true,
    supportUserId: targetUserId,
    workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.SUPPORT
  };
}
