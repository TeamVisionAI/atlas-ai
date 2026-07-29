/**
 * Milestone 4 (RX) PR-1 — Mission Engine expansion regression tests.
 * Run: npm test
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateMissionsFromContext,
  getPrimaryMissionFromContext
} = require("../core/missionEngine");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");
const { MISSION_PRIORITIES } = require("../core/configuration/missionPriorities");
const { MILESTONES } = require("../core/workflowConstants");

function buildContext(overrides = {}) {
  return {
    prospect: { phone: "+15550000001", name: "Test Prospect", current_step: "GREETING" },
    brain: { currentStep: "GREETING", missingFields: [] },
    agentState: {},
    conversationOutcome: {
      recordedOutcome: null,
      requiredInputs: [],
      workflowRequirements: []
    },
    workflow: { canonicalMilestone: MILESTONES.NEW_LEAD },
    availableActions: [
      { id: "whatsapp", label: "Continue on WhatsApp", priority: "primary" },
      { id: "call", label: "Call prospect", priority: "secondary" }
    ],
    ...overrides
  };
}

function assertSinglePrimaryMission(context) {
  const missions = generateMissionsFromContext(context);
  const primary = getPrimaryMissionFromContext(context);

  assert.ok(missions.length >= 1, "Expected at least one mission");
  assert.ok(primary, "Expected a primary mission");
  assert.equal(primary.id, missions[0].id, "Primary mission must be first sorted mission");
  assert.ok(primary.primaryAction?.id, "Primary mission must expose primaryAction");
  assert.ok(Array.isArray(primary.secondaryActions), "Primary mission must expose secondaryActions");

  return primary;
}

describe("RX Mission Engine — lifecycle scenarios", () => {
  it("New Lead returns Contact Prospect mission", () => {
    const primary = assertSinglePrimaryMission(buildContext());

    assert.equal(primary.missionType, MISSION_TYPES.CALL_PROSPECT);
    assert.equal(primary.title, "Contact Prospect");
  });

  it("Missing Qualification takes precedence over Schedule Interview", () => {
    const primary = assertSinglePrimaryMission(
      buildContext({
        prospect: { phone: "+15559876543", current_step: "GREETING" },
        brain: { currentStep: "GREETING", missingFields: ["city", "state", "authorization", "schedule"] },
        conversationOutcome: {
          recordedOutcome: null,
          requiredInputs: [
            { key: "city", label: "City" },
            { key: "state", label: "State" },
            { key: "work_authorization_status", label: "Immigration status" }
          ],
          workflowRequirements: [{ key: "schedule" }]
        },
        workflow: { canonicalMilestone: MILESTONES.QUALIFICATION },
        availableActions: [{ id: "whatsapp", label: "WhatsApp", priority: "primary" }]
      })
    );

    assert.equal(primary.missionType, MISSION_TYPES.COMPLETE_QUALIFICATION);
    assert.notEqual(primary.missionType, MISSION_TYPES.SCHEDULE_INTERVIEW);
    assert.match(primary.reason, /City/);
  });

  it("Qualified prospect returns Schedule Interview", () => {
    const primary = assertSinglePrimaryMission(
      buildContext({
        prospect: { phone: "+15559876543", current_step: "SCHEDULE" },
        brain: { currentStep: "SCHEDULE", missingFields: ["schedule"] },
        conversationOutcome: {
          recordedOutcome: null,
          requiredInputs: [],
          workflowRequirements: [{ key: "schedule", label: "Interview not scheduled" }]
        },
        workflow: { canonicalMilestone: MILESTONES.INTERVIEW_READY },
        availableActions: [{ id: "schedule", label: "Schedule Interview", priority: "primary" }]
      })
    );

    assert.equal(primary.missionType, MISSION_TYPES.SCHEDULE_INTERVIEW);
    assert.equal(primary.primaryAction.id, "schedule");
  });

  it("Interview Scheduled returns a non-empty review mission", () => {
    const primary = assertSinglePrimaryMission(
      buildContext({
        prospect: {
          phone: "+15550000044",
          current_step: "CONFIRMED",
          calendar_event_id: "evt-1",
          appointment_date: new Date(Date.now() + 86400000).toISOString()
        },
        brain: { currentStep: "CONFIRMED", missingFields: [] },
        workflow: { canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED },
        availableActions: [
          { id: "send_zoom_link", label: "Send Zoom link", priority: "primary" },
          { id: "whatsapp", label: "WhatsApp", priority: "secondary" }
        ]
      })
    );

    assert.ok(
      [MISSION_TYPES.REVIEW_PROSPECT, MISSION_TYPES.CALL_PROSPECT].includes(primary.missionType),
      `Unexpected mission type: ${primary.missionType}`
    );
    assert.match(primary.reason, /Interview/i);
  });

  it("Interview Completed returns Record Interview Outcome", () => {
    const primary = assertSinglePrimaryMission(
      buildContext({
        prospect: {
          phone: "+15550000002",
          current_step: "CONFIRMED",
          appointment_date: "2020-01-01T10:00:00.000Z"
        },
        brain: { currentStep: "CONFIRMED", missingFields: [] },
        agentState: { outcome: "Information Collected" },
        conversationOutcome: { recordedOutcome: { key: "Information Collected" } },
        workflow: { canonicalMilestone: MILESTONES.INTERVIEW_RESULT_PENDING },
        availableActions: []
      })
    );

    assert.equal(primary.missionType, MISSION_TYPES.ENTER_INTERVIEW_OUTCOME);
    assert.equal(primary.title, "Record Interview Outcome");
    assert.equal(primary.priority, MISSION_PRIORITIES.CRITICAL);
    assert.equal(primary.primaryAction.id, "enter_interview_outcome");
  });

  it("Recruited prospect returns Recruit Prospect mission", () => {
    const primary = assertSinglePrimaryMission(
      buildContext({
        prospect: { phone: "+15550000055", current_step: "CONFIRMED" },
        brain: { currentStep: "CONFIRMED", missingFields: [] },
        agentState: { outcome: "Recruited", orientationScheduled: false },
        workflow: { canonicalMilestone: MILESTONES.ORIENTATION },
        availableActions: [{ id: "notes", label: "Add notes", priority: "primary" }]
      })
    );

    assert.equal(primary.missionType, MISSION_TYPES.RECRUIT_PROSPECT);
    assert.equal(primary.title, "Recruit Prospect");
  });

  it("Follow-up due returns Follow Up mission", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const primary = assertSinglePrimaryMission(
      buildContext({
        prospect: { phone: "+15550000066", current_step: "CONFIRMED" },
        brain: { currentStep: "CONFIRMED", missingFields: [] },
        agentState: {
          outcome: "Needs More Time",
          followUpDate: yesterday,
          followUpTime: "09:00"
        },
        workflow: { canonicalMilestone: MILESTONES.FOLLOW_UP },
        availableActions: [
          { id: "call", label: "Call", priority: "primary" },
          { id: "whatsapp", label: "WhatsApp", priority: "secondary" }
        ]
      })
    );

    assert.equal(primary.missionType, MISSION_TYPES.FOLLOW_UP);
    assert.equal(primary.priority, MISSION_PRIORITIES.HIGH);
  });

  it("Onboarding pending returns Begin Onboarding mission", () => {
    const primary = assertSinglePrimaryMission(
      buildContext({
        prospect: { phone: "+15550000077", current_step: "CONFIRMED" },
        brain: { currentStep: "CONFIRMED", missingFields: [] },
        agentState: {
          outcome: "Recruited",
          orientationScheduled: true,
          onboardingUnlocked: false
        },
        workflow: { canonicalMilestone: MILESTONES.FAST_START },
        availableActions: [{ id: "notes", label: "Add notes", priority: "primary" }]
      })
    );

    assert.equal(primary.missionType, MISSION_TYPES.BEGIN_ONBOARDING);
    assert.equal(primary.title, "Begin Onboarding");
  });

  it("never returns an empty mission set for active prospects", () => {
    const scenarios = [
      buildContext(),
      buildContext({
        brain: { currentStep: "GREETING", missingFields: ["city"] },
        conversationOutcome: { requiredInputs: [{ key: "city", label: "City" }], workflowRequirements: [] }
      }),
      buildContext({
        prospect: { phone: "+1", current_step: "SCHEDULE" },
        brain: { currentStep: "SCHEDULE", missingFields: ["schedule"] },
        conversationOutcome: { workflowRequirements: [{ key: "schedule" }] }
      })
    ];

    for (const context of scenarios) {
      const missions = generateMissionsFromContext(context);
      assert.ok(missions.length >= 1, "Active prospect must always have a mission");
      assert.ok(missions[0].primaryAction?.id, "Mission must include primaryAction");
    }
  });
});
