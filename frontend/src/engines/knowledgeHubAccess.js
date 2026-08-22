/**
 * Shared Knowledge Hub access presentation (tenant feature + RBAC).
 */

export const KNOWLEDGE_ACCESS_STATE = Object.freeze({
  UNKNOWN: "unknown",
  ALLOWED: "allowed",
  NOT_ENABLED: "not_enabled",
  FORBIDDEN: "forbidden"
});

export function resolveKnowledgeAccessStateFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return KNOWLEDGE_ACCESS_STATE.UNKNOWN;
  }
  if (payload.allowed === true) {
    return KNOWLEDGE_ACCESS_STATE.ALLOWED;
  }
  const code = String(payload.code || payload.error || "");
  if (code === "KNOWLEDGE_HUB_NOT_ENABLED") {
    return KNOWLEDGE_ACCESS_STATE.NOT_ENABLED;
  }
  if (code === "KNOWLEDGE_HUB_FORBIDDEN") {
    return KNOWLEDGE_ACCESS_STATE.FORBIDDEN;
  }
  return KNOWLEDGE_ACCESS_STATE.NOT_ENABLED;
}

export function resolveKnowledgeAccessStateFromError(error) {
  if (!error) {
    return KNOWLEDGE_ACCESS_STATE.UNKNOWN;
  }
  if (error.status !== 403) {
    return KNOWLEDGE_ACCESS_STATE.UNKNOWN;
  }
  return resolveKnowledgeAccessStateFromPayload({
    code: error.code || error.error,
    allowed: false
  });
}

export function knowledgeAccessAllowsNav(state) {
  return state === KNOWLEDGE_ACCESS_STATE.ALLOWED;
}
