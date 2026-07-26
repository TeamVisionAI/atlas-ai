/**
 * Required Information vs Conversation Outcome separation verification.
 * Run: node backend/dev/verifyRequiredInformation.js
 */

require("dotenv").config();

const { postRequiredInformation } = require("../controllers/requiredInformationController");
const { postConversationOutcome } = require("../controllers/conversationOutcomeController");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { buildRequiredInputs, buildConversationOutcomeReadModel } = require("../core/conversationOutcomeEngine");
const { buildProfileFromProspect, getMissingFields } = require("../core/informationModel");
const { supabase } = require("../services/supabaseService");

const JUANA_PHONE = "+17862347083";
const PEDRO_PHONE = "+17867528080";
const ORIGINAL = {};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function inputKeys(readModel) {
  return (readModel?.requiredInputs || []).map((row) => row.key);
}

async function snapshotProspect(phone) {
  const { data } = await supabase.from("prospects").select("*").eq("phone", phone).maybeSingle();
  return data;
}

async function restoreJuana() {
  if (!ORIGINAL.juana) {
    return;
  }

  await supabase
    .from("prospects")
    .update({
      city: ORIGINAL.juana.city,
      state: ORIGINAL.juana.state,
      occupation: ORIGINAL.juana.occupation,
      work_authorized: ORIGINAL.juana.work_authorized,
      current_step: ORIGINAL.juana.current_step
    })
    .eq("phone", JUANA_PHONE);
}

async function resetJuanaToUnqualified() {
  await supabase
    .from("prospects")
    .update({
      city: null,
      state: null,
      occupation: null,
      work_authorized: null,
      current_step: "GREETING"
    })
    .eq("phone", JUANA_PHONE);
}

async function verifyJuanaThreeStepFlow() {
  console.log("\n--- Juana Maria: required information flow ---");

  ORIGINAL.juana = await snapshotProspect(JUANA_PHONE);
  assert(ORIGINAL.juana, `Juana ${JUANA_PHONE} not found`);

  await resetJuanaToUnqualified();

  const mcBefore = await getMissionControlWithActions(JUANA_PHONE);
  const beforeKeys = inputKeys(mcBefore.conversationOutcome);

  assert(beforeKeys.includes("city"), `Expected city in requiredInputs, got ${JSON.stringify(beforeKeys)}`);
  assert(
    beforeKeys.includes("occupation"),
    `Expected occupation in requiredInputs, got ${JSON.stringify(beforeKeys)}`
  );
  assert(
    beforeKeys.includes("work_authorization_status"),
    `Expected work_authorization_status in requiredInputs, got ${JSON.stringify(beforeKeys)}`
  );
  assert(!beforeKeys.includes("state"), "State must not appear before city is saved");

  const step1 = await postRequiredInformation(JUANA_PHONE, {
    fields: {
      city: "Miami",
      occupation: "Teacher",
      work_authorization_status: "work_permit"
    }
  });

  assert(step1.success === true, `Step 1 save failed: ${JSON.stringify(step1)}`);

  const dbAfterStep1 = await snapshotProspect(JUANA_PHONE);
  assert(dbAfterStep1.city === "Miami", "city persisted after step 1");
  assert(dbAfterStep1.occupation === "Teacher", "occupation persisted after step 1");
  assert(dbAfterStep1.work_authorized === true, "work authorization persisted after step 1");

  const afterStep1Keys = inputKeys(step1.missionControl.conversationOutcome);
  assert(!afterStep1Keys.includes("city"), "city removed from requiredInputs after step 1");
  assert(!afterStep1Keys.includes("occupation"), "occupation removed from requiredInputs after step 1");
  assert(
    !afterStep1Keys.includes("work_authorization_status"),
    "authorization removed from requiredInputs after step 1"
  );
  assert(afterStep1Keys.includes("state"), `Expected state required after step 1, got ${JSON.stringify(afterStep1Keys)}`);

  const step2 = await postRequiredInformation(JUANA_PHONE, {
    fields: {
      state: "FL"
    }
  });

  assert(step2.success === true, `Step 2 save failed: ${JSON.stringify(step2)}`);

  const dbAfterStep2 = await snapshotProspect(JUANA_PHONE);
  assert(dbAfterStep2.state === "FL", "state persisted after step 2");

  const afterStep2Keys = inputKeys(step2.missionControl.conversationOutcome);
  assert(afterStep2Keys.length === 0, `Expected no requiredInputs after step 2, got ${JSON.stringify(afterStep2Keys)}`);

  const requirementLabels = (step2.missionControl.conversationOutcome?.workflowRequirements || []).map(
    (item) => item.label
  );
  assert(
    requirementLabels.includes("Interview not scheduled"),
    `Expected workflow requirement after qualification, got ${JSON.stringify(requirementLabels)}`
  );

  const outcomeOnly = await postConversationOutcome(JUANA_PHONE, {
    outcome: "Information Collected"
  });

  assert(outcomeOnly.success === true, `Outcome-only save failed: ${JSON.stringify(outcomeOnly)}`);
  assert(outcomeOnly.missionControl, "Outcome save returns refreshed mission control");

  console.log("✓ Juana three-step flow passed");
}

