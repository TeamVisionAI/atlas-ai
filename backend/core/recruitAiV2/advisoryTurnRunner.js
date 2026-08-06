/**
 * Recruit AI v2 — post-live advisory coordinator (Phase 3B).
 *
 * After live CE + BR-080:
 *   1) continuous context capture when eligible (target 100%)
 *   2) shadow evaluation when eligible (target 10%)
 *
 * Coordination: a sampled shadow turn advances context exactly once via the
 * shadow evaluation path (which persists context). Unsampled turns use the
 * lightweight context-only path. Never double-advance the same inbound_message_id.
 *
 * Ordering: post-live authoritative snapshot (after CE commits + BR-080).
 * Async/non-blocking; failures never interrupt the live path.
 */

const { logWhatsAppStage } = require("../whatsappStructuredLogger");
const { resolveProspectPreferredLanguage } = require("../prospectLanguage");
const { isEligibleForShadowEvaluation, DEFAULT_TIMEOUT_MS } = require("./shadowConfig");
const {
  isEligibleForContextCapture,
  DEFAULT_CAPTURE_TIMEOUT_MS
} = require("./contextCaptureConfig");
const { isMetaReviewScope, createContextPersistenceService } = require("./contextPersistenceService");
const {
  createSupabaseContextRepository,
  createMemoryContextRepository
} = require("./contextRepository");
const {
  createSupabaseShadowEvaluationRepository,
  createMemoryShadowEvaluationRepository
} = require("./shadowEvaluationRepository");
const {
  createShadowEvaluationService,
  sanitizeFailureMessage,
  buildReconstructionInput
} = require("./shadowEvaluationService");
const { createContextCaptureService } = require("./contextCaptureService");

let cachedBundle = null;
let cachedKey = null;

function resolveSupabaseClient() {
  try {
    const { getServiceRoleClient } = require("../../services/backendDbService");
    return getServiceRoleClient();
  } catch {
    return null;
  }
}

function withTimeout(promise, timeoutMs, code) {
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(code);
        error.code = code;
        reject(error);
      }, ms);
    })
  ]);
}

function getOrCreateAdvisoryServices(deps = {}) {
  // Backward-compatible: shadowModeRunner tests inject `service` as shadowService.
  const injectedShadow = deps.shadowService || deps.service || null;

  if (
    injectedShadow ||
    deps.captureService ||
    deps.persistenceService ||
    deps.services
  ) {
    if (deps.services) {
      return deps.services;
    }
    const contextRepo = deps.contextRepository || createMemoryContextRepository();
    const persistenceService =
      deps.persistenceService ||
      createContextPersistenceService({ repository: contextRepo });
    const shadowRepo =
      deps.shadowRepository || createMemoryShadowEvaluationRepository();
    return {
      persistenceService,
      captureService:
        deps.captureService ||
        createContextCaptureService({ persistenceService }),
      shadowService:
        injectedShadow ||
        createShadowEvaluationService({
          repository: shadowRepo,
          persistenceService
        }),
      shadowRepo
    };
  }

  const supabase = resolveSupabaseClient();
  const key = supabase ? "supabase" : "memory-fallback";
  if (cachedBundle && cachedKey === key && !deps.forceNew) {
    return cachedBundle;
  }

  const persistenceService = createContextPersistenceService({
    repository: supabase
      ? createSupabaseContextRepository(supabase)
      : createMemoryContextRepository()
  });
  const shadowRepo = supabase
    ? createSupabaseShadowEvaluationRepository(supabase)
    : createMemoryShadowEvaluationRepository();

  cachedBundle = {
    persistenceService,
    captureService: createContextCaptureService({ persistenceService }),
    shadowService: createShadowEvaluationService({
      repository: shadowRepo,
      persistenceService
    }),
    shadowRepo
  };
  cachedKey = key;
  return cachedBundle;
}

function resetAdvisoryServiceCache() {
  cachedBundle = null;
  cachedKey = null;
}

function isProspectClosed(prospect) {
  const step = String(prospect?.current_step || "").toUpperCase();
  return step.includes("DO NOT CONTACT") || step === "CLOSED";
}

/**
 * Run capture and/or shadow for one post-live inbound turn.
 * Exactly one context advancement path per inbound_message_id.
 */
