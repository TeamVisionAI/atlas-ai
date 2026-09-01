/**
 * BR-198 — documentation-only implementation proposal.
 * Never writes source, tests, or prompts.
 */

const { IMPLEMENTATION_STATUSES } = require("./constants");
const { stripHiddenReasoning } = require("./learningProposal");

const AREA_FILES = Object.freeze({
  "recruitAiV2.qualificationFacts / conversationContinuity": [
    "backend/core/recruitAiV2/qualificationFacts.js",
    "backend/core/recruitAiV2/conversationContinuity.js",
    "backend/core/languageLibrary.js"
  ],
  "recruitAiV2.responseRenderer / qualificationFacts": [
    "backend/core/recruitAiV2/responseRenderer.js",
    "backend/core/recruitAiV2/qualificationFacts.js"
  ],
  "recruitAiV2.responseRenderer / teamVisionWorkflowCopy": [
    "backend/core/recruitAiV2/responseRenderer.js",
    "backend/core/teamVisionWorkflowCopy.js"
  ],
  "recruitAiV2.conversationContinuity / decisionEngine": [
    "backend/core/recruitAiV2/conversationContinuity.js",
    "backend/core/recruitAiV2/decisionEngine.js"
  ],
  appointment_execution: [
    "backend/core/recruitAiV2/orchestrator.js",
    "backend/services/appointmentApplicationService.js"
  ],
  compliance: [
    "backend/core/recruitAiV2/interpreter.js",
    "backend/core/recruitAiV2/decisionEngine.js"
  ],
  "recruitAiV2.interpreter": ["backend/core/recruitAiV2/interpreter.js"]
});

function filesForArea(area) {
  return AREA_FILES[area] || ["backend/core/recruitAiV2/orchestrator.js"];
}

function expectsMigration(area, riskLevel) {
  return riskLevel === "HIGH" && /tenant_isolation|lifecycle|destructive/.test(String(area || ""));
}

function expectsDataCleanup(area) {
  return /destructive_data|lifecycle_state/.test(String(area || ""));
}

function buildImplementationProposal({ qualityCase, learningProposal, regression } = {}) {
  const proposal = learningProposal?.proposal || {};
  const area = proposal.suggested_fix_area || "aiQuality.review";
  const riskLevel = proposal.risk_level || learningProposal?.riskLevel || "MEDIUM";
  const spec = stripHiddenReasoning({
    likely_files: filesForArea(area),
    engine_area: area,
    current_behavior: qualityCase?.atlasAction
      ? `Atlas acted with \`${qualityCase.atlasAction}\` after signal \`${qualityCase.signalType}\`.`
      : `Atlas emitted \`${qualityCase?.signalType || "unknown"}\`.`,
    proposed_behavioral_change: proposal.expected_behavior || "Match the approved regression expectation.",
    tests_to_add_or_update: [
      proposal.proposed_regression || "Add a focused regression from the approved spec."
    ],
    regression_impact: regression?.id
      ? `Updates regression ${regression.id}; does not auto-edit test files.`
      : "No regression linked yet.",
    risks: [riskLevel === "HIGH" ? "HIGH-risk production behavior" : `${riskLevel} behavior change`].concat(
      proposal.forbidden_behavior || []
    ),
    db_migration_expected: expectsMigration(area, riskLevel),
    production_data_cleanup_may_be_required: expectsDataCleanup(area),
    risk_level: riskLevel,
    mutates_source_code: false,
    mutates_tests: false,
    auto_merge: false,
    auto_deploy: false,
    requires_implementation_authorization: true,
    preauthorization_allowed: false
  });

  const markdown = [
    `# Implementation proposal (BR-198)`,
    ``,
    `- Case: \`${qualityCase?.id || "n/a"}\``,
    `- Regression: \`${regression?.id || "n/a"}\``,
    `- Risk: \`${spec.risk_level}\``,
    `- Engine: ${spec.engine_area}`,
    `- Files: ${spec.likely_files.join(", ")}`,
    `- DB migration expected: ${spec.db_migration_expected ? "yes" : "no"}`,
    `- Production cleanup may be required: ${spec.production_data_cleanup_may_be_required ? "yes" : "no"}`,
    ``,
    `## Current behavior`,
    spec.current_behavior,
    ``,
    `## Proposed behavioral change`,
    spec.proposed_behavioral_change,
    ``,
    `## Tests`,
    ...spec.tests_to_add_or_update.map((item) => `- ${item}`),
    ``,
    `## Risks`,
    ...spec.risks.map((item) => `- ${item}`),
    ``,
    `Do not mutate source or tests until Authorize Implementation.`,
    `Do not auto-merge. Do not auto-deploy. Semantic APPLY stays OFF.`
  ].join("\n");

  const now = new Date().toISOString();
  return {
    id: `impl-${qualityCase.id}`,
    organizationId: qualityCase.organizationId,
    caseId: qualityCase.id,
    regressionId: regression?.id || null,
    proposalId: learningProposal?.id || null,
    status: IMPLEMENTATION_STATUSES.PROPOSED,
    spec,
    markdown,
    authorizedByUserId: null,
    authorizedAt: null,
    mutatesSourceCode: false,
    mutatesTests: false,
    linkedBr: regression?.spec?.sourceBr || regression?.spec?.futureBr || "BR-198",
    linkedPr: null,
    createdAt: now,
    updatedAt: now
  };
}

function buildAuthorizedImplementationTask(implementation, { actorUserId } = {}) {
  const now = new Date().toISOString();
  const spec = stripHiddenReasoning({
    ...(implementation.spec || {}),
    authorized: true,
    authorized_by_user_id: actorUserId || null,
    authorized_at: now,
    workflow: "cursor_codex_github_pr_spec",
    mutates_source_code: false,
    mutates_tests: false,
    auto_merge: false,
    auto_deploy: false
  });
  const markdown = [
    implementation.markdown || "",
    ``,
    `## Authorization`,
    `- Authorized by: \`${actorUserId || "unknown"}\``,
    `- Authorized at: ${now}`,
    `- Workflow: create a reviewable branch/PR from this spec.`,
    `- Do not auto-merge.`,
    `- Do not auto-deploy.`,
    `- Semantic APPLY remains OFF.`
  ].join("\n");
  return { spec, markdown, authorizedAt: now };
}

module.exports = {
  filesForArea,
  buildImplementationProposal,
  buildAuthorizedImplementationTask
};
