/**
 * BR-223 — IUL Policy Review Workflow Simulator scenario pack.
 */

"use strict";

const { IUL_POLICY_REVIEW_SCENARIOS } = require("./iulPolicyReviewScenarioDefinitions");
const {
  runIulDryRunScenario,
  runIulStagingE2EScenario
} = require("./iulPolicyReviewScenarioRunner");

function listIulPolicyReviewScenarios() {
  return IUL_POLICY_REVIEW_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    description: scenario.description || null,
    category: scenario.category || "iul_policy_review",
    mode: scenario.mode || "dry_run",
    br: scenario.br || []
  }));
}

function getIulPolicyReviewScenario(scenarioId) {
  return IUL_POLICY_REVIEW_SCENARIOS.find((s) => s.id === String(scenarioId)) || null;
}

function getIulDryRunScenarios() {
  return IUL_POLICY_REVIEW_SCENARIOS.filter((s) => s.mode !== "staging_e2e");
}

function getIulGoldenSuiteMeta() {
  const dryRun = getIulDryRunScenarios();
  return {
    id: "iul-policy-review-golden-suite",
    name: "IUL Policy Review golden suite",
    count: dryRun.length,
    scenarioIds: dryRun.map((s) => s.id)
  };
}

async function runIulPolicyReviewScenarioById(scenarioId, req = null, options = {}) {
  const definition = getIulPolicyReviewScenario(scenarioId);
  if (!definition) {
    const error = new Error(`Unknown IUL Policy Review scenario: ${scenarioId}`);
    error.code = "IUL_SCENARIO_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  if (definition.mode === "staging_e2e") {
    if (!req) {
      const error = new Error("Authenticated request required for staging E2E");
      error.code = "IUL_STAGING_AUTH_REQUIRED";
      error.statusCode = 401;
      throw error;
    }
    return runIulStagingE2EScenario(definition, req, options);
  }

  return runIulDryRunScenario(definition);
}

async function runAllIulDryRunScenarioPack() {
  const scenarios = getIulDryRunScenarios();
  const reports = [];
  for (const definition of scenarios) {
    reports.push(await runIulDryRunScenario(definition));
  }

  const passed = reports.filter((r) => r.pass).length;
  return {
    success: true,
    simulator: true,
    iulPolicyReview: true,
    mode: "dry_run",
    ephemeral: true,
    ranAt: new Date().toISOString(),
    total: reports.length,
    passed,
    failed: reports.length - passed,
    reports
  };
}

async function runIulStagingE2EPack(req, options = {}) {
  const scenarios = IUL_POLICY_REVIEW_SCENARIOS.filter((s) => s.mode === "staging_e2e");
  const reports = [];
  for (const definition of scenarios) {
    reports.push(await runIulStagingE2EScenario(definition, req, options));
  }

  const passed = reports.filter((r) => r.pass).length;
  return {
    success: true,
    simulator: true,
    iulPolicyReview: true,
    mode: "staging_e2e",
    ranAt: new Date().toISOString(),
    total: reports.length,
    passed,
    failed: reports.length - passed,
    reports
  };
}

module.exports = {
  IUL_POLICY_REVIEW_SCENARIOS,
  listIulPolicyReviewScenarios,
  getIulPolicyReviewScenario,
  getIulDryRunScenarios,
  getIulGoldenSuiteMeta,
  runIulPolicyReviewScenarioById,
  runAllIulDryRunScenarioPack,
  runIulStagingE2EPack
};
