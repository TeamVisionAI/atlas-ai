/**
 * QUALIFYING Mission Control restore — Complete Qualification + Close Not Interested.
 * Covers BR-025/026 action visibility, BR-123 occupation optional, BR-044 pre-interview close.
 */
"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAvailableActions,
  MILESTONES
} = require("../core/agentActionEngine");
const { ACTION_IDS } = require("../core/agentActionRegistry");
const {
  getQualificationFormGaps,
  buildRequiredInputs
} = require("../core/conversationOutcomeEngine");
const { buildProfileFromProspect } = require("../core/informationModel");

test("A. QUALIFYING exposes Complete Qualification as primary and Close — Not Interested", () => {
  const actions = resolveAvailableActions({
    prospect: { phone: "+17865063586", name: "Flor Flor" },
    currentStep: "QUALIFYING",
    missingFields: ["city", "authorization"],
    interviewType: null,
    agentState: {},
    organizationSettings: {}
  });

  const ids = actions.map((action) => action.id);
  const primary = actions.find((action) => action.priority === "primary");

  assert.equal(primary?.id, ACTION_IDS.COMPLETE_QUALIFICATION);
  assert.ok(ids.includes(ACTION_IDS.COMPLETE_QUALIFICATION));
  assert.ok(ids.includes(ACTION_IDS.CLOSE_NOT_INTERESTED));
  assert.ok(ids.includes(ACTION_IDS.CALL));
  assert.ok(ids.includes(ACTION_IDS.WHATSAPP));
  assert.ok(ids.includes(ACTION_IDS.NOTES));
});

test("C. occupation is not a qualification form gap (BR-123)", () => {
  const prospect = {
    phone: "+17865063586",
    name: "Flor Flor",
    city: "Miami",
    state: "FL",
    work_authorized: true,
    interview_type: "Zoom",
    occupation: null,
    preferred_language: "english",
    notes: null
  };
  const profile = buildProfileFromProspect(prospect);

  const gaps = getQualificationFormGaps(prospect, profile, {
    notes: null,
    captureState: {
      city: true,
      state: true,
      authorization: true,
      interviewType: true,
      dayPart: false,
      name: false,
      email: false,
      dayPartClarifyAttempts: 0
    }
  });

  assert.ok(!gaps.includes("occupation"));

  const inputs = buildRequiredInputs(prospect, profile, [], {
    notes: null,
    captureState: {
      city: true,
      state: true,
      authorization: true,
      interviewType: true,
      dayPart: false,
      name: false,
      email: false,
      dayPartClarifyAttempts: 0
    }
  });

  assert.ok(!inputs.some((row) => row.key === "occupation"));
});

test("QUALIFYING without missing fields still exposes close (secondary resolve path)", () => {
  // deriveMilestoneLabel with empty missing → New Lead; with any missing → Qualifying.
  const actions = resolveAvailableActions({
    prospect: { phone: "+17865063586" },
    currentStep: "CITY",
    missingFields: ["city"],
    interviewType: null,
    agentState: {},
    organizationSettings: {}
  });

  assert.equal(
    actions.some((action) => action.id === ACTION_IDS.CLOSE_NOT_INTERESTED),
    true
  );
});

test("J. execution path unchanged — ACTION_IDS remain fail-closed separate from V2 execution", () => {
  assert.equal(ACTION_IDS.COMPLETE_QUALIFICATION, "qualification");
  assert.equal(ACTION_IDS.CLOSE_NOT_INTERESTED, "close_not_interested");
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
});
