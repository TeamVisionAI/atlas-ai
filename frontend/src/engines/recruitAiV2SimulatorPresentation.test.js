import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRecruitAiV2FactChanges,
  RECRUIT_AI_V2_SIMULATOR_PATHS,
  summarizeRecruitAiV2ScenarioReport
} from "./recruitAiV2SimulatorPresentation.js";

test("summarizeRecruitAiV2ScenarioReport maps pass/fail and summary fields", () => {
  const summary = summarizeRecruitAiV2ScenarioReport({
    scenarioId: "first-production-failure",
    scenarioName: "First Production Failure",
    pass: true,
    summary: {
      totalAssertions: 4,
      passed: 4,
      failed: 0,
      finalContextStage: "qualification",
      humanEscalation: false,
      sideEffectsDenied: true
    },
    turns: [{}, {}, {}, {}]
  });

  assert.equal(summary.pass, true);
  assert.equal(summary.passed, 4);
  assert.equal(summary.totalAssertions, 4);
  assert.equal(summary.finalContextStage, "qualification");
  assert.equal(summary.sideEffectsDenied, true);
  assert.equal(summary.turnCount, 4);
});

test("formatRecruitAiV2FactChanges stays compact for empty and non-empty facts", () => {
  assert.equal(formatRecruitAiV2FactChanges(null), "—");
  assert.equal(formatRecruitAiV2FactChanges({}), "—");
  assert.equal(
    formatRecruitAiV2FactChanges({ city: "Miami" }),
    JSON.stringify({ city: "Miami" })
  );
});

test("Recruit AI v2 simulator paths stay isolated from live WhatsApp routes", () => {
  assert.equal(RECRUIT_AI_V2_SIMULATOR_PATHS.list, "/simulator/recruit-ai-v2/scenarios");
  assert.equal(RECRUIT_AI_V2_SIMULATOR_PATHS.runAll, "/simulator/recruit-ai-v2/scenarios/run-all");
  assert.equal(
    RECRUIT_AI_V2_SIMULATOR_PATHS.runOne("first-production-failure"),
    "/simulator/recruit-ai-v2/scenarios/first-production-failure/run"
  );
  assert.match(RECRUIT_AI_V2_SIMULATOR_PATHS.runOne("a/b"), /a%2Fb/);
  assert.equal(RECRUIT_AI_V2_SIMULATOR_PATHS.list.includes("whatsapp"), false);
});
