/**
 * Journey #5 Increment 1 — Atlas Agent Conversation Core.
 */

const { AgentEvent } = require("./AgentEvents");
const { DECISION_TYPE, CONFIDENCE_LEVEL, createDecisionRecord } = require("./DecisionRecord");
const agentStore = require("./AgentStore");
const { buildContext, DEFAULT_WORKFLOW, getFieldLabel } = require("./ContextBuilder");
const { loadMemory, buildMemoryView, mergeKnownFacts } = require("./MemoryLoader");
const {
  decide,
  detectEscalation,
  detectQuestion,
  listMissingFields,
  inferAnswer
} = require("./DecisionEngine");
const { generateResponse } = require("./ResponseGenerator");
const {
  ConversationEngine,
  createConversationEngine,
  extractFactsFromText,
  promoteFacts
} = require("./ConversationEngine");
const {
  createAutonomousConversationRuntime,
  AutonomousConversationRuntime,
  SessionEvent,
  sessionStore
} = require("./runtime");

module.exports = {
  AgentEvent,
  DECISION_TYPE,
  CONFIDENCE_LEVEL,
  createDecisionRecord,
  agentStore,
  buildContext,
  DEFAULT_WORKFLOW,
  getFieldLabel,
  loadMemory,
  buildMemoryView,
  mergeKnownFacts,
  decide,
  detectEscalation,
  detectQuestion,
  listMissingFields,
  inferAnswer,
  generateResponse,
  ConversationEngine,
  createConversationEngine,
  extractFactsFromText,
  promoteFacts,
  createAutonomousConversationRuntime,
  AutonomousConversationRuntime,
  SessionEvent,
  sessionStore
};
