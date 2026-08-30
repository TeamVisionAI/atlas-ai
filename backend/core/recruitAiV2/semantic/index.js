/**
 * BR-174 — Recruit AI v2 semantic understanding surface (shadow foundation).
 */

const {
  SCHEMA_VERSION,
  createEmptySemanticInterpretation,
  validateSemanticInterpretation,
  stripProviderMetadata
} = require("./semanticInterpretationSchema");
const {
  resolveSemanticInterpreterConfig,
  isSemanticShadowEligible
} = require("./semanticInterpreterConfig");
const { observeSemanticInterpretation } = require("./semanticInterpreter");
const { projectLegacyInterpretation } = require("./legacySemanticProjection");
const { compareSemanticVsLegacy } = require("./semanticShadowCompare");
const { routeSemanticInterpretation, PROVIDERS } = require("./semanticProviderRouter");
const {
  interpretWithOpenAI,
  buildMinimalContextPayload,
  estimateCostUsd
} = require("./openaiSemanticAdapter");

module.exports = {
  SCHEMA_VERSION,
  PROVIDERS,
  createEmptySemanticInterpretation,
  validateSemanticInterpretation,
  stripProviderMetadata,
  resolveSemanticInterpreterConfig,
  isSemanticShadowEligible,
  observeSemanticInterpretation,
  projectLegacyInterpretation,
  compareSemanticVsLegacy,
  routeSemanticInterpretation,
  interpretWithOpenAI,
  buildMinimalContextPayload,
  estimateCostUsd
};
