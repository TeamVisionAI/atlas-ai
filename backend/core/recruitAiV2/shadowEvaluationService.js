/**
 * Recruit AI v2 — shadow evaluation service.
 * Runs v2 beside live CE; persists comparison + optional durable context.
 * Never sends WhatsApp, books appointments, or mutates BR-080.
 * Implements BR-081 Phase 3.
 */

const { processRecruitAiV2Turn } = require("./orchestrator");
const { containsInternalDiagnostics } = require("./sanitize");
const { isMetaReviewScope } = require("./contextPersistenceService");
const {
  extractLiveCeResponseIntent,
  extractLiveLanguage,
  languagesAgree,
  classifyDivergence,
  extractProposedSideEffect
} = require("./shadowDivergence");
const { resolveProspectPreferredLanguage } = require("../prospectLanguage");

function sanitizeFailureMessage(error) {
  const message = String(error?.message || error || "shadow_evaluation_failed");
  return message
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(/Bearer\s+\S+/gi, "[redacted-token]")
    .slice(0, 240);
}

function buildReconstructionInput(prospect = {}, extras = {}) {
  const preferredLanguage = resolveProspectPreferredLanguage(prospect);
  const step = String(prospect.current_step || "").toUpperCase();
  const closed = step.includes("DO NOT CONTACT") || step === "CLOSED";

  return {
    organizationId: extras.organizationId || prospect.organization_id || null,
    prospectId: extras.prospectId || prospect.id || null,
    preferredLanguage,
    timezone: extras.timezone || "America/New_York",
    knownFacts: {
      name: prospect.name || null,
      city: prospect.city || null,
      state: prospect.state || null,
      email: null
    },
    appointment: {
      status: prospect.appointment_date ? "confirmed" : "none",
      confirmedDate: prospect.appointment_date || null,
      confirmedTime: null,
      appointmentId: prospect.appointment_id || null,
      previouslyOfferedSlots: []
    },
    conversation: {
      lastQuestionAsked: null,
      lastOfferMade: null,
      lastProspectIntent: null
    },
    attention: {
      needsHumanAttention: Boolean(
        prospect.attention_status === "human_required" ||
          prospect.needs_human_attention ||
          extras.needsHumanAttention
      ),
      assignmentStatus: prospect.assignment_status || null,
      acknowledged: Boolean(prospect.attention_acknowledged_at)
    },
    transcriptTail: extras.transcriptTail || [],
    prospectClosed: closed
  };
}

function buildSanitizedMetadata({
  eligibilityReason = null,
  persistence = null,
  evaluationError = null,
  liveReason = null,
  liveReplied = null,
  v2NextAction = null,
  v2ReasonCodes = null
} = {}) {
  return {
    shadowPhase: 3,
    eligibilityReason,
    liveReason: liveReason || null,
    liveReplied: liveReplied == null ? null : Boolean(liveReplied),
    persistence: persistence
      ? {
          attempted: Boolean(persistence.attempted),
          ok: persistence.result?.ok ?? null,
          idempotent: persistence.result?.idempotent ?? null,
          code: persistence.result?.code || null,
          source: persistence.source || null
        }
      : null,
    v2NextAction: v2NextAction || null,
    v2ReasonCodes: Array.isArray(v2ReasonCodes)
      ? v2ReasonCodes.slice(0, 12)
      : null,
    evaluationError: evaluationError ? sanitizeFailureMessage(evaluationError) : null
  };
}

