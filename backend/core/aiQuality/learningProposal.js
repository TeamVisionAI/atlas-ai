/**
 * BR-198 — deterministic learning proposals. Review-safe fields only.
 * Does not call a model, does not store chain-of-thought.
 */

const {
  SIGNAL_TYPES,
  LEARNING_ACTIONS,
  HIDDEN_REASONING_KEYS,
  PROPOSAL_STATUSES,
  EVIDENCE_STATUS
} = require("./constants");
const { classifyRisk } = require("./riskPolicy");
const { summarizeFacts } = require("./regressionSpec");
const { assessEvidenceCompleteness, reportedConfidence } = require("./evidenceCompleteness");

const CATALOG = Object.freeze({
  [SIGNAL_TYPES.REPEATED_QUESTION]: {
    problem_summary: "Atlas asked a qualification question after that fact was already known.",
    likely_root_cause: "Pending-question matcher did not persist or honor the answered fact.",
    expected_behavior: "Persist the fact and advance to the next missing qualification step.",
    proposed_regression: "Known fact + inbound acknowledgement must not re-ask the same question.",
    forbidden_behavior: ["re-ask the answered fact", "immediate HUMAN_REQUIRED after a valid yes/no"],
    suggested_fix_area: "recruitAiV2.qualificationFacts / conversationContinuity",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.REPEATED_QUESTION_COMPLAINT]: {
    problem_summary: "Prospect complained that Atlas already asked the same question.",
    likely_root_cause: "Repeated-question detector or fact resume failed to advance state.",
    expected_behavior: "Acknowledge the complaint, keep the known fact, ask only the next missing step.",
    proposed_regression: "Complaint after a known fact resumes the next step without repeating.",
    forbidden_behavior: ["repeat the same question", "ignore the complaint"],
    suggested_fix_area: "recruitAiV2.responseRenderer / qualificationFacts",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.FAQ_INTERRUPT_MISAPPLIED]: {
    problem_summary: "An explicit job/opportunity question was not answered, or qualification restarted.",
    likely_root_cause: "FAQ interrupt did not resume the exact pending qualification step.",
    expected_behavior: "Answer the explicit job FAQ, then resume the pending question.",
    proposed_regression: "Explicit job question mid-qualification answers then resumes; first outbound stays lightweight.",
    forbidden_behavior: ["replace first outbound with the job FAQ", "restart qualification from the beginning"],
    suggested_fix_area: "recruitAiV2.responseRenderer / teamVisionWorkflowCopy",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.PREMATURE_HANDOFF]: {
    problem_summary: "A recoverable misunderstanding was escalated to HUMAN_REQUIRED.",
    likely_root_cause: "Clarification phrasing was treated as unknown instead of restating the pending question.",
    expected_behavior: "Restate the pending question once; do not hand off on the first recoverable clarify.",
    proposed_regression: "Clarification request restates the pending question and does not escalate.",
    forbidden_behavior: ["HUMAN_REQUIRED on first recoverable misunderstanding"],
    suggested_fix_area: "recruitAiV2.conversationContinuity / decisionEngine",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.OUTCOME_STATE_MISMATCH]: {
    problem_summary: "A recorded appointment outcome exists but a read model still treats the appointment as unresolved.",
    likely_root_cause: "A surface inferred pending from status, milestone, or agenda presence instead of the canonical outcome.",
    expected_behavior: "Once an outcome is recorded, every surface shows that outcome and stops prompting for a second decision.",
    proposed_regression: "FOLLOW_UP_NEEDED leaves Follow Up visible and removes the appointment from unresolved queues.",
    forbidden_behavior: ["treat follow-up needed as appointment pending", "second Outcome Required prompt"],
    suggested_fix_area: "appointment_execution / lifecycle_state",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.APPOINTMENT_CONFIRMATION_MISMATCH]: {
    problem_summary: "Atlas used confirmation language without a successful appointment create.",
    likely_root_cause: "Reply template fired before create succeeded, or the selected slot was not confirmable.",
    expected_behavior: "Create the appointment first; send confirmation only after persist succeeds.",
    proposed_regression: "SI after a confirm-ask creates one appointment; failure sends no confirmation language.",
    forbidden_behavior: ["claim confirmed before create", "duplicate appointments from duplicate inbound"],
    suggested_fix_area: "appointment_execution",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.SEMANTIC_OBJECTION_MISSED]: {
    problem_summary: "A high-confidence objection was not acted on.",
    likely_root_cause: "Legacy path continued qualification while semantic marked an objection.",
    expected_behavior: "Acknowledge the objection and follow the safety/qualification rule for that objection.",
    proposed_regression: "Named objection intent must not continue as a generic qualify question.",
    forbidden_behavior: ["ignore the objection", "continue qualification as if nothing was said"],
    suggested_fix_area: "compliance",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.AUTOMATED_OUTBOUND_ELIGIBILITY_BYPASS]: {
    problem_summary: "An automated WhatsApp send was attempted for a contact without positive Atlas lead provenance.",
    likely_root_cause: "An outbound path skipped the BR-200 eligibility guard or treated a label/connection as proof.",
    expected_behavior: "Suppress automated outbound, log the reason, and leave HUMAN reply available.",
    proposed_regression: "Personal or ambiguous inbound must not produce Atlas-generated WhatsApp.",
    forbidden_behavior: ["auto-ack media without provenance", "treat CLICK_TO_WHATSAPP labels as eligibility"],
    suggested_fix_area: "lead_eligibility",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  },
  [SIGNAL_TYPES.SEMANTIC_DISAGREEMENT]: {
    problem_summary: "Semantic and legacy interpretations disagreed on intent or facts.",
    likely_root_cause: "Legacy matcher missed a resolvable phrase or fact.",
    expected_behavior: "Human review decides the expected intent/facts; then lock a regression.",
    proposed_regression: "Same inbound + prior facts must produce the reviewed intent and next action.",
    forbidden_behavior: ["autonomous semantic APPLY", "silent fact overwrite"],
    suggested_fix_area: "recruitAiV2.interpreter",
    recommended_action: LEARNING_ACTIONS.APPROVE_REGRESSION
  }
});

