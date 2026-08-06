/**
 * Recruit AI v2 public surface.
 * Side effects remain disabled; use processRecruitAiV2Turn for auditable decisions.
 */

const { processRecruitAiV2Turn } = require("./orchestrator");
const {
  createConversationContext,
  mergeConversationContext,
  normalizeLanguage
} = require("./conversationContext");
const {
  loadConversationContext,
  loadContextFromReplayFixture,
  extractOfferedSlotsFromText
} = require("./contextLoader");
const { interpretInboundMessage } = require("./interpreter");
const { decideConversationTurn, decideSafeFailure } = require("./decisionEngine");
const { buildResponsePlan } = require("./responsePlan");
const { renderCustomerReply } = require("./responseRenderer");
const { authorizeSideEffects, isExecutionEnabled, isShadowEnabled } = require("./sideEffectAuthorizer");
const { containsInternalDiagnostics, sanitizeCustomerCopy } = require("./sanitize");
const constants = require("./constants");

module.exports = {
  processRecruitAiV2Turn,
  createConversationContext,
  mergeConversationContext,
  normalizeLanguage,
  loadConversationContext,
  loadContextFromReplayFixture,
  extractOfferedSlotsFromText,
  interpretInboundMessage,
  decideConversationTurn,
  decideSafeFailure,
  buildResponsePlan,
  renderCustomerReply,
  authorizeSideEffects,
  isExecutionEnabled,
  isShadowEnabled,
  containsInternalDiagnostics,
  sanitizeCustomerCopy,
  ...constants
};
