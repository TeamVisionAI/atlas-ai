/**
 * BR-174 — provider router. Atlas never consumes provider-specific fields.
 */

const { interpretWithOpenAI } = require("./openaiSemanticAdapter");

const PROVIDERS = Object.freeze({
  OPENAI: "openai"
});

async function routeSemanticInterpretation({
  provider = PROVIDERS.OPENAI,
  inboundText,
  context,
  config,
  adapters = {}
} = {}) {
  const name = String(provider || PROVIDERS.OPENAI).toLowerCase();

  if (name === PROVIDERS.OPENAI) {
    const interpret = adapters.openai || interpretWithOpenAI;
    return interpret({ inboundText, context, config });
  }

  return {
    ok: false,
    reason: "UNSUPPORTED_PROVIDER",
    interpretation: null,
    usage: {
      provider: name,
      model: config?.model || null,
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0
    }
  };
}

module.exports = {
  PROVIDERS,
  routeSemanticInterpretation
};
