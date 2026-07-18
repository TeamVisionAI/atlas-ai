/**
 * Sprint 9.0 — Executive Dashboard MVP verification.
 * Run: node backend/dev/verifySprint9_0.js
 */

require("dotenv").config();

const { buildExecutiveDashboard, EXECUTIVE_FILTERS } = require("../core/executiveDashboardReadModel");
const { computeAgencyPulseScore } = require("../core/agencyPulseEngine");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { buildPrioritizedWorkflowQueue } = require("../core/missionControlPriorityEngine");
const { loadProductionProspects } = require("../core/executiveDashboardReadModel");
const { runAllGoldenScenarios } = require("./goldenScenarios");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=== Sprint 9.0 Verification ===\n");

  const executive = await buildExecutiveDashboard();
  assert(executive.todayFocus, "todayFocus required");
  assert(executive.agencyPulse?.score >= 0, "Agency pulse score required");
  assert(Array.isArray(executive.recommendations), "recommendations required");
  assert(executive.recommendations.length <= 5, "Top 5 recommendations max");
  assert(executive.productionSnapshot?.workflow?.source === "workflow", "Workflow snapshot tagged");
  assert(
    executive.productionSnapshot?.placeholder?.source === "placeholder",
    "Placeholder snapshot tagged"
  );
  console.log("✓ Executive dashboard read model");

  const prospects = await loadProductionProspects();
  const queue = await buildPrioritizedWorkflowQueue(prospects);
  const pendingFromQueue = queue.filter(
    (row) => row.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS"
  ).length;

  assert(
    executive.todayFocus.pendingInterviewOutcomes.count === pendingFromQueue,
    `Pending outcomes count mismatch: executive=${executive.todayFocus.pendingInterviewOutcomes.count} queue=${pendingFromQueue}`
  );
  console.log("✓ Focus counts match Mission Control priority queue");

  assert(
    executive.todayFocus.pendingInterviewOutcomes.filter ===
      EXECUTIVE_FILTERS.PENDING_OUTCOMES,
    "Pending outcomes filter id"
  );
  assert(
    executive.recommendations[0]?.missionControlPath?.includes("/mission-control?phone="),
    "Recommendation links include Mission Control path"
  );
  console.log("✓ Recommendation Mission Control paths");

  const pulse = computeAgencyPulseScore({
    pendingInterviewOutcomes: 2,
    stalledProspects: 1,
    followUpBacklog: 3,
    interviewsToday: 2,
    activeProspects: 8
  });
  assert(pulse.formulaVersion === "9.0-mvp", "Agency pulse formula documented");
  assert(typeof pulse.breakdown.deductions === "number", "Agency pulse breakdown");
  console.log("✓ Agency Pulse formula isolated and documented");

  const mc = await getMissionControlWithActions(prospects[0]?.phone);
  assert(mc?.workflow?.canonicalMilestone, "Mission Control still loads per prospect");
  console.log("✓ Mission Control unchanged");

  console.log("\n--- Golden Scenarios ---");
  const golden = await runAllGoldenScenarios();
  console.log(`Golden: ${golden.passed}/${golden.total} passed`);
  assert(golden.failed === 0, `${golden.failed} golden scenario(s) failed`);

  console.log("\n=== All Sprint 9.0 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
