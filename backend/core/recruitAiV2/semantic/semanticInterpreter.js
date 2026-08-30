/**
 * BR-174 — semantic observation entry. Shadow only.
 * The model interprets. Atlas persists. This module never writes context.
 */

const { logWhatsAppStage } = require("../../whatsappStructuredLogger");
const { isSemanticShadowEligible } = require("./semanticInterpreterConfig");
const { routeSemanticInterpretation } = require("./semanticProviderRouter");
const { projectLegacyInterpretation } = require("./legacySemanticProjection");
const { compareSemanticVsLegacy } = require("./semanticShadowCompare");
const { stripProviderMetadata } = require("./semanticInterpretationSchema");

const SEMANTIC_SHADOW_STAGE = "recruit_ai_v2_semantic_shadow_evaluated";

function summarizeFacts(facts) {
  if (!facts || typeof facts !== "object") {
    return null;
  }
  return {
    city: facts.city || null,
    state: facts.state || null,
    workAuthorization: facts.workAuthorization ?? null,
    workAuthorizationStatus: facts.workAuthorizationStatus || null
  };
}

/**
 * BR-174 — structured shadow telemetry only. Never includes inbound text or PII.
 */
function emitSemanticShadowTelemetry(observation, meta = {}) {
  try {
    logWhatsAppStage(SEMANTIC_SHADOW_STAGE, {
      organizationId: meta.organizationId || null,
      agentId: meta.actingUserId || null,
      shadow: true,
      applied: false,
      eligible: Boolean(observation?.eligible),
      reason: observation?.reason || null,
      provider: observation?.provider || null,
      model: observation?.model || null,
      latencyMs: observation?.latencyMs ?? null,
      promptTokens: observation?.tokenUsage?.promptTokens ?? null,
      completionTokens: observation?.tokenUsage?.completionTokens ?? null,
      totalTokens: observation?.tokenUsage?.totalTokens ?? null,
      estimatedCostUsd: observation?.estimatedCostUsd ?? null,
      confidence: observation?.confidence ?? null,
      semanticIntent: observation?.semantic?.intent || null,
      legacyIntent: observation?.legacy?.intent || null,
      semanticFacts: summarizeFacts(observation?.semantic?.facts),
      legacyFacts: summarizeFacts(observation?.legacy?.facts),
      disagreementCount: observation?.comparison?.disagreementCount ?? null,
      agree: observation?.comparison?.agree ?? null,
      disagreements: observation?.comparison?.disagreements || null,
      providerOk: observation?.providerOk ?? null,
      providerReason: observation?.providerReason || null,
      timedOut: observation?.reason === "PROVIDER_TIMEOUT" || observation?.providerReason === "PROVIDER_TIMEOUT",
      invalidJson:
        observation?.reason === "INVALID_SEMANTIC_JSON" ||
        observation?.providerReason === "INVALID_SEMANTIC_JSON"
    });
  } catch {
    // Observability must never break the authored turn.
  }
}

function resolveInboundText(message) {
  if (message == null) {
    return "";
  }
  if (typeof message === "string") {
    return message;
  }
  return String(message.text || message.body || "");
}

function buildObservation({
  eligible,
  reason,
  config,
  providerResult = null,
  comparison = null,
  legacyProjection = null
}) {
  return {
    shadow: true,
    applied: false,
    eligible,
    reason,
    provider: providerResult?.usage?.provider || config?.provider || null,
    model: providerResult?.usage?.model || config?.model || null,
    latencyMs: providerResult?.usage?.latencyMs || 0,
    tokenUsage: providerResult?.usage
      ? {
          promptTokens: providerResult.usage.promptTokens,
          completionTokens: providerResult.usage.completionTokens,
          totalTokens: providerResult.usage.totalTokens
        }
      : null,
    estimatedCostUsd: providerResult?.usage?.estimatedCostUsd ?? null,
    confidence: providerResult?.interpretation?.confidence ?? null,
    comparison,
    semantic: providerResult?.interpretation
      ? stripProviderMetadata(providerResult.interpretation)
      : null,
    legacy: legacyProjection,
    providerOk: Boolean(providerResult?.ok),
    providerReason: providerResult?.reason || null
  };
}

/**
 * Observe semantic meaning without mutating interpretation, context, or decisions.
 */
async function observeSemanticInterpretation({
  message,
  context,
  legacyInterpretation,
  options = {}
} = {}) {
  const env = options.env || process.env;
  const organizationId = options.organizationId || context?.organizationId || null;
  const actingUserId = options.actingUserId || null;
  const gate = isSemanticShadowEligible({
    organizationId,
    actingUserId,
    env
  });
  const telemetryMeta = { organizationId, actingUserId };

  if (!gate.eligible) {
    const skipped = buildObservation({
      eligible: false,
      reason: gate.reason,
      config: gate.config
    });
    if (gate.config.shadowEnabled) {
      emitSemanticShadowTelemetry(skipped, telemetryMeta);
    }
    return skipped;
  }

  const inboundText = resolveInboundText(message);
  const legacyProjection = projectLegacyInterpretation(legacyInterpretation, context);

  let providerResult;
  try {
    providerResult = await routeSemanticInterpretation({
      provider: gate.config.provider,
      inboundText,
      context,
      config: gate.config,
      adapters: options.semanticAdapters || {}
    });
  } catch {
    const failed = buildObservation({
      eligible: true,
      reason: "PROVIDER_FAILURE",
      config: gate.config,
      legacyProjection,
      providerResult: {
        ok: false,
        reason: "PROVIDER_FAILURE",
        interpretation: null,
        usage: null
      }
    });
    emitSemanticShadowTelemetry(failed, telemetryMeta);
    return failed;
  }

  if (!providerResult?.ok || !providerResult.interpretation) {
    const invalid = buildObservation({
      eligible: true,
      reason: providerResult?.reason || "INVALID_SEMANTIC_JSON",
      config: gate.config,
      providerResult,
      legacyProjection
    });
    emitSemanticShadowTelemetry(invalid, telemetryMeta);
    return invalid;
  }

  const comparison = compareSemanticVsLegacy(legacyProjection, providerResult.interpretation);
  const observed = buildObservation({
    eligible: true,
    reason: null,
    config: gate.config,
    providerResult,
    comparison,
    legacyProjection
  });
  emitSemanticShadowTelemetry(observed, telemetryMeta);
  return observed;
}

module.exports = {
  SEMANTIC_SHADOW_STAGE,
  observeSemanticInterpretation,
  emitSemanticShadowTelemetry,
  summarizeFacts
};
