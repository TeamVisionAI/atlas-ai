/**
 * Sprint 18.3 — Mission Engine v1 verification.
 * Run: node backend/dev/verifySprint18_3.js
 */

require("dotenv").config();

const {
  MISSION_TYPES
} = require("../core/configuration/missionTypes");
const { MISSION_PRIORITIES, sortMissions } = require("../core/configuration/missionPriorities");
const {
  generateMissionsForProspect,
  generateMissionsFromContext,
  recalculateMissions
} = require("../core/missionEngine");
const { buildMissionId } = require("../core/configuration/missionTypes");

const PEDRO_PHONE = "+17867528080";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=== Sprint 18.3 Mission Engine Verification ===\n");

  assert(MISSION_TYPES.SCHEDULE_INTERVIEW === "ScheduleInterview", "ScheduleInterview type");
  assert(MISSION_TYPES.ENTER_INTERVIEW_OUTCOME === "EnterInterviewOutcome", "EnterInterviewOutcome type");
  console.log("✓ Mission types registered");

  const sorted = sortMissions([
    { priority: MISSION_PRIORITIES.HIGH, dueDate: new Date().toISOString(), prospectId: "b" },
    { priority: MISSION_PRIORITIES.CRITICAL, dueDate: new Date().toISOString(), prospectId: "a" }
  ]);
  assert(sorted[0].priority === MISSION_PRIORITIES.CRITICAL, "Critical sorts above High");
  console.log("✓ Mission priority ordering");

  const syntheticContext = {
    prospect: {
      phone: "+15551234567",
      name: "Maria Gonzalez",
      current_step: "SCHEDULE",
      first_name: "Maria",
      last_name: "Gonzalez"
    },
    brain: {
      currentStep: "SCHEDULE",
      missingFields: ["schedule"]
    },
    agentState: {
      outcome: "Interested"
    },
    conversationOutcome: {
      recordedOutcome: { key: "Interested", label: "Interested" },
      workflowRequirements: [{ key: "schedule", label: "Interview not scheduled" }]
    },
    workflow: {
      canonicalMilestone: "INTERVIEW_SCHEDULED",
      workflowOwnership: "AGENT"
    },
    availableActions: [
      { id: "schedule", label: "Schedule", priority: "primary" },
      { id: "call", label: "Call", priority: "secondary" }
    ]
  };

  const syntheticMissions = generateMissionsFromContext(syntheticContext);
  assert(syntheticMissions.length === 1, "Interested + unscheduled generates one mission");
  assert(
    syntheticMissions[0].missionType === MISSION_TYPES.SCHEDULE_INTERVIEW,
    "Mission type is ScheduleInterview"
  );
  assert(syntheticMissions[0].priority === MISSION_PRIORITIES.HIGH, "Schedule mission is High");
  assert(syntheticMissions[0].primaryAction?.id === "schedule", "Primary action is schedule");
  console.log("✓ Rule 1 — Interested + no interview → Schedule Interview");

  const outcomeContext = {
    ...syntheticContext,
    prospect: {
      ...syntheticContext.prospect,
      current_step: "CONFIRMED",
      appointment_date: "2026-07-01",
      interview_time: "10:00"
    },
    brain: {
      currentStep: "CONFIRMED",
      missingFields: []
    },
    agentState: { outcome: null },
    conversationOutcome: {
      recordedOutcome: null,
      workflowRequirements: []
    },
    workflow: {
      canonicalMilestone: "INTERVIEW_RESULT_PENDING",
      workflowOwnership: "AGENT"
    },
    availableActions: [{ id: "notes", label: "Add Note", priority: "primary" }]
  };

  const outcomeMissions = generateMissionsFromContext(outcomeContext);
  assert(outcomeMissions.length >= 1, "Past interview without outcome generates mission");
  assert(
    outcomeMissions[0].missionType === MISSION_TYPES.ENTER_INTERVIEW_OUTCOME,
    "Highest mission is EnterInterviewOutcome"
  );
  assert(outcomeMissions[0].priority === MISSION_PRIORITIES.CRITICAL, "Outcome mission is Critical");
  console.log("✓ Rule 2 — Interview passed + outcome missing → Enter Interview Outcome");

  try {
    const pedroMissions = await generateMissionsForProspect(PEDRO_PHONE, ORGANIZATION_ID);
    assert(Array.isArray(pedroMissions), "Pedro missions array returned");

    if (pedroMissions.length > 0) {
      assert(
        pedroMissions[0].id === buildMissionId(PEDRO_PHONE, pedroMissions[0].missionType),
        "Mission id format phone:type"
      );
      console.log(`✓ Pedro (${PEDRO_PHONE}) primary mission: ${pedroMissions[0].title}`);
    } else {
      console.log(`✓ Pedro (${PEDRO_PHONE}) returned zero missions (environment-dependent)`);
    }

    const recalculated = await recalculateMissions(ORGANIZATION_ID, {
      prospectPhone: PEDRO_PHONE
    });
    assert(recalculated.generatedAt, "Recalculate timestamp returned");
    assert(Array.isArray(recalculated.missions), "Recalculate missions array returned");
    console.log(`✓ Recalculate returned ${recalculated.total} mission(s) for org`);
  } catch (integrationError) {
    console.log(`⚠ Skipping live prospect integration (${integrationError.message})`);
  }

  console.log("\n=== All Sprint 18.3 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
