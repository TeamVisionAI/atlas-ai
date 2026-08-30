/**
 * BR-175 — human review actions. Approval required before regression promotion.
 * Never mutates source code or tests.
 */

const {
  CASE_STATUSES,
  REVIEW_ACTIONS,
  AUDIT_ACTIONS,
  REGRESSION_STATUSES
} = require("./constants");
const { buildRegressionCandidate } = require("./regressionSpec");

const ACTION_STATUS = Object.freeze({
  [REVIEW_ACTIONS.MARK_SEMANTIC_CORRECT]: CASE_STATUSES.SEMANTIC_CORRECT,
  [REVIEW_ACTIONS.MARK_LEGACY_CORRECT]: CASE_STATUSES.LEGACY_CORRECT,
  [REVIEW_ACTIONS.BOTH_WRONG]: CASE_STATUSES.BOTH_WRONG,
  [REVIEW_ACTIONS.DEFINE_EXPECTED_BEHAVIOR]: CASE_STATUSES.EXPECTED_BEHAVIOR,
  [REVIEW_ACTIONS.CREATE_REGRESSION_CANDIDATE]: CASE_STATUSES.REGRESSION_CANDIDATE,
  [REVIEW_ACTIONS.IGNORE]: CASE_STATUSES.IGNORED
});

const ACTION_AUDIT = Object.freeze({
  [REVIEW_ACTIONS.MARK_SEMANTIC_CORRECT]: AUDIT_ACTIONS.CASE_REVIEWED,
  [REVIEW_ACTIONS.MARK_LEGACY_CORRECT]: AUDIT_ACTIONS.CASE_REVIEWED,
  [REVIEW_ACTIONS.BOTH_WRONG]: AUDIT_ACTIONS.CASE_REVIEWED,
  [REVIEW_ACTIONS.DEFINE_EXPECTED_BEHAVIOR]: AUDIT_ACTIONS.EXPECTED_BEHAVIOR_DEFINED,
  [REVIEW_ACTIONS.CREATE_REGRESSION_CANDIDATE]: AUDIT_ACTIONS.REGRESSION_PROMOTED,
  [REVIEW_ACTIONS.IGNORE]: AUDIT_ACTIONS.CASE_IGNORED
});

async function applyReviewAction({
  qualityCase,
  action,
  notes = null,
  expectedBehavior = {},
  reviewerUserId,
  store,
  sourceBr = "BR-175"
} = {}) {
  const status = ACTION_STATUS[action];
  if (!status) {
    const error = new Error("UNSUPPORTED_REVIEW_ACTION");
    error.statusCode = 400;
    error.publicCode = "UNSUPPORTED_REVIEW_ACTION";
    throw error;
  }
  if (!qualityCase) {
    const error = new Error("QUALITY_CASE_NOT_FOUND");
    error.statusCode = 404;
    error.publicCode = "QUALITY_CASE_NOT_FOUND";
    throw error;
  }

  let regression = null;
  let specBundle = null;
  if (action === REVIEW_ACTIONS.CREATE_REGRESSION_CANDIDATE) {
    specBundle = buildRegressionCandidate({
      qualityCase: {
        ...qualityCase,
        expectedBehavior: expectedBehavior || qualityCase.expectedBehavior
      },
      expectedBehavior: expectedBehavior || qualityCase.expectedBehavior || {},
      sourceBr
    });
    regression = await store.insertRegression({
      id: `reg-${qualityCase.id}`,
      organizationId: qualityCase.organizationId,
      caseId: qualityCase.id,
      status: REGRESSION_STATUSES.PROPOSED,
      spec: specBundle.spec,
      markdown: specBundle.markdown,
      createdByUserId: reviewerUserId,
      createdAt: new Date().toISOString(),
      mutatesSourceCode: false,
      mutatesTests: false
    });
  }

  const updated = await store.updateCase(qualityCase.id, {
    status,
    reviewerUserId,
    reviewNotes: notes || qualityCase.reviewNotes || null,
    expectedBehavior:
      expectedBehavior && Object.keys(expectedBehavior).length
        ? expectedBehavior
        : qualityCase.expectedBehavior,
    regressionCandidateId: regression?.id || qualityCase.regressionCandidateId || null
  });

  const auditEntry = {
    action: ACTION_AUDIT[action],
    organizationId: qualityCase.organizationId,
    userId: reviewerUserId,
    targetType: "ai_quality_case",
    targetId: qualityCase.id,
    result: "success",
    metadata: {
      reviewAction: action,
      nextStatus: status,
      regressionId: regression?.id || null,
      mutatesSourceCode: false
    }
  };
  if (typeof store.recordAudit === "function") {
    store.recordAudit(auditEntry);
  }

  return {
    qualityCase: updated,
    regression,
    spec: specBundle?.spec || null,
    markdown: specBundle?.markdown || null,
    auditEntry
  };
}

function computeOverview(cases = []) {
  const reviewed = cases.filter((row) =>
    [
      CASE_STATUSES.SEMANTIC_CORRECT,
      CASE_STATUSES.LEGACY_CORRECT,
      CASE_STATUSES.BOTH_WRONG
    ].includes(row.status)
  );
  const reviewedCount = reviewed.length || 0;
  const bySignal = {};
  const byEngine = {};
  const byTenant = {};
  const latencies = cases
    .map((row) => Number(row.latencyMs))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const row of cases) {
    bySignal[row.signalType] = (bySignal[row.signalType] || 0) + 1;
    byEngine[row.sourceEngine] = (byEngine[row.sourceEngine] || 0) + 1;
    byTenant[row.organizationId] = (byTenant[row.organizationId] || 0) + 1;
  }

  const percentile = (p) => {
    if (!latencies.length) {
      return null;
    }
    const index = Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1);
    return latencies[index];
  };

  return {
    casesDetected: cases.length,
    disagreementRate:
      cases.length === 0
        ? 0
        : cases.filter((row) => String(row.signalType).includes("DISAGREEMENT")).length / cases.length,
    semanticWinRate:
      reviewedCount === 0
        ? 0
        : reviewed.filter((row) => row.status === CASE_STATUSES.SEMANTIC_CORRECT).length / reviewedCount,
    legacyWinRate:
      reviewedCount === 0
        ? 0
        : reviewed.filter((row) => row.status === CASE_STATUSES.LEGACY_CORRECT).length / reviewedCount,
    bothWrongRate:
      reviewedCount === 0
        ? 0
        : reviewed.filter((row) => row.status === CASE_STATUSES.BOTH_WRONG).length / reviewedCount,
    repeatedQuestionIncidents: cases.filter((row) =>
      String(row.signalType).includes("REPEATED_QUESTION")
    ).length,
    abandonmentOrFrustrationIncidents: cases.filter((row) =>
      ["ABANDONMENT_AFTER_REPETITION", "FRUSTRATION_MISUNDERSTANDING", "REPEATED_QUESTION_COMPLAINT"].includes(
        row.signalType
      )
    ).length,
    p50LatencyMs: percentile(50),
    p95LatencyMs: percentile(95),
    tokenUsage: cases.reduce(
      (sum, row) => sum + Number(row.promptTokens || 0) + Number(row.completionTokens || 0),
      0
    ),
    estimatedSemanticCostUsd: cases.reduce((sum, row) => sum + Number(row.estimatedCostUsd || 0), 0),
    casesByTenant: byTenant,
    casesByEngine: byEngine,
    casesBySignal: bySignal
  };
}

module.exports = {
  ACTION_STATUS,
  applyReviewAction,
  computeOverview
};
