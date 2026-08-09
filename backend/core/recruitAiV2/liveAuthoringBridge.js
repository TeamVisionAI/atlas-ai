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
  resolveCanonicalProspectIdentity
} = require("../recruitingProspectBridge");
const {
  createSupabaseContextRepository,
  createMemoryContextRepository
} = require("./contextRepository");
const { resolvePostCreateOwnership } = require("./postCreateOwnership");

const STAGES = Object.freeze({
  ATTEMPTED: "recruit_ai_v2_live_authoring_attempted",
  USED: "recruit_ai_v2_live_authoring_used",
  FALLBACK: "recruit_ai_v2_live_authoring_fallback_to_legacy",
  SKIPPED: "recruit_ai_v2_live_authoring_skipped",
  OWNED_AFTER_MUTATION: "recruit_ai_v2_live_authoring_owned_after_mutation"
});

/** Extra wait after soft timeout so in-flight mission creates can finish ownership. */
const POST_TIMEOUT_GRACE_MS = 12000;

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
  let settled = null;
  const tracked = Promise.resolve(promise).then(
    (value) => {
      settled = { ok: true, value };
      return value;
    },
    (error) => {
      settled = { ok: false, error };
      throw error;
    }
  );

  return Promise.race([
    tracked.finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(code);
        error.code = code;
        // Attach late settle so callers can reclaim ownership after mission write.
        error.getLateResult = () => (settled?.ok ? settled.value : null);
        error.awaitTracked = () => tracked;
        reject(error);
      }, ms);
    })
  ]);
}