async function runRecruitAiV2PostLiveAdvisory(input = {}, deps = {}) {
  const {
    prospect,
    organizationId = null,
    inbound = null,
    conversation = null,
    env = process.env,
    messageText = null,
    inboundMessageId = null,
    channel = "whatsapp"
  } = input;

  const orgId = organizationId || prospect?.organization_id || null;
  const prospectId = prospect?.id || null;
  const providerMessageId =
    inboundMessageId || inbound?.providerMessageId || null;
  const text =
    messageText != null ? messageText : inbound?.body || inbound?.text || "";
  const closed = isProspectClosed(prospect);

  if (
    isMetaReviewScope({
      organizationId: orgId,
      prospectId,
      channel
    })
  ) {
    return {
      skipped: true,
      reason: "META_REVIEW_ISOLATED",
      contextCapture: null,
      shadow: null
    };
  }

  const captureEligibility = isEligibleForContextCapture({
    organizationId: orgId,
    prospectId,
    inboundMessageId: providerMessageId,
    channel,
    prospectClosed: closed,
    env
  });

  const shadowEligibility = isEligibleForShadowEvaluation({
    organizationId: orgId,
    prospectId,
    inboundMessageId: providerMessageId,
    env
  });

  if (!captureEligibility.eligible && !shadowEligibility.eligible) {
    return {
      skipped: true,
      reason: "ADVISORY_NOT_ELIGIBLE",
      captureReason: captureEligibility.reason,
      shadowReason: shadowEligibility.reason,
      contextCapture: null,
      shadow: null
    };
  }

  const services = deps.services || getOrCreateAdvisoryServices(deps);
  const startedAt = Date.now();

  // Sampled shadow path: full evaluate + context persist once (no separate capture).
  if (shadowEligibility.eligible) {
    const timeoutMs =
      deps.timeoutMs ||
      shadowEligibility.config.timeoutMs ||
      DEFAULT_TIMEOUT_MS;

    try {
      const shadowResult = await withTimeout(
        services.shadowService.evaluateShadowTurn({
          prospect,
          organizationId: orgId,
          inboundMessageId: providerMessageId,
          messageText: text,
          channel,
          conversation: conversation || {},
          language: resolveProspectPreferredLanguage(prospect || {}),
          options: { env, flexible: true }
        }),
        timeoutMs,
        "SHADOW_EVALUATION_TIMEOUT"
      );

      logWhatsAppStage("recruit_ai_v2_shadow_evaluated", {
        organizationId: orgId,
        prospectId,
        providerMessageId,
        divergence: shadowResult.divergenceClassification || null,
        contextAdvanced: Boolean(shadowResult.turnResult?.persistence?.result),
        mode: "shadow_with_context",
        elapsedMs: Date.now() - startedAt
      });

      return {
        skipped: false,
        reason: null,
        mode: "shadow",
        contextCapture: {
          skipped: true,
          reason: "DEFERRED_TO_SHADOW",
          // Context advanced inside shadow evaluation when persist succeeded.
          advancedByShadow: true
        },
        shadow: shadowResult,
        elapsedMs: Date.now() - startedAt,
        retries: 0
      };
    } catch (error) {
      logWhatsAppStage("recruit_ai_v2_shadow_failed", {
        level: "warn",
        organizationId: orgId,
        prospectId,
        providerMessageId,
        error: sanitizeFailureMessage(error),
        retries: 0
      });

      // Fall back to context-only capture so 100% continuity is preserved.
      if (captureEligibility.eligible) {
        try {
          const captureResult = await withTimeout(
            services.captureService.captureContextTurn({
              prospect,
              organizationId: orgId,
              inboundMessageId: providerMessageId,
              messageText: text,
              channel,
              options: { flexible: true }
            }),
            captureEligibility.config.timeoutMs || DEFAULT_CAPTURE_TIMEOUT_MS,
            "CONTEXT_CAPTURE_TIMEOUT"
          );
          return {
            skipped: false,
            reason: "SHADOW_FAILED_CAPTURE_FALLBACK",
            mode: "capture_fallback",
            contextCapture: captureResult,
            shadow: { error: sanitizeFailureMessage(error) },
            elapsedMs: Date.now() - startedAt,
            retries: 0
          };
        } catch (captureError) {
          logWhatsAppStage("recruit_ai_v2_context_capture_failed", {
            level: "warn",
            organizationId: orgId,
            prospectId,
            providerMessageId,
            error: sanitizeFailureMessage(captureError)
          });
        }
      }

      return {
        skipped: false,
        reason: "SHADOW_RUNTIME_ERROR",
        mode: "shadow",
        contextCapture: null,
        shadow: { error: sanitizeFailureMessage(error) },
        elapsedMs: Date.now() - startedAt,
        retries: 0
      };
    }
  }

  // Unsampled: context capture only (no shadow row).
  if (captureEligibility.eligible) {
    const timeoutMs =
      deps.timeoutMs ||
      captureEligibility.config.timeoutMs ||
      DEFAULT_CAPTURE_TIMEOUT_MS;

    try {
      const captureResult = await withTimeout(
        services.captureService.captureContextTurn({
          prospect,
          organizationId: orgId,
          inboundMessageId: providerMessageId,
          messageText: text,
          channel,
          options: { flexible: true }
        }),
        timeoutMs,
        "CONTEXT_CAPTURE_TIMEOUT"
      );

      const diagnostic = captureResult.diagnostic || {};
      logWhatsAppStage("recruit_ai_v2_context_captured", {
        organizationId: orgId,
        prospectId,
        providerMessageId,
        skipped: Boolean(captureResult.skipped),
        reason: captureResult.reason || null,
        idempotent: Boolean(captureResult.persistence?.idempotent),
        elapsedMs: Date.now() - startedAt,
        // Sanitized capture-only audit (BR-082) — no raw message body / PII.
        intent: diagnostic.intent || null,
        confidence: diagnostic.confidence ?? null,
        messageLanguage: diagnostic.messageLanguage || null,
        preferredLanguage: diagnostic.preferredLanguage || null,
        stage: diagnostic.stage || null,
        clarification: Boolean(diagnostic.clarification),
        decisionCode: diagnostic.decisionCode || captureResult.decisionCode || null,
        reasonCodes: Array.isArray(diagnostic.reasonCodes)
          ? diagnostic.reasonCodes.slice(0, 8)
          : null,
        cityCertainty: diagnostic.cityCertainty || null,
        stateCertainty: diagnostic.stateCertainty || null
      });

      return {
        skipped: Boolean(captureResult.skipped),
        reason: captureResult.reason,
        mode: "capture_only",
        contextCapture: captureResult,
        shadow: {
          skipped: true,
          reason: shadowEligibility.reason || "SAMPLE_RATE_MISS"
        },
        elapsedMs: Date.now() - startedAt,
        retries: 0
      };
    } catch (error) {
      logWhatsAppStage("recruit_ai_v2_context_capture_failed", {
        level: "warn",
        organizationId: orgId,
        prospectId,
        providerMessageId,
        error: sanitizeFailureMessage(error),
        retries: 0
      });
      return {
        skipped: false,
        reason: "CONTEXT_CAPTURE_ERROR",
        mode: "capture_only",
        contextCapture: { error: sanitizeFailureMessage(error) },
        shadow: { skipped: true, reason: shadowEligibility.reason },
        elapsedMs: Date.now() - startedAt,
        retries: 0
      };
    }
  }

  return {
    skipped: true,
    reason: "ADVISORY_NOT_ELIGIBLE",
    contextCapture: null,
    shadow: null
  };
}

