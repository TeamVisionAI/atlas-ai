/**
 * BR-218 — Conversations are owner/servicing-user only.
 * Team Prospects / hierarchy oversight is removed from Conversations.
 * Support view is explicit Support Mode, read-only for another user.
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
  supportModeActive = false
} = {}) {
  return canUseConversationsSupport === true && supportModeActive === true;
}

export function resolveConversationsSupportView({
  supportUserId = "",
  canOpenSupport = false,
  currentUserId = ""
} = {}) {
  const targetUserId = String(supportUserId || "").trim();

  if (!canOpenSupport || !targetUserId) {
    return {
      active: false,
      readOnly: false,
      supportUserId: null,
      workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.MINE
    };
  }

  const viewerId = String(currentUserId || "").trim();
  return {
    active: true,
    readOnly: !viewerId || viewerId !== targetUserId,
    supportUserId: targetUserId,
    workspaceScope: CONVERSATIONS_WORKSPACE_SCOPES.SUPPORT
  };
}

export function conversationsSupportMutationsAllowed(supportView) {
  return supportView?.active !== true || supportView.readOnly !== true;
}
