/**
 * Trace Juana Maria conversation-outcome save lifecycle.
 * Run: node backend/dev/traceJuanaConversationOutcomeSave.js
 */

require("dotenv").config();

const { postConversationOutcome } = require("../controllers/conversationOutcomeController");
const {
  buildConversationOutcomeReadModel
} = require("../core/conversationOutcomeEngine");
const { buildProfileFromProspect, getMissingFields } = require("../core/informationModel");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { supabase } = require("../services/supabaseService");

const PHONE = "+17862347083";
const ORIGINAL = {};

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(title);
  console.log("=".repeat(60));
}

async function readDbFields() {
  const { data } = await supabase
    .from("prospects")
    .select("name, city, state, occupation, work_authorized, current_step, communication_language")
    .eq("phone", PHONE)
    .maybeSingle();

  return data;
}

function logBuildKnowledgeGaps(prospect, brain, label) {
  const profile = buildProfileFromProspect(prospect);
  const missingFields = getMissingFields(profile);
  const readModel = buildConversationOutcomeReadModel({
    prospect,
    brain: brain || { missingFields, currentStep: prospect?.current_step },
    conversationMessages: []
  });
  const gapKeys = (readModel?.knowledgeGaps || []).map((g) => g.key);

  console.log(`\n[${label}] buildKnowledgeGaps inputs:`);
  console.log("  DB city:", prospect?.city);
  console.log("  DB state:", prospect?.state);
  console.log("  DB occupation:", prospect?.occupation);
  console.log("  DB work_authorized:", prospect?.work_authorized);
  console.log("  profile.authorization:", profile.authorization);
  console.log("  getMissingFields():", missingFields);
  console.log("  knowledgeGaps keys:", gapKeys);

  return { profile, missingFields, gapKeys, readModel };
}

