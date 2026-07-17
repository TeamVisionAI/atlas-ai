/**
 * Sprint 8A.3 — Verification script for Human Advancement API.
 * Run: node backend/dev/verifySprint8A3.js
 */

require("dotenv").config();

const {
  validateMilestoneAdvancement,
  isTransitionAllowed,
  ALLOWED_TRANSITIONS
} = require("../core/milestoneValidationEngine");
const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { MILESTONES } = require("../core/workflowConstants");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=== Sprint 8A.3 Verification ===\n");

  assert(isTransitionAllowed(MILESTONES.QUALIFICATION, MILESTONES.INTERVIEW_SCHEDULED), "Qual → scheduled allowed");
  assert(!isTransitionAllowed(MILESTONES.CLOSED, MILESTONES.QUALIFICATION), "Closed → qual blocked");
  assert(!isTransitionAllowed(MILESTONES.QUALIFICATION, MILESTONES.NEW_LEAD), "Cannot reset to NEW_LEAD");
  console.log("✓ Transition rules");

  const invalid = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.QUALIFICATION,
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    prospect: { phone: "test-phone", city: "Miami", state: "FL" },
    capturedFields: {}
  });
  assert(invalid.valid === false, "Missing interview datetime should fail");
  assert(invalid.missingFields?.length > 0, "Should include missingFields");
  console.log("✓ Validation rejects incomplete INTERVIEW_SCHEDULED");

  const mcBefore = await getMissionControlWithActions("sched-full12");
  assert(mcBefore, "Mission Control baseline required");
  const legacy = ["prospect", "brain", "businessRules", "atlasBrief", "agentState", "availableActions"];
  legacy.forEach((key) => assert(key in mcBefore, `Missing ${key}`));
  console.log("✓ GET mission-control backward compatible");

  const failAdvance = await advanceProspectWorkflow("sched-full12", {
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    capturedFields: { city: "Miami" }
  });
  assert(failAdvance.success === false, "Advance without datetime should fail");
  assert(failAdvance.error === "VALIDATION_FAILED", "Expected VALIDATION_FAILED");
  assert(failAdvance.validation?.errors?.length > 0, "Structured validation errors expected");
  console.log("✓ POST workflow/advance validation error response");

  const followUpAdvance = await advanceProspectWorkflow("sched-full12", {
    targetMilestone: MILESTONES.FOLLOW_UP,
    capturedFields: {
      followUpDate: "2026-08-01",
      followUpTime: "10:00"
    },
    interactionNotes: "Sprint 8A.3 verification — follow up scheduled",
    interactionType: "phone"
  });

  assert(followUpAdvance.success === true, followUpAdvance.message || "Follow-up advance failed");
  assert(followUpAdvance.targetMilestone === MILESTONES.FOLLOW_UP, "Target milestone mismatch");
  assert(followUpAdvance.workflow?.canonicalMilestone === MILESTONES.FOLLOW_UP, "Workflow not updated");
  assert(Array.isArray(followUpAdvance.eventsEmitted), "eventsEmitted missing");
  assert(followUpAdvance.eventsEmitted.includes("ProspectAdvanced"), "ProspectAdvanced not emitted");
  console.log("✓ POST workflow/advance success path");

  const mcAfter = await getMissionControlWithActions("sched-full12");
  legacy.forEach((key) => assert(key in mcAfter, `Missing ${key} after advance`));
  assert(mcAfter.workflow?.needsHumanAttention === false, "Stall flags should clear after advance");
  console.log("✓ Mission Control intact after advancement");

  console.log("\nAllowed transitions table entries:", Object.keys(ALLOWED_TRANSITIONS).length);
  console.log("\n=== All checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