async function verifyPedroRegression() {
  console.log("\n--- Pedro: qualified prospect regression ---");

  const mc = await getMissionControlWithActions(PEDRO_PHONE);
  assert(mc?.conversationOutcome, "Pedro conversation outcome read model returned");

  const requiredKeys = inputKeys(mc.conversationOutcome);
  assert(requiredKeys.length === 0, `Pedro should have no requiredInputs, got ${JSON.stringify(requiredKeys)}`);

  const requirementLabels = (mc.conversationOutcome.workflowRequirements || []).map((item) => item.label);
  assert(
    requirementLabels.includes("Interview not scheduled"),
    `Pedro should show interview workflow requirement, got ${JSON.stringify(requirementLabels)}`
  );

  const prospect = await snapshotProspect(PEDRO_PHONE);
  const profile = buildProfileFromProspect(prospect);
  const missingFields = getMissingFields(profile);
  const requiredInputs = buildRequiredInputs(prospect, profile, missingFields);

  assert(requiredInputs.length === 0, "buildRequiredInputs returns empty for Pedro");

  console.log("✓ Pedro regression passed");
}

async function verifyBuildRequiredInputsDeterministic() {
  console.log("\n--- buildRequiredInputs deterministic mapping ---");

  const prospect = {
    city: null,
    state: null,
    occupation: null,
    work_authorized: null,
    first_name: "Juana",
    last_name: "Maria"
  };
  const profile = buildProfileFromProspect(prospect);
  const missingFields = getMissingFields(profile);
  const inputs = buildRequiredInputs(prospect, profile, missingFields);
  const keys = inputs.map((row) => row.key);

  assert(keys.includes("city"), "city mapped");
  assert(keys.includes("occupation"), "occupation mapped");
  assert(keys.includes("work_authorization_status"), "authorization mapped to work_authorization_status");
  assert(!keys.includes("schedule"), "schedule excluded from requiredInputs");

  const qualifiedProspect = {
    ...prospect,
    city: "Miami",
    state: null,
    occupation: "Teacher",
    work_authorized: true
  };
  const qualifiedProfile = buildProfileFromProspect(qualifiedProspect);
  const qualifiedMissing = getMissingFields(qualifiedProfile);
  const qualifiedInputs = buildRequiredInputs(qualifiedProspect, qualifiedProfile, qualifiedMissing);

  assert(
    qualifiedInputs.map((row) => row.key).join(",") === "state",
    `After partial qualification expected state only, got ${JSON.stringify(qualifiedInputs)}`
  );

  console.log("✓ buildRequiredInputs mapping passed");
}

async function main() {
  console.log("=== Required Information Separation Verification ===");

  try {
    await verifyBuildRequiredInputsDeterministic();
    await verifyJuanaThreeStepFlow();
    await verifyPedroRegression();
    console.log("\nAll required information verification checks passed.");
  } finally {
    await restoreJuana();
  }
}

main().catch((error) => {
  console.error("\nVerification failed:", error.message);
  process.exit(1);
});
