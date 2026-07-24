/**
 * Sprint 16.1 — Mission Control live recruiting workflow verification.
 * Run: node backend/dev/verifyMissionControlLiveWorkflow.js
 */

const assert = require("assert");
const {
  buildRecruitingFunnelStatus,
  buildAiActionCenter,
  enrichAtlasBriefSummary
} = require("../core/missionControlLiveReadModel");
const { MILESTONES } = require("../core/workflowConstants");
const { ACTION_IDS } = require("../core/agentActionEngine");

function run() {
  console.log("Sprint 16.1 — Mission Control live recruiting workflow verification\n");

  const newLeadFunnel = buildRecruitingFunnelStatus(
    { canonicalMilestone: MILESTONES.NEW_LEAD },
    { currentStep: "NEW", missingFields: [] }
  );

  assert.strictEqual(newLeadFunnel.activeStepKey, "new_lead");
  assert.strictEqual(newLeadFunnel.steps[0].state, "current");

  const contactedFunnel = buildRecruitingFunnelStatus(
    { canonicalMilestone: MILESTONES.GREETING_SENT },
    { currentStep: "GREETING", missingFields: ["city"] }
  );

  assert.strictEqual(contactedFunnel.activeStepKey, "contacted");

  const qualifiedFunnel = buildRecruitingFunnelStatus(
    { canonicalMilestone: MILESTONES.QUALIFICATION },
    { currentStep: "QUALIFY", missingFields: ["schedule"] }
  );

  assert.strictEqual(qualifiedFunnel.activeStepKey, "qualified");

  const scheduledFunnel = buildRecruitingFunnelStatus(
    { canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED },
    { currentStep: "CONFIRMED", missingFields: [] }
  );

  assert.strictEqual(scheduledFunnel.activeStepKey, "interview_scheduled");
  assert.strictEqual(scheduledFunnel.steps[3].state, "current");

  const actionCenter = buildAiActionCenter({
    workflow: {
      missionControlPriorityTier: "ATLAS_ACTIVE",
      missionControlPriority: 5,
      stall: { isStalled: false }
    },
    availableActions: [{ id: ACTION_IDS.SCHEDULE, priority: "primary" }],
    brain: { currentStep: "SCHEDULE", missingFields: ["schedule"] },
    conversationMessages: [
      { direction: "outgoing", text: "Hello from Atlas" },
      { direction: "incoming", text: "I am interested" }
    ]
  });

  assert.strictEqual(actionCenter.nextBestAction, "Schedule interview");
  assert(actionCenter.confidence >= 0.7 && actionCenter.confidence <= 1);
  assert(actionCenter.reason.includes("schedule"));

  const enriched = enrichAtlasBriefSummary(["Lead: Maria"], [
    { direction: "incoming", text: "Yes, I want to learn more" }
  ]);

  assert(enriched.some((line) => line.includes("Prospect replied")));

  console.log("verifyMissionControlLiveWorkflow: all checks passed");
}

run();
