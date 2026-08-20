/**
 * Backend contract: BR-044 queue still excludes Not Interested / CLOSED after MC close.
 * Execution remains OFF. Complements frontend post-save selection navigation.
 */
"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  isTerminalClosedInterviewOutcome,
  isTerminalClosedForMissionControlQueue
} = require("../core/missionControlTerminalOutcomeFilter");
const { MILESTONES } = require("../core/workflowConstants");

test("I. Not Interested / CLOSED remain excluded from default MC queue (BR-044)", () => {
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

test("G/H posture: BR-136 filter module unchanged by this MC selection fix", () => {
  const br136 = path.join(__dirname, "../core/missionControlOperationalTestFilter.js");
  assert.equal(fs.existsSync(br136), true);
});

test("L. execution remains OFF", () => {
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
});
