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
  extractLiveReplyText,
  languagesAgree,
  classifyDivergence,
  extractLiveSideEffectCategory,
  extractV2SideEffectCategory,
  resolveAppointmentStateAgreement,
  DIVERGENCE
} = require("./shadowDivergence");
const { resolveProspectPreferredLanguage } = require("../prospectLanguage");
const { resolveCanonicalProspectEmail } = require("./prospectEmail");

function sanitizeFailureMessage(error) {
  const message = String(error?.message || error || "shadow_evaluation_failed");
  return message
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(/Bearer\s+\S+/gi, "[redacted-token]")
    .replace(/at\s+\S+\s+\([^)]+\)/g, "[redacted-frame]")
    .slice(0, 240);
}

function safeErrorCode(error) {
  if (!error) {
    return null;
  }
  if (error.code) {
    return String(error.code).slice(0, 80);
  }
  const message = String(error.message || "");
  if (/timeout/i.test(message)) {
    return "SHADOW_EVALUATION_TIMEOUT";
  }
  return "SHADOW_EVALUATION_FAILED";
}

function buildReconstructionInput(prospect = {}, extras = {}) {
  const preferredLanguage = resolveProspectPreferredLanguage(prospect);
  const step = String(prospect.current_step || "").toUpperCase();
  const closed = step.includes("DO NOT CONTACT") || step === "CLOSED";

  // BR-107 — read-only agent hints for Sprint 22 availability (never mutate BR-080).
  const ownerUserId = prospect.owner_user_id || prospect.ownerUserId || null;
  const assignedAgentId =
    prospect.assigned_agent_id ||
    prospect.assignedAgentId ||
    prospect.assigned_rvp_id ||
    prospect.assignedRvpId ||
    null;

  return {
    organizationId: extras.organizationId || prospect.organization_id || null,
    prospectId: extras.prospectId || prospect.id || null,
    preferredLanguage,
    // Prospect-seeded language is inferred/default — mutable by active conversation (BR-082).
    languageMeta: {
      source: extras.languageSource || "inferred",
      spanishEvidenceCount: 0,
      englishEvidenceCount: 0,
      lastMessageLanguage: "unknown"
    },
    timezone: extras.timezone || "America/New_York",
    // Prefer assigned agent, else BR-080 owner for availability reads.
    agentId: assignedAgentId || null,
    prospectOwnerUserId: ownerUserId,
    knownFacts: {
      name: prospect.name || null,
      city: prospect.city || null,
      state: prospect.state || null,
      cityCertainty: prospect.city && prospect.state ? "confirmed" : prospect.city ? "partial" : "unknown",
      stateCertainty: prospect.state ? "confirmed" : "unknown",
      proposedState: null,
      // Implements BR-117 — hydrate invitation email from canonical sources only.
      email: resolveCanonicalProspectEmail(prospect)
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
  evaluationStatus = "completed",
  safeError = null,
  persistence = null,
  liveReason = null,
  liveReplied = null,
  liveSideEffectCategory = null,
  v2SideEffectCategory = null,
  appointmentStateAgreement = null,
  escalationRecommended = null,
  v2NextAction = null,
  v2ReasonCodes = null,
  diagnosticLeakLive = null,
  diagnosticLeakV2 = null
} = {}) {
  return {
    shadowPhase: 3,
    evaluationStatus,
    safeErrorCode: safeError,
    liveReason: liveReason || null,
    liveReplied: liveReplied == null ? null : Boolean(liveReplied),
    liveSideEffectCategory: liveSideEffectCategory || "none",
    v2SideEffectCategory: v2SideEffectCategory || "none",
    appointmentStateAgreement:
      appointmentStateAgreement == null ? null : Boolean(appointmentStateAgreement),
    escalationRecommended:
      escalationRecommended == null ? null : Boolean(escalationRecommended),
    diagnosticLeakLive:
      diagnosticLeakLive == null ? null : Boolean(diagnosticLeakLive),
    diagnosticLeakV2: diagnosticLeakV2 == null ? null : Boolean(diagnosticLeakV2),
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
      : null
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
   * Runtime failures are captured as sanitized ledger rows when possible.
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
    const liveReplyText = extractLiveReplyText(conversation);
    const liveSideEffectCategory = extractLiveSideEffectCategory(conversation);
    const reconstructionInput = buildReconstructionInput(prospect, {
      organizationId: orgId,
      prospectId,
      needsHumanAttention: conversation?.humanAssist === true
    });

    let turnResult = null;
    let evaluationError = null;

    try {
      const text = String(messageText || "").trim();
      if (!text) {
        const malformed = new Error("SHADOW_MALFORMED_INPUT");
        malformed.code = "SHADOW_MALFORMED_INPUT";
        throw malformed;
      }

      turnResult = await processTurn({
        message: {
          id: inboundMessageId || null,
          providerMessageId: inboundMessageId || null,
          text
        },
        contextInput: reconstructionInput,
        options: {
          channel,
          flexible: options.flexible !== false,
          inboundMessageId: inboundMessageId || null,
          persistContext: Boolean(persistenceService),
          prospectClosed: Boolean(reconstructionInput.prospectClosed),
          env: options.env || process.env,
          // BR-112 — shadow must never request live execution.
          allowExecution: false
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
    const diagnosticLeakV2 = containsInternalDiagnostics(v2RenderedText);
    const diagnosticLeakLive = containsInternalDiagnostics(liveReplyText);
    const languageAgreement = languagesAgree(liveLanguage, v2Language);
    const v2SideEffectCategory = extractV2SideEffectCategory(
      turnResult?.authorization,
      turnResult?.structuredDecision
    );
    const v2AppointmentStatus =
      turnResult?.nextContext?.appointment?.status ||
      turnResult?.context?.appointment?.status ||
      null;
    const appointmentStateAgreement = resolveAppointmentStateAgreement({
      liveAppointmentStatus: reconstructionInput.appointment?.status || null,
      v2AppointmentStatus
    });
    const escalationRecommended = Boolean(
      turnResult?.structuredDecision?.decision?.shouldEscalate
    );

    const divergenceClassification = classifyDivergence({
      liveCeResponseIntent,
      liveLanguage,
      liveReplyText,
      v2InterpretedIntent,
      v2DecisionCode,
      v2Language,
      v2RenderedText,
      evaluationFailed: Boolean(evaluationError),
      languageAgreement,
      appointmentStateAgreement,
      liveSideEffectCategory,
      v2SideEffectCategory,
      liveHumanAssist: Boolean(
        conversation?.humanAssist || liveCeResponseIntent === "HUMAN_ASSIST"
      ),
      v2ShouldEscalate: escalationRecommended
    });

    const contextId =
      turnResult?.nextContext?._persistence?.id ||
      turnResult?.context?._persistence?.id ||
      null;

    const evaluationStatus = evaluationError
      ? "error"
      : turnResult?.persistence?.result?.idempotent
        ? "idempotent"
        : "completed";

    const rowPayload = {
      organization_id: orgId,
      prospect_id: prospectId,
      channel,
      context_id: contextId,
      inbound_message_id: inboundMessageId || null,
      live_ce_response_intent: liveCeResponseIntent,
      v2_interpreted_intent: v2InterpretedIntent,
      v2_decision_code: evaluationError ? null : v2DecisionCode,
      v2_confidence: v2Confidence,
      v2_proposed_side_effect: evaluationError ? "none" : v2SideEffectCategory,
      divergence_classification: divergenceClassification,
      language_agreement: languageAgreement,
      diagnostic_leak_check: !diagnosticLeakV2 && !diagnosticLeakLive,
      metadata: buildSanitizedMetadata({
        evaluationStatus,
        safeError: safeErrorCode(evaluationError),
        liveReason: conversation?.reason || null,
        liveReplied: conversation?.replied,
        liveSideEffectCategory,
        v2SideEffectCategory: evaluationError ? "none" : v2SideEffectCategory,
        appointmentStateAgreement,
        escalationRecommended,
        persistence: turnResult?.persistence || null,
        v2NextAction: v2DecisionCode,
        v2ReasonCodes: turnResult?.structuredDecision?.reasonCodes || null,
        diagnosticLeakLive,
        diagnosticLeakV2
      })
    };

    let row = null;
    try {
      row = await persistShadowRow(rowPayload);
    } catch (insertError) {
      // Insert failure must not escape into live CE. Return sanitized failure.
      return {
        skipped: false,
        reason: "SHADOW_INSERT_FAILED",
        row: null,
        turnResult,
        evaluationError: sanitizeFailureMessage(insertError),
        divergenceClassification: DIVERGENCE.SHADOW_ERROR,
        liveCeResponseIntent,
        authorizationDenied: true
      };
    }

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
  sanitizeFailureMessage,
  safeErrorCode
};
