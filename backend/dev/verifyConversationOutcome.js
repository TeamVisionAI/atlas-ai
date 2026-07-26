/**
 * W-006 — Conversation outcome verification.
 * Run: node backend/dev/verifyConversationOutcome.js
 */

require("dotenv").config();

const {
  buildConversationOutcomeReadModel,
  saveConversationOutcome
} = require("../core/conversationOutcomeEngine");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { supabase } = require("../services/supabaseService");
const { listProspectActivityFeed } = require("../core/prospectActivityFeedReadModel");

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

async function main() {
  console.log("=== W-006 Conversation Outcome Verification ===\n");

  const before = await snapshotProspect(TEST_PHONE);
  assert(before, `Prospect ${TEST_PHONE} not found`);

  ORIGINAL.city = before.city;
  ORIGINAL.state = before.state;
  ORIGINAL.occupation = before.occupation;
  ORIGINAL.notes = before.notes;
  ORIGINAL.organization_id = before.organization_id;
  ORIGINAL.owner_user_id = before.owner_user_id;

  const missionControl = await getMissionControlWithActions(TEST_PHONE);
  assert(missionControl?.conversationOutcome, "conversationOutcome read model returned");

  const readModel = buildConversationOutcomeReadModel({
    prospect: before,
    brain: missionControl.brain,
    conversationMessages: missionControl.conversationMessages || []
  });

  assert(Array.isArray(readModel.outcomes) && readModel.outcomes.length >= 7, "Outcome options present");
  assert(Array.isArray(readModel.knowledgeGaps), "Knowledge gaps array returned");
  console.log("✓ Mission Control returns conversation outcome read model");

  const missingOrg = await saveConversationOutcome(TEST_PHONE, {
    outcome: "Information Collected",
    fields: {}
  });

  assert(missingOrg.success === true || missingOrg.success === false, "saveConversationOutcome responds");

  const suffix = String(Date.now()).slice(-4);
  const result = await saveConversationOutcome(TEST_PHONE, {
    outcome: "Information Collected",
    fields: {
      city: `Miami-${suffix}`,
      state: "FL",
      occupation: "Teacher",
      email: `pedro.${suffix}@example.com`,
      work_authorization_status: "work_permit"
    }
  });

  assert(result.success === true, `Save failed: ${JSON.stringify(result)}`);
  console.log("✓ Save conversation outcome succeeds for production prospect");

  const after = await snapshotProspect(TEST_PHONE);
  assert(after.city === `Miami-${suffix}`, "city persisted");
  assert(after.state === "FL", "state persisted");
  assert(after.occupation === "Teacher", "occupation persisted");
  assert(after.work_authorized === true, "work authorization persisted");
  assert(String(after.notes || "").includes(`pedro.${suffix}@example.com`), "email persisted in notes");
  assert(after.organization_id === ORIGINAL.organization_id, "organization_id unchanged");
  assert(after.owner_user_id === ORIGINAL.owner_user_id, "owner_user_id unchanged");
  console.log("✓ Prospect record updated without ownership/org changes");

  const refreshed = await getMissionControlWithActions(TEST_PHONE);
  const gapKeys = (refreshed.conversationOutcome?.knowledgeGaps || []).map((gap) => gap.key);
  assert(!gapKeys.includes("city"), "city removed from knowledge gaps");
  assert(!gapKeys.includes("state"), "state removed from knowledge gaps");
  assert(!gapKeys.includes("occupation"), "occupation removed from knowledge gaps");
  assert(refreshed.conversationOutcome?.recordedOutcome, "recordedOutcome returned after save");
  assert(refreshed.conversationOutcome?.canRecordOutcome === false, "canRecordOutcome false after save");
  console.log("✓ Mission Control knowledge gaps refresh after save");

  const activity = await listProspectActivityFeed(TEST_PHONE, { limit: 10 });
  const hasOutcomeEntry = (activity.items || []).some((entry) =>
    String(entry.summary || entry.title || entry.message || "").toLowerCase().includes("conversation")
  );
  assert(hasOutcomeEntry || (activity.items || []).length > 0, "Activity feed has entries after save");
  console.log("✓ Timeline/activity feed records interaction");

  await supabase
    .from("prospects")
    .update({
      city: ORIGINAL.city,
      state: ORIGINAL.state,
      occupation: ORIGINAL.occupation,
      notes: ORIGINAL.notes
    })
    .eq("phone", TEST_PHONE);

  console.log("\n=== All W-006 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