async function reclaimOwnershipAfterAuthoringLoss({
  error = null,
  v2Result = null,
  prospect = {},
  normalized = {},
  organizationId = null,
  actingUserId = null,
  allowExecution = false,
  persistence = null,
  findActiveAppointment = null,
  logStage = null
} = {}) {
  let late = v2Result;
  if (!late && typeof error?.awaitTracked === "function") {
    try {
      late = await Promise.race([
        error.awaitTracked(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("POST_TIMEOUT_GRACE_EXCEEDED")), POST_TIMEOUT_GRACE_MS);
        })
      ]);
    } catch {
      late = typeof error.getLateResult === "function" ? error.getLateResult() : null;
    }
  } else if (!late && typeof error?.getLateResult === "function") {
    late = error.getLateResult();
  }

  const proposedDate =
    late?.nextContext?.appointment?.proposedDate ||
    late?.nextContext?.appointment?.confirmedDate ||
    late?.context?.appointment?.proposedDate ||
    late?.context?.appointment?.confirmedDate ||
    null;
  const proposedTime =
    late?.nextContext?.appointment?.proposedTime ||
    late?.nextContext?.appointment?.confirmedTime ||
    late?.context?.appointment?.proposedTime ||
    late?.context?.appointment?.confirmedTime ||
    null;
  const language =
    late?.nextContext?.preferredLanguage ||
    late?.context?.preferredLanguage ||
    "spanish";
  const prospectId =
    late?.nextContext?.prospectId ||
    late?.context?.prospectId ||
    null;
  const agentId =
    actingUserId ||
    late?.nextContext?.agentId ||
    late?.context?.agentId ||
    prospect.owner_user_id ||
    null;

  const finder =
    findActiveAppointment ||
    (async (phone, orgId, agent) => {
      const {
        findActiveAppointmentForProspect
      } = require("../activeAppointmentResolver");
      return findActiveAppointmentForProspect(phone, orgId, agent);
    });

  const ownership = await resolvePostCreateOwnership({
    v2Result: late,
    findActiveAppointment: finder,
    prospectPhone: prospect.phone || normalized.phone || null,
    organizationId,
    prospectId,
    agentId,
    proposedDate,
    proposedTime,
    timezone: late?.nextContext?.timezone || "America/New_York",
    language,
    baseContext: late?.nextContext || late?.context || null
  });

  if (!ownership.owned || !ownership.replyText) {
    return null;
  }

  if (persistence && ownership.nextContext && organizationId) {
    try {
      await persistence.compareAndSaveContext({
        organizationId,
        prospectId:
          late?.nextContext?.prospectId ||
          late?.context?.prospectId ||
          prospect.id ||
          null,
        channel: "whatsapp",
        expectedVersion:
          late?.nextContext?._persistence?.contextVersion ||
          late?.context?._persistence?.contextVersion ||
          undefined,
        nextContext: ownership.nextContext,
        inboundMessageId: normalized.providerMessageId || null,
        decisionCode: "create_appointment",
        prospectPhone: prospect.phone || normalized.phone || null,
        legacyProspectId: prospect.id || null,
        ensureCore: true
      });
    } catch {
      // Soft: reply ownership still preferred even if durable reconcile races.
    }
  }

  if (typeof logStage === "function") {
    logStage(STAGES.OWNED_AFTER_MUTATION, {
      phone: normalized.phone || prospect.phone || null,
      organizationId,
      agentId: actingUserId,
      allowExecution,
      appointmentId: ownership.appointmentId,
      source: ownership.source,
      providerMessageId: normalized.providerMessageId || null
    });
  }

  return {
    eligible: true,
    authored: true,
    fallThrough: false,
    reason: null,
    replyText: ownership.replyText,
    v2Result: late || {
      execution: {
        success: true,
        appointmentId: ownership.appointmentId,
        performed: [
          {
            dateKey: ownership.dateKey,
            timeKey: ownership.timeKey
          }
        ]
      },
      nextContext: ownership.nextContext,
      responsePlan: { templateKey: "appointment_confirmed" }
    },
    actingUserId,
    organizationId,
    nextAction: "create_appointment",
    allowExecution,
    stage: STAGES.OWNED_AFTER_MUTATION,
    ownershipSource: ownership.source
  };
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

  // Implements BR-120 — durable context keys on core UUID; dual-load legacy-keyed actives.
  const prospectPhone = prospect.phone || normalized.phone || null;
  let canonicalProspectId = prospect.id || null;
  let legacyProspectId = prospect.id || null;
  try {
    const identity = await resolveCanonicalProspectIdentity({
      phone: prospectPhone,
      organizationId,
      displayName: prospect.name || null,
      legacyProspectId: prospect.id || null,
      ensureCore: true
    });
    if (identity.ok && identity.coreProspectId) {
      canonicalProspectId = identity.coreProspectId;
    }
    if (identity.legacyProspectId) {
      legacyProspectId = identity.legacyProspectId;
    }
    // Soft: authoring can continue on unresolved; persistence dual-load still helps.
    // Hard mismatch/ambiguity already encoded in identity.reasonCode — still prefer legacy.
  } catch {
    // Fail soft to legacy id — persistence dual-load still helps when phone is present.
  }

  const contextInput = buildReconstructionInput(prospect, {
    organizationId,
    prospectId: canonicalProspectId,
    prospectPhone,
    legacyProspectId,
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
          ensureCoreIdentity: true,
          env,
          actingUserId,
          agentId: actingUserId,
          organizationId,
          prospectPhone,
          legacyProspectId,
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
    const executionSuccess = Boolean(
      v2Result?.execution?.success && v2Result?.execution?.appointmentId
    );

    // After successful V2 create, V2 owns outbound + durable — never fall through to CE.
    if (executionSuccess) {
      let confirmedReply = replyText;
      if (!confirmedReply) {
        const { renderCustomerReply } = require("./responseRenderer");
        const performed = v2Result.execution.performed?.[0] || {};
        const lang =
          v2Result.nextContext?.preferredLanguage ||
          v2Result.context?.preferredLanguage ||
          "spanish";
        confirmedReply = extractAuthoredReplyText({
          rendered: renderCustomerReply({
            templateKey: "appointment_confirmed",
            language: lang,
            entities: {
              dateLabel:
                performed.dateKey ||
                v2Result.nextContext?.appointment?.confirmedDate ||
                null,
              requestedTime:
                performed.timeKey ||
                v2Result.nextContext?.appointment?.confirmedTime ||
                null
            }
          })
        });
      }

      if (typeof logStage === "function") {
        logStage(STAGES.USED, {
          phone: normalized.phone || prospect.phone || null,
          organizationId,
          agentId: actingUserId,
          nextAction,
          allowExecution,
          executionOwned: true,
          providerMessageId: normalized.providerMessageId || null
        });
      }

      return {
        eligible: true,
        authored: true,
        fallThrough: false,
        reason: null,
        replyText: confirmedReply,
        v2Result,
        actingUserId,
        organizationId,
        nextAction,
        allowExecution,
        stage: STAGES.USED
      };
    }

    if (!replyText) {
      const reclaimed = await reclaimOwnershipAfterAuthoringLoss({
        v2Result,
        prospect,
        normalized,
        organizationId,
        actingUserId,
        allowExecution,
        persistence,
        findActiveAppointment: dependencies.findActiveAppointmentForProspect,
        logStage
      });
      if (reclaimed) {
        return reclaimed;
      }

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

    const reclaimed = await reclaimOwnershipAfterAuthoringLoss({
      error,
      prospect,
      normalized,
      organizationId,
      actingUserId,
      allowExecution,
      persistence,
      findActiveAppointment: dependencies.findActiveAppointmentForProspect,
      logStage
    });
    if (reclaimed) {
      return reclaimed;
    }

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
  reclaimOwnershipAfterAuthoringLoss,
  createDefaultPersistenceService,
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect,
  resolveLiveAuthoringConfig: require("./liveAuthoringConfig").resolveLiveAuthoringConfig,
  isLiveAuthoringFlagEnabled: require("./liveAuthoringConfig").isLiveAuthoringFlagEnabled
};
