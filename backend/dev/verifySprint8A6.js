/**
 * Sprint 8A.6 — Verification for workflow reconciliation, gate UX, and conversation preview.
 * Run: node backend/dev/verifySprint8A6.js
 */

require("dotenv").config();

const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
const { savePersistedWorkflowState } = require("../core/workflowStateStore");
const { loadAgentState } = require("../core/agentActionState");
const { listWorkflowEvents } = require("../services/workflowEventService");
const { isTimeProgressionAllowed } = require("../core/workflowReconciliationEngine");
const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");
const { runAllGoldenScenarios } = require("./goldenScenarios");

const PHONE = "developer-test-user";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function countReconcileEvents(phone) {
  const events = await listWorkflowEvents(phone, 200);
  return (events || []).filter((row) =>
    String(row.correlation_id || "").startsWith(`reconcile:${phone}:`)
  );
}

async function main() {
  console.log("=== Sprint 8A.6 Verification ===\n");

  assert(
    isTimeProgressionAllowed(
      MILESTONES.INTERVIEW_SCHEDULED,
      MILESTONES.INTERVIEW_RESULT_PENDING
    ),
    "Scheduled → result pending allowed"
  );
  assert(
    !isTimeProgressionAllowed(MILESTONES.CLOSED, MILESTONES.INTERVIEW_SCHEDULED),
    "Closed → scheduled blocked"
  );
  console.log("✓ Reconciliation transition rules");

  const mc1 = await getMissionControlWithActions(PHONE);
  assert(mc1, "Mission Control required");
  const eventsAfterFirst = await countReconcileEvents(PHONE);
  assert(
    mc1.workflow.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING,
    `Expected INTERVIEW_RESULT_PENDING, got ${mc1.workflow.canonicalMilestone}`
  );
  assert(
    mc1.workflow.workflowOwnership === OWNERSHIP.AGENT,
    `Expected AGENT ownership, got ${mc1.workflow.workflowOwnership}`
  );
  assert(
    mc1.workflow.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS",
    `Expected rank 1 tier, got ${mc1.workflow.missionControlPriorityTier}`
  );
  assert(mc1.workflowGate?.active === true, "Workflow gate should be active");
  assert(mc1.latestConversation?.text, "Latest conversation entry required");
  assert(
    !/^\s*1\s*$/.test(String(mc1.latestConversation.text)),
    "Latest conversation should not be literal menu reply 1"
  );
  assert(mc1.availableActions.length === 0, "Standard cards hidden while gate active");
  console.log("✓ Past confirmed interview reconciled with gate + conversation preview");

  const mc2 = await getMissionControlWithActions(PHONE);
  const eventsAfterSecond = await countReconcileEvents(PHONE);
  assert(
    eventsAfterSecond.length === eventsAfterFirst.length,
    "Repeated reads must not emit additional reconciliation events"
  );
  assert(
    mc2.workflow.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING,
    "Second read keeps reconciled milestone"
  );
  console.log("✓ Reconciliation idempotent on repeated read");

  const noShow = await advanceProspectWorkflow(PHONE, {
    targetMilestone: MILESTONES.FOLLOW_UP,
    capturedFields: {
      outcome: "No Show",
      followUpDate: "2026-08-01",
      followUpTime: "10:00"
    },
    interactionType: "phone",
    interactionNotes: "Sprint 8A.6 verify — No Show"
  });
  assert(noShow.success === true, noShow.message || "No Show advance failed");
  const mcNoShow = await getMissionControlWithActions(PHONE);
  assert(
    mcNoShow.workflow.canonicalMilestone === MILESTONES.FOLLOW_UP,
    "No Show becomes FOLLOW_UP"
  );
  assert(loadAgentState(PHONE).outcome === "No Show", "No Show outcome stored");
  assert(mcNoShow.workflowGate?.active === false, "Gate inactive after No Show");
  console.log("✓ Saving No Show → FOLLOW_UP");

  const futureDate = new Date(Date.now() + 3 * 86400000).toISOString();
  const reschedule = await advanceProspectWorkflow(PHONE, {
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    capturedFields: {
      interviewDateTime: futureDate,
      interviewType: "Zoom",
      confirmed: true,
      email: "developer-test-user@example.com"
    },
    interactionType: "phone",
    interactionNotes: "Sprint 8A.6 verify — Rescheduled"
  });
  assert(reschedule.success === true, reschedule.message || "Reschedule failed");
  const mcReschedule = await getMissionControlWithActions(PHONE);
  assert(
    mcReschedule.workflow.canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED,
    `Reschedule returns to INTERVIEW_SCHEDULED (got ${mcReschedule.workflow.canonicalMilestone})`
  );
  assert(
    mcReschedule.workflow.workflowOwnership === OWNERSHIP.WAITING_EVENT,
    "Rescheduled ownership WAITING_EVENT"
  );
  assert(loadAgentState(PHONE).outcome == null, "Reschedule clears outcome");
  console.log("✓ Saving Rescheduled returns to scheduled/waiting state");

  savePersistedWorkflowState(PHONE, {
    canonicalMilestone: MILESTONES.INTERVIEW_RESULT_PENDING,
    workflowOwnership: OWNERSHIP.AGENT,
    needsHumanAttention: false,
    manualAgentOwnership: false,
    reconcileEpisodeKey: `time:${MILESTONES.INTERVIEW_RESULT_PENDING}:2026-07-17T13:30:00.000Z`
  });

  const recruited = await advanceProspectWorkflow(PHONE, {
    targetMilestone: MILESTONES.ORIENTATION,
    capturedFields: { outcome: "Recruited", orientationScheduled: true },
    interactionType: "phone",
    interactionNotes: "Sprint 8A.6 verify — Recruited"
  });
  assert(recruited.success === true, recruited.message || "Recruited advance failed");

  const mcRecruited = await getMissionControlWithActions(PHONE);
  assert(mcRecruited.workflowGate?.active === false, "Gate clears after Recruited");
  assert(
    mcRecruited.workflow.canonicalMilestone === MILESTONES.ORIENTATION,
    "Recruited advances to ORIENTATION"
  );
  assert(loadAgentState(PHONE).outcome === "Recruited", "Agent outcome persisted");
  console.log("✓ Saving Recruited clears gate and advances workflow");

  console.log("\n--- Prior sprint regressions ---");
  const { execSync } = require("child_process");
  execSync("node backend/dev/verifySprint8A5.js", { stdio: "inherit", cwd: process.cwd() });

  console.log("\n--- Golden Scenarios ---");
  const golden = await runAllGoldenScenarios();
  console.log(`Golden: ${golden.passed}/${golden.total} passed`);
  assert(golden.failed === 0, `${golden.failed} golden scenario(s) failed`);

  console.log("\n=== All Sprint 8A.6 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
