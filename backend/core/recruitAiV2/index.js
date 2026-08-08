/**
 * Recruit AI v2 public surface.
 * Side effects remain disabled; use processRecruitAiV2Turn for auditable decisions.
 */

const {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync
} = require("./orchestrator");
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
const {
  sanitizeContextForPersistence,
  assertNoForbiddenPayload
} = require("./contextSanitizer");
const {
  createMemoryContextRepository,
  createSupabaseContextRepository
} = require("./contextRepository");
const {
  createContextPersistenceService,
  isMetaReviewScope
} = require("./contextPersistenceService");
const {
  resolveShadowConfig,
  isShadowModeEnabled,
  isEligibleForShadowEvaluation
} = require("./shadowConfig");
const {
  createMemoryShadowEvaluationRepository,
  createSupabaseShadowEvaluationRepository
} = require("./shadowEvaluationRepository");
const {
  createShadowEvaluationService,
  buildReconstructionInput
} = require("./shadowEvaluationService");
const {
  scheduleRecruitAiV2ShadowEvaluation,
  runRecruitAiV2ShadowEvaluation
} = require("./shadowModeRunner");
const {
  scheduleRecruitAiV2PostLiveAdvisory,
  runRecruitAiV2PostLiveAdvisory
} = require("./advisoryTurnRunner");
const {
  resolveContextCaptureConfig,
  isEligibleForContextCapture
} = require("./contextCaptureConfig");
const { createContextCaptureService } = require("./contextCaptureService");
const {
  computeContextOnlyTurn,
  buildCaptureDiagnostic
} = require("./contextTurnUpdate");
const { resolveConversationalLanguage } = require("./languagePolicy");
const {
  parseLocationAnswer,
  proposeStateFromCity,
  FACT_CERTAINTY
} = require("./locationFacts");
const {
  classifyDivergence,
  extractLiveCeResponseIntent,
  DIVERGENCE
} = require("./shadowDivergence");
const constants = require("./constants");
const {
  readCandidateSlots,
  readCandidateSlotsSync,
  resolveAvailabilityAgent,
  selectCandidateSlots,
  filterSlotsByConstraints,
  AGENT_RESOLUTION,
  READ_STATUS
} = require("./schedulingAvailabilityReader");

module.exports = {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync,
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
  sanitizeContextForPersistence,
  assertNoForbiddenPayload,
  createMemoryContextRepository,
  createSupabaseContextRepository,
  createContextPersistenceService,
  isMetaReviewScope,
  resolveShadowConfig,
  isShadowModeEnabled,
  isEligibleForShadowEvaluation,
  resolveContextCaptureConfig,
  isEligibleForContextCapture,
  createContextCaptureService,
  computeContextOnlyTurn,
  buildCaptureDiagnostic,
  resolveConversationalLanguage,
  parseLocationAnswer,
  proposeStateFromCity,
  FACT_CERTAINTY,
  createMemoryShadowEvaluationRepository,
  createSupabaseShadowEvaluationRepository,
  createShadowEvaluationService,
  buildReconstructionInput,
  scheduleRecruitAiV2ShadowEvaluation,
  runRecruitAiV2ShadowEvaluation,
  scheduleRecruitAiV2PostLiveAdvisory,
  runRecruitAiV2PostLiveAdvisory,
  classifyDivergence,
  extractLiveCeResponseIntent,
  DIVERGENCE,
  readCandidateSlots,
  readCandidateSlotsSync,
  resolveAvailabilityAgent,
  selectCandidateSlots,
  filterSlotsByConstraints,
  AGENT_RESOLUTION,
  READ_STATUS,
  ...constants
};
