/**
 * Journey #5 Increment 1 — Loads conversation memory from AgentStore.
 */

const agentStore = require("./AgentStore");

/**
 * @param {string} conversationId
 * @returns {Promise<Object>}
 */
async function loadMemory(conversationId) {
  return agentStore.getMemory(conversationId);
}

/**
 * @param {Object} context
 * @param {Object} memory
 * @returns {Object}
 */
function mergeKnownFacts(context, memory) {
  const merged = { ...memory.collectedFacts };

  for (const [key, value] of Object.entries(context.knownFacts || {})) {
    merged[key] = {
      value,
      source: "snapshot",
      confidence: "high",
      collectedAt: new Date().toISOString()
    };
  }

  return merged;
}

/**
 * @param {Object} context
 * @param {Object} memory
 * @returns {Object}
 */
function buildMemoryView(context, memory) {
  const collectedFacts = mergeKnownFacts(context, memory);

  return {
    conversationId: memory.conversationId,
    history: memory.history,
    collectedFacts,
    summary: memory.summary,
    pendingTasks: memory.pendingTasks,
    completedTasks: memory.completedTasks,
    preferences: memory.preferences,
    sentiment: memory.sentiment,
    confidence: memory.confidence
  };
}

module.exports = {
  loadMemory,
  buildMemoryView,
  mergeKnownFacts
};
