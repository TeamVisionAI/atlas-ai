/**
 * Shared Conversations Center access presentation (feature + RBAC).
 * Backend remains source of truth via GET /api/conversations/access.
 */

export const CONVERSATIONS_ACCESS_STATE = Object.freeze({
  UNKNOWN: "unknown",
  ALLOWED: "allowed",
  NOT_ENABLED: "not_enabled",
  FORBIDDEN: "forbidden"
});

export function resolveConversationsAccessStateFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return CONVERSATIONS_ACCESS_STATE.UNKNOWN;
  }
  if (payload.allowed === true) {
    return CONVERSATIONS_ACCESS_STATE.ALLOWED;
  }
  const code = String(payload.code || payload.error || "");
  if (
    code === "CONVERSATIONS_CENTER_NOT_ENABLED" ||
    code === "CONVERSATIONS_CENTER_ORG_FORBIDDEN"
  ) {
    return CONVERSATIONS_ACCESS_STATE.NOT_ENABLED;
  }
  if (
    code === "CONVERSATIONS_CENTER_FORBIDDEN" ||
    code === "CONVERSATIONS_CENTER_USER_FORBIDDEN"
  ) {
    return CONVERSATIONS_ACCESS_STATE.FORBIDDEN;
  }
  return CONVERSATIONS_ACCESS_STATE.NOT_ENABLED;
}

export function resolveConversationsAccessStateFromError(error) {
  if (!error) {
    return CONVERSATIONS_ACCESS_STATE.UNKNOWN;
  }
  if (error.status !== 403) {
    return CONVERSATIONS_ACCESS_STATE.UNKNOWN;
  }
  return resolveConversationsAccessStateFromPayload({
    code: error.code || error.error,
    allowed: false
  });
}

export function conversationsAccessAllowsNav(state) {
  return state === CONVERSATIONS_ACCESS_STATE.ALLOWED;
}