async function main() {
  section("0. PROSPECT IDENTITY");
  ORIGINAL.db = await readDbFields();
  console.log("Phone:", PHONE);
  console.log("Name:", ORIGINAL.db?.name);
  console.log("BEFORE DB:", ORIGINAL.db);

  section("1. PRE-SAVE MISSION CONTROL (what panel loaded)");
  const mcBefore = await getMissionControlWithActions(PHONE);
  console.log("brain.missingFields:", mcBefore?.brain?.missingFields);
  console.log(
    "conversationOutcome.knowledgeGaps:",
    JSON.stringify(mcBefore?.conversationOutcome?.knowledgeGaps, null, 2)
  );
  console.log(
    "conversationOutcome.workflowRequirements:",
    JSON.stringify(mcBefore?.conversationOutcome?.workflowRequirements, null, 2)
  );

  logBuildKnowledgeGaps(
    await supabase.from("prospects").select("*").eq("phone", PHONE).maybeSingle().then((r) => r.data),
    mcBefore?.brain,
    "PRE-SAVE"
  );

  section("2. BROWSER PAYLOAD (simulated from ConversationOutcomePanel.handleSubmit)");
  const browserPayload = {
    outcome: "Information Collected",
    fields: {
      city: "Miami",
      occupation: "Teacher",
      work_authorization_status: "work_permit"
    }
  };
  console.log("POST /api/mission-control/:phone/conversation-outcome");
  console.log(JSON.stringify(browserPayload, null, 2));
  console.log(
    "\nNote: Panel only sends keys present in knowledgeGaps with non-empty form values."
  );
  console.log("Juana pre-save knowledgeGaps keys: city, occupation, work_authorization_status");
  console.log("state is NOT in knowledgeGaps (city was null → state not in getMissingFields)");

  section("3. BACKEND RECEIVE → SAVE → DB");
  const apiResponse = await postConversationOutcome(PHONE, browserPayload);
  console.log("API success:", apiResponse.success);
  if (!apiResponse.success) {
    console.log("Error:", apiResponse);
    process.exit(1);
  }

  const dbAfter = await readDbFields();
  console.log("\nAFTER DB row:");
  console.log("  city:", dbAfter.city);
  console.log("  occupation:", dbAfter.occupation);
  console.log("  work_authorized:", dbAfter.work_authorized);
  console.log("  state:", dbAfter.state);
  console.log("  current_step:", dbAfter.current_step);

  section("4. buildKnowledgeGaps() IMMEDIATELY AFTER SAVE");
  const fullProspect = await supabase.from("prospects").select("*").eq("phone", PHONE).maybeSingle().then((r) => r.data);
  const gapTrace = logBuildKnowledgeGaps(fullProspect, mc?.brain, "POST-SAVE");

  section("5. API RESPONSE TO BROWSER (result.missionControl)");
  const mc = apiResponse.missionControl;
  console.log("brain.missingFields:", mc?.brain?.missingFields);
  console.log(
    "conversationOutcome.knowledgeGaps:",
    JSON.stringify(mc?.conversationOutcome?.knowledgeGaps, null, 2)
  );
  console.log(
    "conversationOutcome.workflowRequirements:",
    JSON.stringify(mc?.conversationOutcome?.workflowRequirements, null, 2)
  );
  console.log("aiActionCenter.nextBestAction:", mc?.aiActionCenter?.nextBestAction);
  console.log("prospect.city in response:", mc?.prospect?.city);
  console.log("prospect.occupation in response:", mc?.prospect?.occupation);

  section("6. RE-FETCH (simulates poll / navigation refresh)");
  const mcRefetch = await getMissionControlWithActions(PHONE);
  console.log("brain.missingFields:", mcRefetch?.brain?.missingFields);
  console.log(
    "conversationOutcome.knowledgeGaps:",
    JSON.stringify(mcRefetch?.conversationOutcome?.knowledgeGaps, null, 2)
  );

  section("7. DIVERGENCE CHECK");
  const persisted = {
    city: dbAfter.city === "Miami",
    occupation: dbAfter.occupation === "Teacher",
    work_authorized: dbAfter.work_authorized === true
  };
  console.log("Persisted city:", persisted.city, `(actual: ${dbAfter.city})`);
  console.log("Persisted occupation:", persisted.occupation, `(actual: ${dbAfter.occupation})`);
  console.log("Persisted work_authorized:", persisted.work_authorized, `(actual: ${dbAfter.work_authorized})`);

  const responseGapKeys = (mc?.conversationOutcome?.knowledgeGaps || []).map((g) => g.key);
  const expectedIfFullySaved = [];
  const stillMissingState = !dbAfter.state;

  console.log("\nResponse knowledgeGaps keys:", responseGapKeys);
  console.log("buildKnowledgeGaps raw keys:", gapTrace.gapKeys);
  console.log("Response gaps === buildKnowledgeGaps:", JSON.stringify(responseGapKeys) === JSON.stringify(gapTrace.gapKeys));

  if (stillMissingState) {
    console.log("\nDIVERGENCE POINT: state still null in DB.");
    console.log("  getMissingFields() after save:", gapTrace.missingFields);
    console.log("  state appears in missingFields because city is now set but state is null.");
    console.log("  knowledgeGaps will include 'state' even though browser did not send state.");
  }

  if (responseGapKeys.length > 0 && persisted.city && persisted.occupation && persisted.work_authorized) {
    console.log("\nUI would still show inputs because knowledgeGaps is non-empty:", responseGapKeys);
    console.log("This is backend read-model behavior, not stale frontend state.");
  }

  section("8. FRONTEND PATH (code analysis)");
  console.log("After save, Dashboard.handleConversationOutcomeSaved:");
  console.log("  setWorkspace(adaptMissionControlResponse(result.missionControl, ...))");
  console.log("ConversationOutcomePanel receives workspace.conversationOutcome from that response.");
  console.log("Panel re-renders when conversationOutcome prop changes (useEffect deps include it).");

  section("9. RESTORE");
  await supabase
    .from("prospects")
    .update({
      city: ORIGINAL.db.city,
      state: ORIGINAL.db.state,
      occupation: ORIGINAL.db.occupation,
      work_authorized: ORIGINAL.db.work_authorized,
      current_step: ORIGINAL.db.current_step
    })
    .eq("phone", PHONE);
  console.log("Juana restored to pre-trace DB state.");
}

main().catch(async (error) => {
  console.error("\nTRACE FAILED:", error.message);
  if (ORIGINAL.db) {
    await supabase
      .from("prospects")
      .update({
        city: ORIGINAL.db.city,
        state: ORIGINAL.db.state,
        occupation: ORIGINAL.db.occupation,
        work_authorized: ORIGINAL.db.work_authorized,
        current_step: ORIGINAL.db.current_step
      })
      .eq("phone", PHONE)
      .catch(() => {});
  }
  process.exit(1);
});
