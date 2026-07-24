/**
 * Sprint 16.1 — Lazy hooks to avoid circular imports in WhatsApp pipelines.
 */

function invokeHook(methodName, args) {
  const orchestrator = require("./recruitingWorkflowOrchestrator");
  const method = orchestrator[methodName];

  if (typeof method !== "function") {
    return Promise.resolve(null);
  }

  return method(...args);
}

module.exports = {
  onLegacyProspectCreated: (...args) => invokeHook("onLegacyProspectCreated", args),
  onMessageReceived: (...args) => invokeHook("onMessageReceived", args),
  onMessageSent: (...args) => invokeHook("onMessageSent", args),
  onInterviewScheduled: (...args) => invokeHook("onInterviewScheduled", args),
  onConversationProgress: (...args) => invokeHook("onConversationProgress", args)
};
