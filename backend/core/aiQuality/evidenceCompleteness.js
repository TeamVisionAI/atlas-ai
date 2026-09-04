/**
 * BR-227 — review-safe evidence completeness. Separate from model confidence.
 * Does not store chain-of-thought or raw inbound bodies.
 */

const {
  EVIDENCE_STATUS,
  INSUFFICIENT_EVIDENCE_CODE,
  INSUFFICIENT_EVIDENCE_MESSAGE
} = require("./constants");

function hasCompactInterpretation(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Boolean(
    value.intent ||
      value.language ||
      value.confidence != null ||
      value.schedulingIntent ||
      value.safety ||
      (value.facts && Object.values(value.facts).some((item) => item != null))
  );
}

function hasKnownFacts(facts) {
  if (!facts || typeof facts !== "object") {
    return false;
  }
  return Object.values(facts).some((item) => item != null && item !== "");
}

function reportedConfidence(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function assessEvidenceCompleteness(qualityCase = {}) {
  const turns = qualityCase.conversationTurns || qualityCase.conversation_turns || [];
  const hasTurns = Array.isArray(turns) && turns.length > 0;
  const hasLegacy = hasCompactInterpretation(
    qualityCase.legacyInterpretation || qualityCase.legacy_interpretation
  );
  const hasSemantic = hasCompactInterpretation(
    qualityCase.semanticInterpretation || qualityCase.semantic_interpretation
  );
  const hasInterpretation = hasLegacy || hasSemantic;
  const hasFacts = hasKnownFacts(
    qualityCase.knownFactsBefore || qualityCase.known_facts_before
  );
  const hasAction = Boolean(qualityCase.atlasAction || qualityCase.atlas_action);
  const hasCorrelation = Boolean(
    qualityCase.inboundMessageId || qualityCase.inbound_message_id
  );
  const confidence = reportedConfidence(qualityCase.confidence);
  const confidenceMissingOrZero = confidence == null || confidence === 0;

  const factors = {
    hasTurns,
    hasLegacyInterpretation: hasLegacy,
    hasSemanticInterpretation: hasSemantic,
    hasKnownFacts: hasFacts,
    hasAtlasAction: hasAction,
    hasInboundCorrelation: hasCorrelation
  };
  const scored = [hasTurns, hasInterpretation, hasFacts, hasAction, hasCorrelation];
  const evidenceCompleteness = Math.round((scored.filter(Boolean).length / scored.length) * 100) / 100;

  let evidenceStatus = EVIDENCE_STATUS.PARTIAL;
  if (!hasTurns && !hasInterpretation && confidenceMissingOrZero) {
    evidenceStatus = EVIDENCE_STATUS.INSUFFICIENT;
  } else if (hasTurns && hasInterpretation && (hasFacts || hasAction)) {
    evidenceStatus = EVIDENCE_STATUS.SUFFICIENT;
  }

  return {
    evidenceStatus,
    evidenceCompleteness,
    regressionApprovable: evidenceStatus !== EVIDENCE_STATUS.INSUFFICIENT,
    factors,
    insufficientEvidenceCode:
      evidenceStatus === EVIDENCE_STATUS.INSUFFICIENT ? INSUFFICIENT_EVIDENCE_CODE : null,
    insufficientEvidenceMessage:
      evidenceStatus === EVIDENCE_STATUS.INSUFFICIENT ? INSUFFICIENT_EVIDENCE_MESSAGE : null
  };
}

module.exports = {
  hasCompactInterpretation,
  hasKnownFacts,
  reportedConfidence,
  assessEvidenceCompleteness
};
