/**
 * Sprint 19 — Automated regression tests (Node built-in test runner).
 * Run: npm test
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateMissionsFromContext
} = require("../core/missionEngine");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");
const { MISSION_PRIORITIES } = require("../core/configuration/missionPriorities");
const { isWorkflowGateActive } = require("../core/agentActionEngine");
const {
  validateEnvironmentSecrets,
  forbidProductionInMemoryFallback
} = require("../core/productionReadinessValidator");

describe("Mission Engine rules", () => {
  it("generates Schedule Interview for interested prospect without interview", () => {
    const missions = generateMissionsFromContext({
      prospect: { phone: "+1", current_step: "SCHEDULE" },
      brain: { currentStep: "SCHEDULE", missingFields: ["schedule"] },
      agentState: { outcome: "Interested" },
      conversationOutcome: {
        recordedOutcome: { key: "Interested" },
        workflowRequirements: [{ key: "schedule" }]
      },
      workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" },
      availableActions: [{ id: "schedule", label: "Schedule" }]
    });

    assert.equal(missions[0].missionType, MISSION_TYPES.SCHEDULE_INTERVIEW);
    assert.equal(missions[0].priority, MISSION_PRIORITIES.HIGH);
  });

  it("keeps workflow gate active when conversation outcome is Information Collected", () => {
    const prospect = {
      current_step: "CONFIRMED",
      appointment_date: "2020-01-01T10:00:00.000Z"
    };
    const agentState = { outcome: "Information Collected" };

    assert.equal(isWorkflowGateActive(prospect, agentState), true);
  });

  it("generates Enter Interview Outcome when gate is active", () => {
    const missions = generateMissionsFromContext({
      prospect: {
        phone: "+1",
        current_step: "CONFIRMED",
        appointment_date: "2020-01-01T10:00:00.000Z"
      },
      brain: { currentStep: "CONFIRMED", missingFields: [] },
      agentState: { outcome: "Information Collected" },
      conversationOutcome: { recordedOutcome: { key: "Information Collected" } },
      workflow: { canonicalMilestone: "INTERVIEW_RESULT_PENDING" },
      availableActions: []
    });

    assert.equal(missions[0].missionType, MISSION_TYPES.ENTER_INTERVIEW_OUTCOME);
    assert.equal(missions[0].priority, MISSION_PRIORITIES.CRITICAL);
  });
});

describe("Production validation", () => {
  it("requires Google OAuth state secret in production when OAuth enabled", () => {
    const previousEnv = process.env.NODE_ENV;
    const previousSecret = process.env.GOOGLE_OAUTH_STATE_SECRET;
    const previousClient = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    try {
      process.env.NODE_ENV = "production";
      process.env.GOOGLE_CLIENT_ID = "client";
      process.env.GOOGLE_CLIENT_SECRET = "secret";
      delete process.env.GOOGLE_OAUTH_STATE_SECRET;
      delete process.env.JWT_SECRET;
      delete process.env.ATLAS_JWT_SECRET;

      const missing = validateEnvironmentSecrets();
      assert.ok(missing.some((entry) => entry.includes("GOOGLE_OAUTH_STATE_SECRET")));
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (previousSecret) process.env.GOOGLE_OAUTH_STATE_SECRET = previousSecret;
      else delete process.env.GOOGLE_OAUTH_STATE_SECRET;
      if (previousClient) process.env.GOOGLE_CLIENT_ID = previousClient;
      else delete process.env.GOOGLE_CLIENT_ID;
      if (previousClientSecret) process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
      else delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  it("blocks in-memory fallback in production", () => {
    const previousEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";
      assert.throws(() => forbidProductionInMemoryFallback("TestModule"));
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });
});

describe("Agent Action application service", () => {
  it("exports orchestration functions", () => {
    const service = require("../application/agentActionApplicationService");
    assert.equal(typeof service.executeAgentAction, "function");
    assert.equal(typeof service.getMissionControlWithActions, "function");
    assert.equal(typeof service.syncAgentWorkflow, "function");
  });
});
