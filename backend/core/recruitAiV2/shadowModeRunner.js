/**
 * Recruit AI v2 — production shadow-mode runner.
 *
 * Live CE remains authoritative. Shadow runs asynchronously after the live turn
 * and must never delay or interrupt customer-visible responses.
 *
 * Performance:
 * - fire-and-forget via setImmediate
 * - single attempt (no retry storm)
 * - bounded timeout (default 5000ms, max 15000ms)
 *
 * Implements BR-081 Phase 3.
 */

const { logWhatsAppStage } = require("../whatsappStructuredLogger");
const { resolveProspectPreferredLanguage } = require("../prospectLanguage");
const {
  isEligibleForShadowEvaluation,
  resolveShadowConfig,
  DEFAULT_TIMEOUT_MS
} = require("./shadowConfig");
const { createContextPersistenceService } = require("./contextPersistenceService");
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
  sanitizeFailureMessage
} = require("./shadowEvaluationService");

let cachedService = null;
let cachedServiceKey = null;

function resolveSupabaseClient() {
  try {
    const { getServiceRoleClient } = require("../../services/backendDbService");
    return getServiceRoleClient();
  } catch {
    return null;
  }
}

function withTimeout(promise, timeoutMs, code = "SHADOW_EVALUATION_TIMEOUT") {
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

/**
 * Build shadow service (Supabase when available; memory for tests/injection).
 */
function getOrCreateShadowEvaluationService({
  shadowRepository = null,
  contextRepository = null,
  persistenceService = null,
  forceNew = false
} = {}) {
  if (shadowRepository || contextRepository || persistenceService) {
    const contextRepo = contextRepository || createMemoryContextRepository();
    const persist =
      persistenceService ||
      createContextPersistenceService({ repository: contextRepo });
    const shadowRepo =
      shadowRepository || createMemoryShadowEvaluationRepository();
    return createShadowEvaluationService({
      repository: shadowRepo,
      persistenceService: persist
    });
  }

  const supabase = resolveSupabaseClient();
  const key = supabase ? "supabase" : "memory-fallback";

  if (!forceNew && cachedService && cachedServiceKey === key) {
    return cachedService;
  }

  if (supabase) {
    cachedService = createShadowEvaluationService({
      repository: createSupabaseShadowEvaluationRepository(supabase),
      persistenceService: createContextPersistenceService({
        repository: createSupabaseContextRepository(supabase)
      })
    });
  } else {
    cachedService = createShadowEvaluationService({
      repository: createMemoryShadowEvaluationRepository(),
      persistenceService: createContextPersistenceService({
        repository: createMemoryContextRepository()
      })
    });
  }

  cachedServiceKey = key;
  return cachedService;
}

function resetShadowEvaluationServiceCache() {
  cachedService = null;
  cachedServiceKey = null;
}

/**
 * Execute shadow evaluation (tests / scheduled worker).
 * Never throws for runtime evaluation failures. No retries.
 */
async function runRecruitAiV2ShadowEvaluation(input = {}, deps = {}) {
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
    inboundMessageId ||
    inbound?.providerMessageId ||
    null;

  const eligibility = isEligibleForShadowEvaluation({
    organizationId: orgId,
    prospectId,
    inboundMessageId: providerMessageId,
    env
  });

  if (!eligibility.eligible) {
    return {
      scheduled: false,
      skipped: true,
      reason: eligibility.reason,
      config: eligibility.config
    };
  }

  const service = deps.service || getOrCreateShadowEvaluationService(deps);
  const timeoutMs =
    deps.timeoutMs ||
    eligibility.config.timeoutMs ||
    resolveShadowConfig(env).timeoutMs ||
    DEFAULT_TIMEOUT_MS;

  try {
    const result = await withTimeout(
      service.evaluateShadowTurn({
        prospect,
        organizationId: orgId,
        inboundMessageId: providerMessageId,
        messageText:
          messageText != null
            ? messageText
            : inbound?.body || inbound?.text || "",
        channel,
        conversation: conversation || {},
        language: resolveProspectPreferredLanguage(prospect || {}),
        options: {
          env,
          flexible: true
        }
      }),
      timeoutMs
    );

    logWhatsAppStage("recruit_ai_v2_shadow_evaluated", {
      organizationId: orgId,
      prospectId,
      providerMessageId,
      divergence: result.divergenceClassification || null,
      skipped: Boolean(result.skipped),
      reason: result.reason || null,
      timeoutMs
    });

    return {
      scheduled: false,
      skipped: Boolean(result.skipped),
      reason: result.reason,
      config: eligibility.config,
      timeoutMs,
      retries: 0,
      result
    };
  } catch (error) {
    logWhatsAppStage("recruit_ai_v2_shadow_failed", {
      level: "warn",
      organizationId: orgId,
      prospectId,
      providerMessageId,
      error: sanitizeFailureMessage(error),
      timeoutMs,
      retries: 0
    });

    return {
      scheduled: false,
      skipped: false,
      reason:
        error?.code === "SHADOW_EVALUATION_TIMEOUT"
          ? "SHADOW_EVALUATION_TIMEOUT"
          : "SHADOW_RUNTIME_ERROR",
      config: eligibility.config,
      timeoutMs,
      retries: 0,
      error: sanitizeFailureMessage(error)
    };
  }
}

/**
 * Fire-and-forget shadow evaluation after the live turn completes.
 * Phase 3B: delegates to post-live advisory so continuous capture can run
 * on unsampled turns without double-advancing context on sampled turns.
 */
function scheduleRecruitAiV2ShadowEvaluation(input = {}, deps = {}) {
  const {
    scheduleRecruitAiV2PostLiveAdvisory
  } = require("./advisoryTurnRunner");
  return scheduleRecruitAiV2PostLiveAdvisory(input, deps);
}

module.exports = {
  scheduleRecruitAiV2ShadowEvaluation,
  runRecruitAiV2ShadowEvaluation,
  getOrCreateShadowEvaluationService,
  resetShadowEvaluationServiceCache,
  withTimeout,
  DEFAULT_TIMEOUT_MS
};
