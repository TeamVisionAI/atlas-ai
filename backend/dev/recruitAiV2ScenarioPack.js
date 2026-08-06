/**
 * Recruit AI v2 Workflow Simulator — scenario pack.
 * Deterministic regression scenarios for the v2 interpretation pipeline.
 * Ephemeral only — never writes production tables.
 *
 * Rule: every confirmed production Recruit AI defect should become a named
 * scenario here before the defect is considered closed.
 */

const { RECRUIT_AI_V2_SCENARIOS } = require("./recruitAiV2ScenarioDefinitions");
const {
  runRecruitAiV2Scenario,
  runAllRecruitAiV2Scenarios
} = require("./recruitAiV2ScenarioRunner");

function listRecruitAiV2Scenarios() {
  return RECRUIT_AI_V2_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    description: scenario.description || null,
    category: scenario.category || "recruit_ai_v2"
  }));
}

function getRecruitAiV2Scenario(scenarioId) {
  return RECRUIT_AI_V2_SCENARIOS.find((s) => s.id === String(scenarioId)) || null;
}

function runRecruitAiV2ScenarioById(scenarioId) {
  const definition = getRecruitAiV2Scenario(scenarioId);
  if (!definition) {
    const error = new Error(`Unknown Recruit AI v2 scenario: ${scenarioId}`);
    error.code = "V2_SCENARIO_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  return runRecruitAiV2Scenario(definition);
}

function runAllRecruitAiV2ScenarioPack() {
  return runAllRecruitAiV2Scenarios(RECRUIT_AI_V2_SCENARIOS);
}

/** Golden-suite integration: v2 scenarios runnable as a suite. */
function getRecruitAiV2GoldenSuiteMeta() {
  return {
    id: "recruit-ai-v2-suite",
    name: "Recruit AI v2 golden suite",
    count: RECRUIT_AI_V2_SCENARIOS.length,
    scenarioIds: RECRUIT_AI_V2_SCENARIOS.map((s) => s.id)
  };
}

module.exports = {
  RECRUIT_AI_V2_SCENARIOS,
  listRecruitAiV2Scenarios,
  getRecruitAiV2Scenario,
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack,
  getRecruitAiV2GoldenSuiteMeta
};
