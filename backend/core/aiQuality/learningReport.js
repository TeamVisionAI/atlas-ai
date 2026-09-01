/**
 * BR-198 — Learning & Improvements report.
 */

const {
  CASE_STATUSES,
  PROPOSAL_STATUSES,
  REGRESSION_STATUSES,
  IMPLEMENTATION_STATUSES
} = require("./constants");

const REVIEWED_STATUSES = new Set([
  CASE_STATUSES.SEMANTIC_CORRECT,
  CASE_STATUSES.LEGACY_CORRECT,
  CASE_STATUSES.BOTH_WRONG,
  CASE_STATUSES.EXPECTED_BEHAVIOR,
  CASE_STATUSES.REGRESSION_CANDIDATE,
  CASE_STATUSES.RESOLVED,
  CASE_STATUSES.IGNORED,
  CASE_STATUSES.REVIEWING
]);

function latestTimestamp(...values) {
  return values.filter(Boolean).sort().at(-1) || null;
}

function buildLearningReport({
  cases = [],
  proposals = [],
  regressions = [],
  implementations = []
} = {}) {
  const proposalsByCase = new Map(proposals.map((row) => [row.caseId, row]));
  const regressionsByCase = new Map(regressions.map((row) => [row.caseId, row]));
  const implementationsByCase = new Map(implementations.map((row) => [row.caseId, row]));

  const groups = new Map();
  for (const qualityCase of cases) {
    const key = `${qualityCase.organizationId}::${qualityCase.signalType}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(qualityCase);
  }

  const rows = [...groups.entries()].map(([key, group]) => {
    const newest = group
      .slice()
      .sort((a, b) => String(b.detectedAt || b.updatedAt || "").localeCompare(String(a.detectedAt || a.updatedAt || "")))[0];
    const proposal = proposalsByCase.get(newest.id) || proposals.find((row) => group.some((item) => item.id === row.caseId));
    const regression =
      regressionsByCase.get(newest.id) || regressions.find((row) => group.some((item) => item.id === row.caseId));
    const implementation =
      implementationsByCase.get(newest.id) ||
      implementations.find((row) => group.some((item) => item.id === row.caseId));
    const reviewStatus = newest.status || CASE_STATUSES.NEW;
    const regressionStatus = regression?.status || null;
    const implementationStatus = implementation?.status || null;
    const verificationStatus =
      implementationStatus === IMPLEMENTATION_STATUSES.VERIFIED
        ? IMPLEMENTATION_STATUSES.VERIFIED
        : regressionStatus === REGRESSION_STATUSES.VERIFIED
          ? REGRESSION_STATUSES.VERIFIED
          : null;
    const blocked =
      proposal?.status === PROPOSAL_STATUSES.REJECTED ||
      proposal?.status === PROPOSAL_STATUSES.REVISION_REQUESTED ||
      implementationStatus === IMPLEMENTATION_STATUSES.REJECTED;

    return {
      issue: proposal?.proposal?.problem_summary || newest.label || newest.signalType,
      signalType: newest.signalType,
      tenant: newest.organizationId,
      detectedCount: group.length,
      risk: proposal?.riskLevel || newest.severity || null,
      reviewStatus,
      regressionStatus,
      implementationStatus,
      verificationStatus,
      linkedBr: implementation?.linkedBr || regression?.spec?.sourceBr || null,
      linkedPr: implementation?.linkedPr || regression?.spec?.futureBr || null,
      lastUpdated: latestTimestamp(
        newest.detectedAt,
        newest.updatedAt,
        proposal?.updatedAt,
        regression?.createdAt,
        implementation?.updatedAt
      ),
      open: !verificationStatus && reviewStatus !== CASE_STATUSES.IGNORED,
      blocked,
      groupKey: key
    };
  });

  rows.sort((a, b) => String(b.lastUpdated || "").localeCompare(String(a.lastUpdated || "")));

  const casesReviewed = cases.filter((row) => REVIEWED_STATUSES.has(row.status) && row.status !== CASE_STATUSES.NEW);
  const proposalsGenerated = proposals.filter((row) =>
    [
      PROPOSAL_STATUSES.GENERATED,
      PROPOSAL_STATUSES.REVISION_REQUESTED,
      PROPOSAL_STATUSES.REGRESSION_APPROVED,
      PROPOSAL_STATUSES.REJECTED
    ].includes(row.status)
  );
  const regressionsApproved = regressions.filter((row) =>
    [REGRESSION_STATUSES.APPROVED, REGRESSION_STATUSES.IMPLEMENTED, REGRESSION_STATUSES.VERIFIED].includes(row.status)
  );
  const improvementsImplemented = implementations.filter((row) =>
    [IMPLEMENTATION_STATUSES.IMPLEMENTED, IMPLEMENTATION_STATUSES.VERIFIED].includes(row.status)
  );
  const improvementsVerified = implementations.filter(
    (row) => row.status === IMPLEMENTATION_STATUSES.VERIFIED
  );

  return {
    casesDetected: cases.length,
    proposalsGenerated: proposalsGenerated.length,
    casesReviewed: casesReviewed.length,
    regressionsApproved: regressionsApproved.length,
    improvementsImplemented: improvementsImplemented.length,
    improvementsVerified: improvementsVerified.length,
    openItems: rows.filter((row) => row.open && !row.blocked).length,
    blockedItems: rows.filter((row) => row.blocked).length,
    rows
  };
}

module.exports = {
  buildLearningReport
};
