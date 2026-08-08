/**
 * Recruit AI v2 — live WhatsApp conversation authoring bridge (BR-114).
 *
 * Earliest safe canary intercept (communicationHub):
 * - Eligible one-user turns: processRecruitAiV2Turn authors customer reply
 * - Canonical outbound remains communicationHub → sendAndPersistWhatsAppMessage
 * - Legacy CE is skipped for successful v2 authoring (including clarify_once)
 * - Technical failure / empty / unsafe text → fall through to legacy CE once
 *
 * Does NOT send WhatsApp itself.
 * Does NOT authorize mutations (BR-111). allowExecution only when BR-112 live
 * execution path is also enabled (independent of authoring).
 *
 * Implements BR-114 / BR-049 / BR-081 / BR-107 / BR-108.
 */

const { processRecruitAiV2Turn } = require("./orchestrator");
const { containsInternalDiagnostics } = require("./sanitize");
const {
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect,
  DEFAULT_TIMEOUT_MS
} = require("./liveAuthoringConfig");
const { resolveAllowExecutionForLiveTurn } = require("./liveExecutionPathConfig");
const { buildReconstructionInput } = require("./shadowEvaluationService");
const {
  createContextPersistenceService
} = require("./contextPersistenceService");
const {
  createSupabaseContextRepository,
  createMemoryContextRepository
} = require("./contextRepository");

const STAGES = Object.freeze({
  ATTEMPTED: "recruit_ai_v2_live_authoring_attempted",
  USED: "recruit_ai_v2_live_authoring_used",
  FALLBACK: "recruit_ai_v2_live_authoring_fallback_to_legacy",
  SKIPPED: "recruit_ai_v2_live_authoring_skipped"
});

function resolveSupabaseClient() {
  try {
    const { getServiceRoleClient } = require("../../services/backendDbService");
    return getServiceRoleClient();
  } catch {
    return null;
  }
}

function createDefaultPersistenceService() {
  const supabase = resolveSupabaseClient();
  return createContextPersistenceService({
    repository: supabase
      ? createSupabaseContextRepository(supabase)
      : createMemoryContextRepository()
  });
}

