/**
 * BR-198 — deterministic risk classification for learning proposals.
 * HIGH always requires explicit implementation authorization. No pre-auth.
 */

const { SIGNAL_TYPES, RISK_LEVELS } = require("./constants");

const HIGH_FIX_AREAS = Object.freeze([
  "lead_eligibility",
  "ownership_routing",
  "compliance",
  "financial_disclosures",
  "appointment_execution",
  "calendar_writes",
  "lifecycle_state",
  "tenant_isolation",
  "whatsapp_routing",
  "destructive_data"
]);

const HIGH_SIGNALS = Object.freeze([
  SIGNAL_TYPES.APPOINTMENT_CONFIRMATION_MISMATCH,
  SIGNAL_TYPES.UNANSWERED_ELIGIBLE_INBOUND,
  SIGNAL_TYPES.TAKEOVER_AFTER_ATLAS,
  SIGNAL_TYPES.AUTOMATED_OUTBOUND_ELIGIBILITY_BYPASS
]);

const MEDIUM_SIGNALS = Object.freeze([
  SIGNAL_TYPES.FAQ_INTERRUPT_MISAPPLIED,
  SIGNAL_TYPES.PREMATURE_HANDOFF,
  SIGNAL_TYPES.HUMAN_REQUIRED_THEN_QUALIFICATION,
  SIGNAL_TYPES.RESCHEDULE_NOT_ACTED,
  SIGNAL_TYPES.FACT_OSCILLATION,
  SIGNAL_TYPES.SEMANTIC_DISAGREEMENT,
  SIGNAL_TYPES.SEMANTIC_OBJECTION_MISSED
]);

const LOW_SIGNALS = Object.freeze([
  SIGNAL_TYPES.REPEATED_QUESTION,
  SIGNAL_TYPES.REPEATED_QUESTION_COMPLAINT,
  SIGNAL_TYPES.FRUSTRATION_MISUNDERSTANDING,
  SIGNAL_TYPES.SEMANTIC_LOW_CONFIDENCE,
  SIGNAL_TYPES.SEMANTIC_TIMEOUT,
  SIGNAL_TYPES.SEMANTIC_INVALID_JSON
]);

function hasComplianceMarker(qualityCase = {}) {
  const blob = JSON.stringify({
    semantic: qualityCase.semanticInterpretation || {},
    legacy: qualityCase.legacyInterpretation || {},
    label: qualityCase.label || ""
  }).toLowerCase();
  return /ssn|privacy|opt[_-]?out|compliance|disclosure|ownership|eligib|tenant isolation|whatsapp routing/.test(
    blob
  );
}

function classifyRisk(qualityCase = {}, suggestedFixArea = null) {
  const area = String(suggestedFixArea || "").toLowerCase();
  if (HIGH_FIX_AREAS.some((item) => area.includes(item.replace(/_/g, ""))) || HIGH_FIX_AREAS.includes(area)) {
    return RISK_LEVELS.HIGH;
  }
  if (HIGH_SIGNALS.includes(qualityCase.signalType) || hasComplianceMarker(qualityCase)) {
    return RISK_LEVELS.HIGH;
  }
  if (MEDIUM_SIGNALS.includes(qualityCase.signalType)) {
    return RISK_LEVELS.MEDIUM;
  }
  if (LOW_SIGNALS.includes(qualityCase.signalType)) {
    return RISK_LEVELS.LOW;
  }
  return RISK_LEVELS.MEDIUM;
}

function requiresImplementationAuthorization(riskLevel) {
  return true;
}

function allowsPreAuthorization(_riskLevel) {
  return false;
}

module.exports = {
  HIGH_FIX_AREAS,
  HIGH_SIGNALS,
  MEDIUM_SIGNALS,
  LOW_SIGNALS,
  classifyRisk,
  requiresImplementationAuthorization,
  allowsPreAuthorization
};
