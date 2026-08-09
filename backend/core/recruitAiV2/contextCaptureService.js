/**
 * Recruit AI v2 — continuous context capture (Phase 3B).
 * Lightweight interpret → decide-for-patch → persist. No render, no shadow row,
 * no customer-facing side effects.
 *
 * Ordering: runs after live CE + BR-080 (post-live authoritative snapshot).
 */

const { isMetaReviewScope } = require("./contextPersistenceService");
const {
  computeContextOnlyTurn,
  buildCaptureDiagnostic
} = require("./contextTurnUpdate");
const { buildReconstructionInput } = require("./shadowEvaluationService");
const { resolveProspectPreferredLanguage } = require("../prospectLanguage");

function createContextCaptureService({ persistenceService } = {}) {
  if (!persistenceService) {
    throw new Error("persistenceService is required for context capture");
  }

  /**
   * Capture/update durable context for one inbound turn.
   * Idempotent on inbound_message_id via compareAndSaveContext.
   * At most one optimistic conflict retry.
   */
  async function captureContextTurn({
    prospect,
    organizationId,
    inboundMessageId,
    messageText,
    channel = "whatsapp",
    options = {},
    retried = false
  } = {}) {
    const orgId = organizationId || prospect?.organization_id || null;
    const prospectId = prospect?.id || null;
    const prospectPhone = prospect?.phone || null;

    if (!orgId || !prospectId) {
      const error = new Error("organizationId and prospectId are required");
      error.code = "CONTEXT_CAPTURE_SCOPE_REQUIRED";
      throw error;
    }

    if (isMetaReviewScope({ organizationId: orgId, prospectId, channel })) {
      return { skipped: true, reason: "META_REVIEW_ISOLATED", persistence: null };
    }

    const text = String(messageText || "").trim();
    if (!text || !inboundMessageId) {
      return { skipped: true, reason: "INVALID_INBOUND", persistence: null };
    }

    const reconstructionInput = buildReconstructionInput(prospect, {
      organizationId: orgId,
      prospectId,
      prospectPhone,
      legacyProspectId: prospectId
    });

    if (reconstructionInput.prospectClosed) {
      return { skipped: true, reason: "PROSPECT_CLOSED", persistence: null };
    }

    const loadedOrRebuilt = await persistenceService.loadOrReconstruct({
      organizationId: orgId,
      prospectId,
      channel,
      reconstructionInput,
      prospectPhone,
      legacyProspectId: prospectId,
      ensureCore: false
    });

    const startedAt = Date.now();
    const computed = computeContextOnlyTurn({
      message: {
        id: inboundMessageId,
        providerMessageId: inboundMessageId,
        text
      },
      context: loadedOrRebuilt.context,
      options: {
        flexible: options.flexible !== false,
        channel
      }
    });

    const diagnostic = buildCaptureDiagnostic({
      inboundMessageId,
      interpretation: computed.interpretation,
      decisionCode: computed.decisionCode,
      nextContext: computed.nextContext,
      elapsedMs: Date.now() - startedAt,
      requiresClarification: computed.interpretation?.requiresClarification
    });
    diagnostic.reasonCodes = Array.isArray(
      computed.structuredDecision?.reasonCodes
    )
      ? computed.structuredDecision.reasonCodes.filter(
          (code) => typeof code === "string" && code.length < 80
        )
      : [];

    try {
      // Implements BR-120 — dual-load legacy-keyed row; new creates prefer core via phone.
      const persistence = await persistenceService.compareAndSaveContext({
        organizationId: orgId,
        prospectId,
        channel,
        expectedVersion: loadedOrRebuilt.context?._persistence?.contextVersion,
        nextContext: computed.nextContext,
        inboundMessageId,
        decisionCode: computed.decisionCode,
        prospectClosed: false,
        prospectPhone,
        legacyProspectId: prospectId,
        ensureCore: Boolean(prospectPhone)
      });

      return {
        skipped: false,
        reason: null,
        interpretation: computed.interpretation,
        decisionCode: computed.decisionCode,
        diagnostic,
        persistence,
        source: loadedOrRebuilt.source,
        preferredLanguage:
          computed.nextContext.preferredLanguage ||
          resolveProspectPreferredLanguage(prospect || {})
      };
    } catch (error) {
      if (
        !retried &&
        (error.code === "CONTEXT_VERSION_CONFLICT" ||
          error.code === "CONTEXT_UNIQUE_VIOLATION")
      ) {
        return captureContextTurn({
          prospect,
          organizationId: orgId,
          inboundMessageId,
          messageText: text,
          channel,
          options,
          retried: true
        });
      }
      throw error;
    }
  }

  return { captureContextTurn };
}

module.exports = {
  createContextCaptureService
};