function withTimeout(promise, timeoutMs, code = "LIVE_AUTHORING_TIMEOUT") {
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

function extractAuthoredReplyText(v2Result) {
  const text = String(v2Result?.rendered?.text || "").trim();
  if (!text) {
    return "";
  }
  if (containsInternalDiagnostics(text)) {
    return "";
  }
  return text;
}

/**
 * Attempt v2 live authoring for one WhatsApp turn.
 *
 * @returns {{
 *   eligible: boolean,
 *   authored: boolean,
 *   fallThrough: boolean,
 *   reason: string|null,
 *   replyText: string|null,
 *   v2Result: object|null,
 *   actingUserId: string|null,
 *   organizationId: string|null,
 *   nextAction: string|null,
 *   allowExecution: boolean,
 *   stage: string
 * }}
 */
async function attemptLiveV2Authoring({
  normalized = {},
  prospect = {},
  env = process.env,
  dependencies = {},
  processTurn = processRecruitAiV2Turn,
  persistenceService = null,
  logStage = null
} = {}) {
  const organizationId = prospect.organization_id || prospect.organizationId || null;
  const actingUserId = resolveActingUserIdFromProspect(prospect);

  const eligibility = isEligibleForLiveAuthoring({
    organizationId,
    actingUserId,
    env,
    invocationSource: "live_whatsapp"
  });

  if (!eligibility.eligible) {
    return {
      eligible: false,
      authored: false,
      fallThrough: true,
      reason: eligibility.reason || "LIVE_AUTHORING_INELIGIBLE",
      replyText: null,
      v2Result: null,
      actingUserId,
      organizationId,
      nextAction: null,
      allowExecution: false,
      stage: STAGES.SKIPPED
    };
  }

  if (typeof logStage === "function") {
    logStage(STAGES.ATTEMPTED, {
      phone: normalized.phone || prospect.phone || null,
      organizationId,
      agentId: actingUserId,
      providerMessageId: normalized.providerMessageId || null
    });
  }

  // Authoring may be ON while execution stays OFF (BR-111 / BR-112 independent).
  const allowExecution = resolveAllowExecutionForLiveTurn({
    env,
    invocationSource: "live_ce"
  });

  const persistence =
    persistenceService ||
    dependencies.persistenceService ||
    createDefaultPersistenceService();

  const contextInput = buildReconstructionInput(prospect, {
    organizationId,
    prospectId: prospect.id || null,
    timezone: "America/New_York"
  });

  try {
    const v2Result = await withTimeout(
      processTurn({
        message: {
          id: normalized.providerMessageId || null,
          providerMessageId: normalized.providerMessageId || null,
          text: String(normalized.text || "").trim(),
          // Implements BR-118 — structured WhatsApp media type for dialogue guard.
          messageType: normalized.messageType || null
        },
        contextInput,
        persistenceService: persistence,
        options: {
          channel: "whatsapp",
          flexible: true,
          allowExecution,
          persistContext: true,
          env,
          actingUserId,
          agentId: actingUserId,
          organizationId,
          prospectPhone: prospect.phone || normalized.phone || null,
          inboundMessageId: normalized.providerMessageId || null,
          messageType: normalized.messageType || null,
          dependencies: {
            // Prefer injected getSlots (tests); production uses orchestrator default
            // → appointmentApplicationService.getSlots → Sprint 22 engine.
            ...(dependencies || {})
          }
        }
      }),
      eligibility.config.timeoutMs,
      "LIVE_AUTHORING_TIMEOUT"
    );

    const replyText = extractAuthoredReplyText(v2Result);
    const nextAction =
      v2Result?.structuredDecision?.decision?.nextAction || null;

    if (!replyText) {
      if (typeof logStage === "function") {
        logStage(STAGES.FALLBACK, {
          level: "warn",
          phone: normalized.phone || prospect.phone || null,
          organizationId,
          agentId: actingUserId,
          reason: "EMPTY_OR_UNSAFE_REPLY",
          nextAction
        });
      }
      return {
        eligible: true,
        authored: false,
        fallThrough: true,
        reason: "EMPTY_OR_UNSAFE_REPLY",
        replyText: null,
        v2Result,
        actingUserId,
        organizationId,
        nextAction,
        allowExecution,
        stage: STAGES.FALLBACK
      };
    }

    // Valid conversational decisions (incl. clarify_once) are SUCCESS — not fallback.
    if (typeof logStage === "function") {
      logStage(STAGES.USED, {
        phone: normalized.phone || prospect.phone || null,
        organizationId,
        agentId: actingUserId,
        nextAction,
        allowExecution,
        providerMessageId: normalized.providerMessageId || null
      });
    }

    return {
      eligible: true,
      authored: true,
      fallThrough: false,
      reason: null,
      replyText,
      v2Result,
      actingUserId,
      organizationId,
      nextAction,
      allowExecution,
      stage: STAGES.USED
    };
  } catch (error) {
    const reason =
      error?.code === "LIVE_AUTHORING_TIMEOUT"
        ? "LIVE_AUTHORING_TIMEOUT"
        : "LIVE_AUTHORING_TECHNICAL_FAILURE";

    if (typeof logStage === "function") {
      logStage(STAGES.FALLBACK, {
        level: "warn",
        phone: normalized.phone || prospect.phone || null,
        organizationId,
        agentId: actingUserId,
        reason,
        error: String(error?.message || error).slice(0, 200)
      });
    }

    return {
      eligible: true,
      authored: false,
      fallThrough: true,
      reason,
      replyText: null,
      v2Result: null,
      actingUserId,
      organizationId,
      nextAction: null,
      allowExecution,
      stage: STAGES.FALLBACK
    };
  }
}

module.exports = {
  STAGES,
  attemptLiveV2Authoring,
  extractAuthoredReplyText,
  withTimeout,
  createDefaultPersistenceService,
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect,
  resolveLiveAuthoringConfig: require("./liveAuthoringConfig").resolveLiveAuthoringConfig,
  isLiveAuthoringFlagEnabled: require("./liveAuthoringConfig").isLiveAuthoringFlagEnabled
};