const DEFAULT_CATALOG = Object.freeze({
  problem_summary: "Atlas produced a quality signal that needs human review.",
  likely_root_cause: "Structured signal fired; exact matcher or state transition needs a reviewed expectation.",
  expected_behavior: "Define expected intent, facts, next action, and forbidden behavior before changing code.",
  proposed_regression: "Replay the captured turns and assert the reviewed expectation.",
  forbidden_behavior: ["autonomous production behavior change"],
  suggested_fix_area: "aiQuality.review",
  recommended_action: LEARNING_ACTIONS.REQUEST_REVISION
});

function stripHiddenReasoning(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripHiddenReasoning(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (HIDDEN_REASONING_KEYS.includes(key)) {
      continue;
    }
    next[key] = stripHiddenReasoning(item);
  }
  return next;
}

function containsHiddenReasoning(value) {
  const text = JSON.stringify(value || {});
  return HIDDEN_REASONING_KEYS.some((key) => new RegExp(`"${key}"`, "i").test(text));
}

function catalogFor(signalType) {
  return CATALOG[signalType] || DEFAULT_CATALOG;
}

function scoreConfidence(qualityCase = {}, evidence = null) {
  const reported = reportedConfidence(qualityCase.confidence);
  if (reported != null) {
    return Math.max(0, Math.min(1, Math.round(reported * 100) / 100));
  }
  const status = evidence?.evidenceStatus || assessEvidenceCompleteness(qualityCase).evidenceStatus;
  if (status === EVIDENCE_STATUS.INSUFFICIENT) {
    return null;
  }
  const hasFacts = Boolean(
    qualityCase.knownFactsBefore && Object.values(qualityCase.knownFactsBefore).some((item) => item != null)
  );
  return hasFacts ? 0.72 : 0.58;
}

function buildLearningProposal(qualityCase = {}, overrides = {}) {
  const catalog = catalogFor(qualityCase.signalType);
  const suggestedFixArea = overrides.suggested_fix_area || catalog.suggested_fix_area;
  const riskLevel = classifyRisk(qualityCase, suggestedFixArea);
  const expectedFromReview = qualityCase.expectedBehavior || {};
  const evidence = assessEvidenceCompleteness(qualityCase);
  const insufficient = evidence.evidenceStatus === EVIDENCE_STATUS.INSUFFICIENT;
  const recommendedAction = insufficient
    ? LEARNING_ACTIONS.REQUEST_REVISION
    : overrides.recommended_action || catalog.recommended_action;

  const proposal = stripHiddenReasoning({
    problem_summary: overrides.problem_summary || catalog.problem_summary,
    likely_root_cause: overrides.likely_root_cause || catalog.likely_root_cause,
    expected_behavior:
      expectedFromReview.expectedIntent ||
      expectedFromReview.summary ||
      overrides.expected_behavior ||
      catalog.expected_behavior,
    proposed_regression: overrides.proposed_regression || catalog.proposed_regression,
    forbidden_behavior: []
      .concat(overrides.forbidden_behavior || expectedFromReview.forbiddenBehavior || catalog.forbidden_behavior)
      .filter(Boolean),
    suggested_fix_area: suggestedFixArea,
    risk_level: riskLevel,
    confidence: scoreConfidence(qualityCase, evidence),
    recommended_action: recommendedAction,
    evidence_status: evidence.evidenceStatus,
    evidence_completeness: evidence.evidenceCompleteness,
    evidence_factors: evidence.factors,
    regression_approvable: evidence.regressionApprovable,
    insufficient_evidence_code: evidence.insufficientEvidenceCode,
    insufficient_evidence_message: evidence.insufficientEvidenceMessage,
    signal_type: qualityCase.signalType || null,
    case_id: qualityCase.id || null,
    organization_id: qualityCase.organizationId || null,
    prior_known_facts: summarizeFacts(qualityCase.knownFactsBefore || {}),
    atlas_action: qualityCase.atlasAction || null,
    requires_implementation_authorization: true,
    preauthorization_allowed: false
  });

  if (containsHiddenReasoning(proposal)) {
    const error = new Error("HIDDEN_REASONING_FORBIDDEN");
    error.statusCode = 500;
    error.publicCode = "HIDDEN_REASONING_FORBIDDEN";
    throw error;
  }

  return proposal;
}

function proposalRecord({ qualityCase, actorUserId, overrides } = {}) {
  const proposal = buildLearningProposal(qualityCase, overrides);
  const now = new Date().toISOString();
  return {
    id: `learn-${qualityCase.id}`,
    organizationId: qualityCase.organizationId,
    caseId: qualityCase.id,
    status: PROPOSAL_STATUSES.GENERATED,
    proposal,
    riskLevel: proposal.risk_level,
    confidence: proposal.confidence,
    recommendedAction: proposal.recommended_action,
    evidenceStatus: proposal.evidence_status,
    generatedBy: "atlas_deterministic",
    createdByUserId: actorUserId || null,
    createdAt: now,
    updatedAt: now
  };
}

module.exports = {
  CATALOG,
  stripHiddenReasoning,
  containsHiddenReasoning,
  scoreConfidence,
  buildLearningProposal,
  proposalRecord
};
