/**
 * Mission Control qualification refresh verification.
 * Run: node backend/dev/verifyMissionControlQualification.js
 */

require("dotenv").config();

const { postConversationOutcome } = require("../controllers/conversationOutcomeController");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { buildProfileFromProspect, getEffectiveInterviewType, getMissingFields } = require("../core/informationModel");
const { assessQualificationFromProspect } = require("../core/recruitingQualificationEngine");
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

async function restoreProspect(phone) {
  if (!ORIGINAL.prospect) {
    return;
  }

  await supabase
    .from("prospects")
    .update({
      city: ORIGINAL.prospect.city,
      state: ORIGINAL.prospect.state,
      occupation: ORIGINAL.prospect.occupation,
      work_authorized: ORIGINAL.prospect.work_authorized,
      interview_type: ORIGINAL.prospect.interview_type,
      current_step: ORIGINAL.prospect.current_step
    })
    .eq("phone", phone);
}

async function caseAQualificationCompletion() {
  console.log("\n--- Case A: Qualification completion ---");

  await supabase
    .from("prospects")
    .update({
      city: null,
      state: null,
      occupation: null,
      work_authorized: null,
      interview_type: null,
      current_step: "GREETING"
    })
    .eq("phone", TEST_PHONE);

  const suffix = String(Date.now()).slice(-4);
  const result = await postConversationOutcome(TEST_PHONE, {
    outcome: "Information Collected",
    fields: {
      city: "Miami",
      state: "FL",
      occupation: `Teacher-${suffix}`,
      work_authorization_status: "work_permit"
    }
  });

  assert(result.success === true, `Save failed: ${JSON.stringify(result)}`);

  const mc = result.missionControl;
  const db = await snapshotProspect(TEST_PHONE);

  assert(db.city === "Miami", "city persisted");
  assert(db.state === "FL", "state persisted");
  assert(db.occupation === `Teacher-${suffix}`, "occupation persisted");
  assert(db.work_authorized === true, "work authorization persisted");

  const gapKeys = (mc.conversationOutcome?.knowledgeGaps || []).map((gap) => gap.key);
  assert(!gapKeys.includes("city"), "city removed from knowledge gaps");
  assert(!gapKeys.includes("occupation"), "occupation removed from knowledge gaps");
  assert(!gapKeys.includes("work_authorization_status"), "authorization removed from knowledge gaps");

  const requirementLabels = (mc.workflowRequirements || []).map((item) => item.label);
  assert(
    requirementLabels.includes("Interview not scheduled"),
    `Expected workflow requirement, got ${JSON.stringify(requirementLabels)}`
  );

  assert(
    mc.aiActionCenter?.nextBestAction === "Schedule interview",
    `Expected Schedule interview, got ${mc.aiActionCenter?.nextBestAction}`
  );
  assert(
    !/^Collect schedule/i.test(String(mc.aiActionCenter?.nextBestAction || "")),
    "Must not show Collect schedule"
  );
  assert(
    String(mc.aiActionCenter?.reason || "").includes("qualified"),
    `Expected qualified scheduling reason, got ${mc.aiActionCenter?.reason}`
  );

  const briefText = (mc.atlasBrief?.summary || []).join(" ").toLowerCase();
  assert(!briefText.includes("waiting for: city"), "brief must not wait for city");
  assert(!briefText.includes("waiting for: occupation"), "brief must not wait for occupation");
  assert(!briefText.includes("waiting for: authorization"), "brief must not wait for authorization");

  console.log("✓ Case A passed");
}

async function caseBInferredInterviewType() {
  console.log("\n--- Case B: Inferred interview type ---");

  const prospect = await snapshotProspect(TEST_PHONE);
  const profile = buildProfileFromProspect(prospect);
  const effectiveType = getEffectiveInterviewType(profile);
  const assessment = assessQualificationFromProspect(prospect);
  const mc = await getMissionControlWithActions(TEST_PHONE);

  assert(Boolean(effectiveType), "effective interview type should resolve for Miami prospect");
  assert(
    getMissingFields(profile).includes("schedule"),
    "information model should only require schedule after qualification"
  );
  assert(assessment.isQualified === true, "qualification engine should mark prospect qualified");
  assert(
    assessment.readyForScheduling === true,
    "qualification engine should mark ready for scheduling"
  );
  assert(
    mc.aiActionCenter?.nextBestAction === "Schedule interview",
    `Expected Schedule interview, got ${mc.aiActionCenter?.nextBestAction}`
  );

  console.log("✓ Case B passed");
}

async function caseCHumanCorrection() {
  console.log("\n--- Case C: Human correction overwrite ---");

  await supabase
    .from("prospects")
    .update({ city: "Miami", state: "FL" })
    .eq("phone", TEST_PHONE);

  const result = await postConversationOutcome(TEST_PHONE, {
    outcome: "Information Collected",
    fields: {
      city: "Tampa"
    }
  });

  assert(result.success === true, `Correction save failed: ${JSON.stringify(result)}`);

  const db = await snapshotProspect(TEST_PHONE);
  assert(db.city === "Tampa", `Expected Tampa after correction, got ${db.city}`);
  assert(result.missionControl?.prospect?.city === "Tampa", "response prospect city should be Tampa");

  const refreshed = await getMissionControlWithActions(TEST_PHONE);
  assert(refreshed.prospect?.city === "Tampa", "re-fetch prospect city should be Tampa");

  console.log("✓ Case C passed");
}

async function main() {
  console.log("=== Mission Control Qualification Verification ===");

  ORIGINAL.prospect = await snapshotProspect(TEST_PHONE);
  assert(ORIGINAL.prospect, `Prospect ${TEST_PHONE} not found`);

  await caseAQualificationCompletion();
  await caseBInferredInterviewType();
  await caseCHumanCorrection();

  await restoreProspect(TEST_PHONE);

  console.log("\n=== All Mission Control qualification checks passed ===");
  console.log("Case D (dashboard queue refresh) is covered by Dashboard.jsx queue patch on save.");
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
