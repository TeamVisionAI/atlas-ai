/**
 * Interview Outcome Engine verification.
 * Run: node backend/dev/verifyInterviewOutcome.js
 */

require("dotenv").config();

const { postInterviewOutcome } = require("../controllers/interviewOutcomeController");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const {
  buildInterviewOutcomeReadModel,
  resolveInterviewAdvancePayload
} = require("../core/interviewOutcomeMappings");
const { savePersistedWorkflowState } = require("../core/workflowStateStore");
const { loadAgentState, saveAgentState } = require("../core/agentActionState");
const { listProspectActivityFeed } = require("../core/prospectActivityFeedReadModel");
const { MILESTONES } = require("../core/workflowConstants");
const { supabase } = require("../services/supabaseService");

const TEST_PHONE = process.env.ATLAS_DIAG_PHONE || "+17867528080";
const ORIGINAL = {};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function snapshotProspect(phone) {
  const { data } = await supabase.from("prospects").select("*").eq("phone", phone).maybeSingle();
  return data;
}

async function ensureGateActive(phone) {
  savePersistedWorkflowState(phone, {
    canonicalMilestone: MILESTONES.INTERVIEW_RESULT_PENDING,
    workflowOwnership: "AGENT",
    needsHumanAttention: false,
    manualAgentOwnership: false,
    reconcileEpisodeKey: `verify-interview-outcome:${Date.now()}`
  });

  await supabase
    .from("prospects")
    .update({
      current_step: "CONFIRMED",
      interview_time: "Mañana a las 9:30 AM",
      appointment_date: "2026-07-17T13:30:00+00:00"
    })
    .eq("phone", phone);

  ORIGINAL.agentState = loadAgentState(phone);
  saveAgentState(phone, {
    ...ORIGINAL.agentState,
    outcome: null,
    followUpDate: null,
    followUpTime: null,
    closureReason: null,
    futureReminder: null
  });
}

async function restoreProspect(phone) {
  if (!ORIGINAL.prospect) {
    return;
  }

  await supabase
    .from("prospects")
    .update({
      current_step: ORIGINAL.prospect.current_step,
      interview_time: ORIGINAL.prospect.interview_time,
      appointment_date: ORIGINAL.prospect.appointment_date
    })
    .eq("phone", phone);

  if (ORIGINAL.agentState) {
    saveAgentState(phone, ORIGINAL.agentState);
  }
}

async function main() {
  console.log("=== Interview Outcome Engine Verification ===\n");

  const readModel = buildInterviewOutcomeReadModel();
  assert(readModel.categories.length === 1, "Expected 1 outcome category");
  assert(
    readModel.categories.flatMap((category) => category.outcomes).length === 6,
    "Expected 6 interview outcomes"
  );

  const pendingIba = resolveInterviewAdvancePayload("Pending IBA", { notes: "Awaiting paperwork" });
  assert(pendingIba.targetMilestone === MILESTONES.LICENSING, "Pending IBA maps to LICENSING");
  assert(pendingIba.workflowLabel === "Pending IBA Workflow", "Pending IBA workflow label set");
  console.log("✓ Outcome configuration exposes 1 category / 6 outcomes");

  ORIGINAL.prospect = await snapshotProspect(TEST_PHONE);
  assert(ORIGINAL.prospect, `Prospect ${TEST_PHONE} not found`);

  await ensureGateActive(TEST_PHONE);

  const before = await getMissionControlWithActions(TEST_PHONE);
  assert(before.workflowGate?.active === true, "Workflow gate should be active before save");
  assert(
    Array.isArray(before.workflowGate?.outcomeCategories) &&
      before.workflowGate.outcomeCategories.length === 1,
    "Gate descriptor exposes simplified outcome category"
  );
  console.log("✓ Mission Control gate exposes categorized outcomes");

  const result = await postInterviewOutcome(TEST_PHONE, {
    outcome: "Follow Up Needed",
    fields: {
      followUpDate: "2026-08-15",
      followUpTime: "10:00"
    }
  });

  assert(result.success === true, `Save failed: ${JSON.stringify(result)}`);
  assert(result.outcome === "Follow Up Needed", "Outcome label returned");
  assert(result.workflowLabel === "Follow-Up Workflow", "Workflow label mapped from config");
  assert(result.followUpRecommendation?.recommendedFollowUpDate, "Follow-up recommendation returned");
  assert(result.missionControl, "Refreshed Mission Control payload returned");
  console.log("✓ Save interview outcome advances workflow via engine");

  const after = result.missionControl;
  assert(after.workflowGate?.active === false, "Gate clears after outcome recorded");
  assert(
    after.workflow.canonicalMilestone === MILESTONES.FOLLOW_UP,
    `Expected FOLLOW_UP, got ${after.workflow.canonicalMilestone}`
  );
  assert(loadAgentState(TEST_PHONE).outcome === "Needs More Time", "Agent outcome persisted");
  console.log("✓ Workflow state and gate refresh after save");

  const activity = await listProspectActivityFeed(TEST_PHONE, { limit: 15 });
  const hasInterviewEntry = (activity.items || []).some((entry) =>
    String(entry.summary || entry.title || entry.message || "").includes("Interview")
  );

  if (!hasInterviewEntry) {
    const logs = await supabase
      .from("conversation_logs")
      .select("message")
      .eq("prospect_phone", TEST_PHONE)
      .order("created_at", { ascending: false })
      .limit(5);
    const inLogs = (logs.data || []).some((row) =>
      String(row.message || "").includes("[Interview Completed]")
    );
    assert(inLogs, "Timeline should include Interview Completed entry");
  }

  console.log("✓ Timeline records interview completion");

  const legacyPayload = resolveInterviewAdvancePayload("Needs More Time", {
    followUpDate: "2026-08-20",
    followUpTime: "11:00"
  });
  assert(legacyPayload.capturedFields.outcome === "Needs More Time", "Legacy alias resolves");
  console.log("✓ Legacy outcome alias supported");

  await restoreProspect(TEST_PHONE);
  console.log("✓ Test prospect restored");

  console.log("\n=== All Interview Outcome Engine checks passed ===");
}

main().catch(async (error) => {
  console.error("\n✗", error.message);

  try {
    await restoreProspect(TEST_PHONE);
  } catch {
    // ignore restore errors during failure
  }

  process.exit(1);
});
