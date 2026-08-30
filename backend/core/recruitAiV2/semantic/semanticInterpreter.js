/**
 * BR-174 — semantic observation entry. Shadow only.
 * The model interprets. Atlas persists. This module never writes context.
 */

const { isSemanticShadowEligible } = require("./semanticInterpreterConfig");
const { routeSemanticInterpretation } = require("./semanticProviderRouter");
const { projectLegacyInterpretation } = require("./legacySemanticProjection");
const { compareSemanticVsLegacy } = require("./semanticShadowCompare");
const { stripProviderMetadata } = require("./semanticInterpretationSchema");

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
  const gate = isSemanticShadowEligible({
    organizationId: options.organizationId || context?.organizationId || null,
    actingUserId: options.actingUserId || null,
    env
  });

  if (!gate.eligible) {
    return buildObservation({
      eligible: false,
      reason: gate.reason,
      config: gate.config
    });
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
    return buildObservation({
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
  }

  if (!providerResult?.ok || !providerResult.interpretation) {
    return buildObservation({
      eligible: true,
      reason: providerResult?.reason || "INVALID_SEMANTIC_JSON",
      config: gate.config,
      providerResult,
      legacyProjection
    });
  }

  const comparison = compareSemanticVsLegacy(legacyProjection, providerResult.interpretation);
  return buildObservation({
    eligible: true,
    reason: null,
    config: gate.config,
    providerResult,
    comparison,
    legacyProjection
  });
}

module.exports = {
  observeSemanticInterpretation
};