/**
 * Fire-and-forget post-live advisory (capture and/or shadow).
 */
function scheduleRecruitAiV2PostLiveAdvisory(input = {}, deps = {}) {
  const schedule =
    deps.schedule ||
    ((fn) => {
      setImmediate(fn);
    });

  try {
    const orgId = input.organizationId || input.prospect?.organization_id;
    const prospectId = input.prospect?.id;
    const providerMessageId =
      input.inboundMessageId || input.inbound?.providerMessageId || null;
    const env = input.env || process.env;
    const closed = isProspectClosed(input.prospect);

    const captureEligibility = isEligibleForContextCapture({
      organizationId: orgId,
      prospectId,
      inboundMessageId: providerMessageId,
      channel: input.channel || "whatsapp",
      prospectClosed: closed,
      env
    });
    const shadowEligibility = isEligibleForShadowEvaluation({
      organizationId: orgId,
      prospectId,
      inboundMessageId: providerMessageId,
      env
    });

    if (!captureEligibility.eligible && !shadowEligibility.eligible) {
      return {
        scheduled: false,
        skipped: true,
        reason: "ADVISORY_NOT_ELIGIBLE",
        captureReason: captureEligibility.reason,
        shadowReason: shadowEligibility.reason
      };
    }

    schedule(() =>
      runRecruitAiV2PostLiveAdvisory(input, deps).catch((error) => {
        logWhatsAppStage("recruit_ai_v2_advisory_failed", {
          level: "warn",
          error: sanitizeFailureMessage(error),
          retries: 0
        });
      })
    );

    return {
      scheduled: true,
      skipped: false,
      reason: null,
      willCapture: captureEligibility.eligible,
      willShadow: shadowEligibility.eligible,
      captureConfig: captureEligibility.config,
      shadowConfig: shadowEligibility.config,
      retries: 0
    };
  } catch (error) {
    logWhatsAppStage("recruit_ai_v2_advisory_schedule_failed", {
      level: "warn",
      error: sanitizeFailureMessage(error)
    });
    return {
      scheduled: false,
      skipped: true,
      reason: "ADVISORY_SCHEDULE_ERROR",
      error: sanitizeFailureMessage(error)
    };
  }
}

module.exports = {
  scheduleRecruitAiV2PostLiveAdvisory,
  runRecruitAiV2PostLiveAdvisory,
  getOrCreateAdvisoryServices,
  resetAdvisoryServiceCache,
  buildReconstructionInput
};
