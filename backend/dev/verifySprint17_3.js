/**
 * Sprint 17.3 — Quick Capture preferred language verification.
 * Run: node backend/dev/verifySprint17_3.js
 */

require("dotenv").config();

const { createQuickCaptureProspect, validateQuickCapturePayload } = require("../core/quickCaptureEngine");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { resolveProspectPreferredLanguage } = require("../core/prospectLanguage");
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

function findKnownLanguage(missionControl) {
  return (missionControl?.conversationOutcome?.knownInformation || []).find(
    (item) => item.key === "preferred_language"
  );
}

async function verifyProspectLanguage(suffix, preferredLanguage, expectedLabel) {
  const rawPhone = `305558${suffix}`;
  const atlasUser = {
    id: DEFAULT_USER_ID,
    organization_id: ORGANIZATION_ID
  };

  const result = await createQuickCaptureProspect(
    {
      first_name: preferredLanguage === "spanish" ? "Prospecto" : "Prospect",
      last_name: preferredLanguage === "spanish" ? "Prueba" : "Test",
      phone: rawPhone,
      preferred_language: preferredLanguage,
      source: "IN_PERSON"
    },
    atlasUser
  );

  assert(
    result.status === 201,
    `Create ${preferredLanguage} expected 201, got ${result.status}: ${JSON.stringify(result.body)}`
  );

  const phone = result.body.prospect.phone;
  createdPhones.push(phone);

  assert(
    result.body.prospect.preferred_language === preferredLanguage,
    `API summary preferred_language should be ${preferredLanguage}`
  );
  assert(
    result.body.prospect.preferred_language_label === expectedLabel,
    `API summary label should be ${expectedLabel}`
  );

  const { data: stored } = await supabase.from("prospects").select("*").eq("phone", phone).maybeSingle();
  assert(stored, "Prospect persisted");

  const resolvedPreferred = stored.preferred_language || resolveProspectPreferredLanguage(stored);
  assert(
    resolvedPreferred === preferredLanguage,
    `Stored preferred_language should be ${preferredLanguage}, got ${resolvedPreferred}`
  );

  if (stored.communication_language) {
    assert(
      stored.communication_language === (preferredLanguage === "spanish" ? "es" : "en"),
      "communication_language synced for AI pipelines"
    );
  }

  const missionControl = await getMissionControlWithActions(phone);
  const knownLanguage = findKnownLanguage(missionControl);

  assert(knownLanguage, "Mission Control known information includes preferred language");
  assert(
    knownLanguage.label === "Preferred Language",
    `Known information label should be Preferred Language, got ${knownLanguage.label}`
  );
  assert(
    knownLanguage.value === expectedLabel,
    `Mission Control should display ${expectedLabel}, got ${knownLanguage.value}`
  );

  console.log(`✓ Prospect (${preferredLanguage}) stored and displayed as ${expectedLabel}`);
}

async function main() {
  console.log("=== Sprint 17.3 Quick Capture Preferred Language Verification ===\n");

  const missingLanguage = validateQuickCapturePayload({
    first_name: "No",
    last_name: "Language",
    phone: "3055550177"
  });
  assert(missingLanguage.valid === false, "Missing preferred_language should fail validation");
  assert(missingLanguage.errors.fields.preferred_language, "preferred_language required");
  console.log("✓ Backend requires preferred_language");

  const invalidLanguage = validateQuickCapturePayload({
    first_name: "Bad",
    last_name: "Language",
    phone: "3055550178",
    preferred_language: "french"
  });
  assert(invalidLanguage.valid === false, "Invalid preferred_language rejected");
  console.log("✓ Backend rejects unsupported language values");

  const legacyMapped = validateQuickCapturePayload({
    first_name: "Legacy",
    last_name: "Compat",
    phone: "3055550179",
    communication_language: "es"
  });
  assert(legacyMapped.valid === true, "Legacy communication_language maps to preferred_language");
  assert(legacyMapped.data.preferredLanguage === "spanish", "Legacy es maps to spanish");
  console.log("✓ Legacy communication_language payload mapped for compatibility");

  const suffix = String(Date.now()).slice(-4);
  await verifyProspectLanguage(`${suffix}1`, "english", "English");
  await verifyProspectLanguage(`${suffix}2`, "spanish", "Spanish");

  await cleanupAll();

  console.log("\n=== All Sprint 17.3 checks passed ===");
}

main().catch(async (error) => {
  console.error("\n✗", error.message);
  await cleanupAll();
  process.exit(1);
});
