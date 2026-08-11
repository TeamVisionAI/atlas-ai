/**
 * Backend + terminal filter regression for Close — Not Interested after form wiring fix.
 */
"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveAvailableActions } = require("../core/agentActionEngine");
const { ACTION_IDS } = require("../core/agentActionRegistry");
const {
  isTerminalClosedInterviewOutcome,
  isTerminalClosedForMissionControlQueue
} = require("../core/missionControlTerminalOutcomeFilter");
const { MILESTONES } = require("../core/workflowConstants");

test("A. QUALIFYING emits close_not_interested", () => {
  const actions = resolveAvailableActions({
    prospect: { phone: "+17865063586", name: "Flor Flor" },
    currentStep: "QUALIFYING",
    missingFields: ["city"],
    interviewType: null,
    agentState: {},
    organizationSettings: {}
  });

  assert.ok(actions.some((action) => action.id === ACTION_IDS.CLOSE_NOT_INTERESTED));
  assert.equal(ACTION_IDS.CLOSE_NOT_INTERESTED, "close_not_interested");
});

test("I. terminal filtering removes Not Interested / CLOSED", () => {
  assert.equal(isTerminalClosedInterviewOutcome("Not Interested"), true);
  assert.equal(
    isTerminalClosedForMissionControlQueue({
      prospect: { phone: "+17865063586", source: "whatsapp" },
      summary: {
        phone: "+17865063586",
        canonicalMilestone: MILESTONES.CLOSED
      },
      agentState: { outcome: "Not Interested" }
    }),
    true
  );
});

test("L. execution remains OFF", () => {
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
});
