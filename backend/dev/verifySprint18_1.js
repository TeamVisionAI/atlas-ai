/**
 * Sprint 18.1 — Quick Capture guided workflow verification.
 * Run: node backend/dev/verifySprint18_1.js
 */

require("dotenv").config();

const {
  RECOMMENDED_ACTIONS,
  buildQuickCaptureGuidance,
  resolveQuickCaptureRecommendedAction
} = require("../core/quickCaptureRecommendationEngine");
const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
const { supabase, deleteProspect } = require("../services/supabaseService");
const { DEFAULT_USER_ID } = require("../services/atlasUserService");

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const createdPhones = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanupPhone(phone) {
  if (!phone) {
    return;
  }

  try {
    await deleteProspect(phone);
  } catch {
    // ignore cleanup failures
  }
}

async function cleanupAll() {
  for (const phone of createdPhones) {
    await cleanupPhone(phone);
  }
}

async function main() {
  console.log("=== Sprint 18.1 Quick Capture Guided Workflow Verification ===\n");

  const newProspect = {
    first_name: "Guided",
    last_name: "Workflow",
    phone: null,
    city: null,
    state: null,
    occupation: null,
    work_authorized: null,
    current_step: "NEW"
  };

  assert(
    resolveQuickCaptureRecommendedAction(newProspect) ===
      RECOMMENDED_ACTIONS.REQUIRED_INFORMATION,
    "New prospect should recommend required_information"
  );

  const guidance = buildQuickCaptureGuidance(newProspect);
  assert(guidance.recommendedAction === RECOMMENDED_ACTIONS.REQUIRED_INFORMATION, "Guidance action");
  assert(guidance.estimatedMinutes === 2, "Guidance estimated minutes");
  console.log("✓ Workflow engine returns required_information for new prospect");

  const suffix = String(Date.now()).slice(-4);
  const atlasUser = {
    id: DEFAULT_USER_ID,
    organization_id: ORGANIZATION_ID
  };

  const created = await createQuickCaptureProspect(
    {
      first_name: "Guided",
      last_name: "Workflow",
      phone: `305559${suffix}`,
      preferred_language: "english",
      source: "IN_PERSON"
    },
    atlasUser
  );

  assert(created.status === 201, `Create expected 201, got ${created.status}`);
  assert(
    created.body.recommendedAction === RECOMMENDED_ACTIONS.REQUIRED_INFORMATION,
    `Expected required_information, got ${created.body.recommendedAction}`
  );
  assert(created.body.estimatedMinutes === 2, "Estimated minutes returned");
  assert(created.body.prospect?.phone, "Prospect phone returned");
  createdPhones.push(created.body.prospect.phone);

  const { data: stored } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", created.body.prospect.phone)
    .maybeSingle();

  assert(stored, "Prospect persisted");
  assert(
    resolveQuickCaptureRecommendedAction(stored) === RECOMMENDED_ACTIONS.REQUIRED_INFORMATION,
    "Persisted prospect still recommends required_information"
  );
  console.log("✓ Quick Capture API returns recommendedAction and estimatedMinutes");

  await cleanupAll();
  console.log("\n=== All Sprint 18.1 checks passed ===");
}

main().catch(async (error) => {
  console.error("\n✗", error.message);
  await cleanupAll();
  process.exit(1);
});