function createShadowEvaluationService({
  repository,
  persistenceService = null,
  processTurn = processRecruitAiV2Turn
} = {}) {
  if (!repository) {
    throw new Error("shadow evaluation repository is required");
  }

  async function persistShadowRow(row) {
    return repository.insert(row);
  }

  /**
   * Evaluate one inbound turn in shadow mode and persist comparison.
   * Throws only for programming misuse; runtime failures are captured as rows.
   */
  async function evaluateShadowTurn({
    prospect,
    organizationId,
    inboundMessageId,
    messageText,
    channel = "whatsapp",
    conversation = {},
    language = null,
    options = {}
  } = {}) {
    const orgId = organizationId || prospect?.organization_id || null;
    const prospectId = prospect?.id || null;

    if (!orgId || !prospectId) {
      const error = new Error("organizationId and prospectId are required for shadow evaluation");
      error.code = "SHADOW_SCOPE_REQUIRED";
      throw error;
    }

    if (isMetaReviewScope({ organizationId: orgId, prospectId, channel })) {
      return {
        skipped: true,
        reason: "META_REVIEW_ISOLATED",
        row: null
      };
    }

    const liveCeResponseIntent = extractLiveCeResponseIntent(conversation);
    const liveLanguage = extractLiveLanguage(conversation, language);
    const reconstructionInput = buildReconstructionInput(prospect, {
      organizationId: orgId,
      prospectId,
      needsHumanAttention: conversation?.humanAssist === true
    });

    let turnResult = null;
    let evaluationError = null;

    try {
      turnResult = await processTurn({
        message: {
          id: inboundMessageId || null,
          providerMessageId: inboundMessageId || null,
          text: String(messageText || "").trim()
        },
        contextInput: reconstructionInput,
        options: {
          channel,
          flexible: options.flexible !== false,
          inboundMessageId: inboundMessageId || null,
          persistContext: Boolean(persistenceService),
          prospectClosed: Boolean(reconstructionInput.prospectClosed),
          env: options.env || process.env
        },
        persistenceService
      });
    } catch (error) {
      evaluationError = error;
    }

    const v2InterpretedIntent = turnResult?.interpretation?.intent || null;
    const v2DecisionCode =
      turnResult?.structuredDecision?.decision?.nextAction || null;
    const v2Confidence =
      turnResult?.interpretation?.confidence ??
      turnResult?.structuredDecision?.confidence ??
      null;
    const v2Language =
      turnResult?.rendered?.language ||
      turnResult?.structuredDecision?.preferredLanguage ||
      null;
    const v2RenderedText = turnResult?.rendered?.text || "";
    const diagnosticLeakCheck = containsInternalDiagnostics(v2RenderedText);
    const languageAgreement = languagesAgree(liveLanguage, v2Language);
    const v2ProposedSideEffect = extractProposedSideEffect(turnResult?.authorization);

    const divergenceClassification = classifyDivergence({
      liveCeResponseIntent,
      liveLanguage,
      v2InterpretedIntent,
      v2DecisionCode,
      v2Language,
      v2RenderedText,
      evaluationFailed: Boolean(evaluationError),
      languageAgreement
    });

    const contextId =
      turnResult?.nextContext?._persistence?.id ||
      turnResult?.context?._persistence?.id ||
      null;

    const row = await persistShadowRow({
      organization_id: orgId,
      prospect_id: prospectId,
      channel,
      context_id: contextId,
      inbound_message_id: inboundMessageId || null,
      live_ce_response_intent: liveCeResponseIntent,
      v2_interpreted_intent: v2InterpretedIntent,
      v2_decision_code: evaluationError ? null : v2DecisionCode,
      v2_confidence: v2Confidence,
      v2_proposed_side_effect: evaluationError ? "none" : v2ProposedSideEffect,
      divergence_classification: divergenceClassification,
      language_agreement: languageAgreement,
      diagnostic_leak_check: diagnosticLeakCheck === false,
      metadata: buildSanitizedMetadata({
        liveReason: conversation?.reason || null,
        liveReplied: conversation?.replied,
        persistence: turnResult?.persistence || null,
        evaluationError,
        v2NextAction: v2DecisionCode,
        v2ReasonCodes: turnResult?.structuredDecision?.reasonCodes || null
      })
    });

    return {
      skipped: false,
      reason: null,
      row,
      turnResult,
      evaluationError: evaluationError
        ? sanitizeFailureMessage(evaluationError)
        : null,
      divergenceClassification,
      liveCeResponseIntent,
      authorizationDenied: turnResult
        ? turnResult.authorization?.authorized === false
        : true
    };
  }

  return {
    evaluateShadowTurn,
    buildReconstructionInput,
    persistShadowRow
  };
}

module.exports = {
  createShadowEvaluationService,
  buildReconstructionInput,
  sanitizeFailureMessage
};
