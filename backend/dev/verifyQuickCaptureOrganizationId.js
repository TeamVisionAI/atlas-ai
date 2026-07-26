/**
 * W-005 — Quick Capture organization_id verification.
 * Run: node backend/dev/verifyQuickCaptureOrganizationId.js
 */

require("dotenv").config();

const {
  createQuickCaptureProspect,
  resolveQuickCaptureOrganizationId
} = require("../core/quickCaptureEngine");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const { supabase, deleteProspect } = require("../services/supabaseService");
const { DEFAULT_USER_ID } = require("../services/atlasUserService");

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const BACKFILLED_PHONES = ["+17867528080", "+17862347083"];
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

async function loadDashboardProspectsForOrganization(organizationId) {
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  return filterProductionProspects(data || []);
}

async function main() {
  console.log("=== W-005 Quick Capture organization_id Verification ===\n");

  const missingOrg = await createQuickCaptureProspect(
    {
      first_name: "No",
      last_name: "Organization",
      phone: "3055559901",
      communication_language: "en"
    },
    { id: "00000000-0000-4000-8000-000000000099" }
  );

  assert(missingOrg.status === 400, `Missing organization expected 400, got ${missingOrg.status}`);
  assert(
    missingOrg.body?.message ===
      "Authenticated Atlas user has no organization_id. Prospect cannot be created.",
    "Missing organization message"
  );
  console.log("✓ Creation fails when atlasUser.organization_id is missing");

  const resolved = resolveQuickCaptureOrganizationId({
    id: DEFAULT_USER_ID,
    organization_id: ORGANIZATION_ID
  });
  assert(resolved.ok === true, "Organization resolver should succeed");
  assert(resolved.organizationId === ORGANIZATION_ID, "Organization resolver returns user org");
  console.log("✓ resolveQuickCaptureOrganizationId returns atlasUser.organization_id");

  const suffix = String(Date.now()).slice(-4);
  const rawPhone = `305557${suffix}`;
  const atlasUser = {
    id: DEFAULT_USER_ID,
    organization_id: ORGANIZATION_ID
  };

  const created = await createQuickCaptureProspect(
    {
      first_name: "Org",
      last_name: "Scoped",
      phone: rawPhone,
      communication_language: "en",
      source: "REFERRAL"
    },
    atlasUser
  );

  assert(
    created.status === 201,
    `Create expected 201, got ${created.status}: ${JSON.stringify(created.body)}`
  );
  createdPhones.push(created.body.prospect.phone);

  const { data: stored } = await supabase
    .from("prospects")
    .select("phone, organization_id, entry_method, owner_user_id")
    .eq("phone", created.body.prospect.phone)
    .maybeSingle();

  assert(stored, "Created prospect persisted");
  assert(
    stored.organization_id === ORGANIZATION_ID,
    `Expected organization_id ${ORGANIZATION_ID}, got ${stored.organization_id}`
  );
  assert(stored.entry_method === "QUICK_CAPTURE", "entry_method preserved");
  assert(stored.owner_user_id === DEFAULT_USER_ID, "owner_user_id preserved");
  console.log("✓ Quick Capture inserts organization_id from atlasUser");

  const dashboardProspects = await loadDashboardProspectsForOrganization(ORGANIZATION_ID);
  const inQueue = dashboardProspects.some(
    (prospect) => prospect.phone === created.body.prospect.phone
  );
  assert(inQueue, "Created prospect appears in Mission Control dashboard source query");
  console.log("✓ Quick Capture prospect appears in org-scoped dashboard prospects");

  for (const phone of BACKFILLED_PHONES) {
    const backfilled = dashboardProspects.find((prospect) => prospect.phone === phone);
    assert(backfilled, `Backfilled prospect ${phone} appears in dashboard source query`);
    assert(
      backfilled.organization_id === ORGANIZATION_ID,
      `Backfilled prospect ${phone} has organization_id set`
    );
  }
  console.log("✓ Backfilled Pedro and Juana Maria appear in org-scoped dashboard prospects");

  await cleanupAll();
  console.log("\n=== All W-005 checks passed ===");
}

main().catch(async (error) => {
  console.error("\n✗", error.message);
  await cleanupAll();
  process.exit(1);
});
