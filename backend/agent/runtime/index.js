/**
 * Journey #5 Increment 4 — Autonomous conversation runtime exports.
 */

const { SessionEvent } = require("./SessionEvents");
const { CONVERSATION_STATUS, OUTCOME_TYPE } = require("./ConversationState");
const sessionStore = require("./ConversationSession");
const { recoverContext } = require("./ContextRecovery");
const { buildConversationSummary, flattenFacts } = require("./ConversationSummary");
const {
  isConversationComplete,
  resolveOutcome,
  resolveStatus,
  shouldClose
} = require("./ConversationLifecycle");
const {
  detectInterruption,
  buildResumePhrase,
  enhanceResponseForInterruption
} = require("./InterruptionHandler");
const {
  AutonomousConversationRuntime,
  createAutonomousConversationRuntime,
  RESUME_GAP_MS
} = require("./AutonomousConversationRuntime");

module.exports = {
  SessionEvent,
  CONVERSATION_STATUS,
  OUTCOME_TYPE,
  sessionStore,
  recoverContext,
  buildConversationSummary,
  flattenFacts,
  isConversationComplete,
  resolveOutcome,
  resolveStatus,
  shouldClose,
  detectInterruption,
  buildResumePhrase,
  enhanceResponseForInterruption,
  AutonomousConversationRuntime,
  createAutonomousConversationRuntime,
  RESUME_GAP_MS
};
