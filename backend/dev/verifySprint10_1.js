/**
 * Sprint 10.1 — Quick Capture verification.
 * Run: node backend/dev/verifySprint10_1.js
 *
 * Requires migration 002_quick_capture.sql applied in Supabase.
 * Set ATLAS_BOOTSTRAP_TOKEN in .env for session bootstrap tests.
 */

require("dotenv").config();

const express = require("express");
const quickCaptureRoutes = require("../routes/quickCapture");
const {
  validateQuickCapturePayload,
  createQuickCaptureProspect
} = require("../core/quickCaptureEngine");
const { normalizePhoneNumber, formatPhoneForStorage } = require("../core/phoneNormalizer");
const { supabase, deleteProspect } = require("../services/supabaseService");
const { DEFAULT_USER_ID } = require("../services/atlasUserService");
const { runAllGoldenScenarios } = require("./goldenScenarios");

const TEST_BOOTSTRAP = process.env.ATLAS_BOOTSTRAP_TOKEN || "atlas-sprint-10-1-test-token";
process.env.ATLAS_BOOTSTRAP_TOKEN = TEST_BOOTSTRAP;
process.env.ATLAS_DEFAULT_USER_ID = process.env.ATLAS_DEFAULT_USER_ID || DEFAULT_USER_ID;

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

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", quickCaptureRoutes);
  return app;
}

async function getSessionToken(app) {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrapToken: TEST_BOOTSTRAP })
    });

    assert(response.status === 201, `Expected session 201, got ${response.status}`);
    const payload = await response.json();
    assert(payload.token, "Session token required");
    return payload.token;
  } finally {
    server.close();
  }
}

async function postQuickCapture(app, token, body) {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const headers = { "Content-Type": "application/json" };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`http://127.0.0.1:${port}/api/prospects/quick-capture`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  } finally {
    server.close();
  }
}

async function main() {
  console.log("=== Sprint 10.1 Quick Capture Verification ===\n");

  assert(normalizePhoneNumber("(305) 555-0199") === "13055550199", "Phone normalization");
  assert(
    formatPhoneForStorage("13055550199") === "+13055550199",
    "Phone storage format"
  );
  console.log("✓ Phone normalization");

  const missing = validateQuickCapturePayload({});
  assert(missing.valid === false, "Missing fields should fail validation");
  assert(missing.errors.fields.first_name, "first_name required");
  assert(missing.errors.fields.last_name, "last_name required");
  assert(missing.errors.fields.phone, "phone required");
  console.log("✓ Missing required fields validation");

  const automated = validateQuickCapturePayload({
    first_name: "Auto",
    last_name: "Lead",
    phone: "3055550100",
    communication_language: "en",
    entry_method: "FACEBOOK"
  });
  assert(automated.valid === false, "Automated entry method rejected");
  console.log("✓ Automated entry methods rejected");

  const app = createTestApp();
  const unauthorized = await postQuickCapture(app, null, {
    first_name: "No",
    last_name: "Auth",
    phone: "3055550101",
    communication_language: "en"
  });
  assert(unauthorized.status === 401, `Unauthorized expected 401, got ${unauthorized.status}`);
  console.log("✓ Unauthorized request");

  const token = await getSessionToken(app);
  const suffix = String(Date.now()).slice(-4);
  const rawPhone = `305555${suffix}`;
  const normalized = normalizePhoneNumber(rawPhone);

  const createdEs = await postQuickCapture(app, token, {
    first_name: "Maria",
    last_name: "Gonzalez",
    phone: rawPhone,
    communication_language: "es",
    source: "IN_PERSON"
  });

  assert(createdEs.status === 201, `Create ES expected 201, got ${createdEs.status}: ${JSON.stringify(createdEs.payload)}`);
  assert(createdEs.payload.prospect?.phone, "Created prospect phone required");
  createdPhones.push(createdEs.payload.prospect.phone);

  assert(
    createdEs.payload.prospect.owner_user_id === DEFAULT_USER_ID,
    "Owner should be authenticated user"
  );
  assert(
    createdEs.payload.prospect.created_by_user_id === DEFAULT_USER_ID,
    "Created by should be authenticated user"
  );
  assert(
    createdEs.payload.prospect.communication_language === "es",
    "Spanish communication language stored"
  );
  assert(
    createdEs.payload.prospect.preferred_communication_channel === "WHATSAPP",
    "Default preferred communication channel is WHATSAPP"
  );
  console.log("✓ Successful creation with automatic ownership (Spanish)");

  const duplicate = await postQuickCapture(app, token, {
    first_name: "Maria",
    last_name: "Duplicate",
    phone: `(305) 555-${suffix}`,
    communication_language: "es",
    source: "REFERRAL"
  });
  assert(duplicate.status === 409, `Duplicate expected 409, got ${duplicate.status}`);
  assert(duplicate.payload.prospect?.phone, "Duplicate response includes existing prospect");
  console.log("✓ Duplicate prevention (409)");

  const createdEnPhone = `305556${suffix}`;
  const createdEn = await postQuickCapture(app, token, {
    first_name: "James",
    last_name: "Carter",
    phone: createdEnPhone,
    communication_language: "en",
    source: "NETWORKING"
  });
  assert(createdEn.status === 201, `Create EN expected 201, got ${createdEn.status}`);
  createdPhones.push(createdEn.payload.prospect.phone);
  assert(
    createdEn.payload.prospect.communication_language === "en",
    "English communication language stored"
  );
  console.log("✓ English prospect creation");

  const { data: stored } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", createdEs.payload.prospect.phone)
    .maybeSingle();

  if (stored?.normalized_phone) {
    assert(stored.normalized_phone === normalized, "Normalized phone persisted");
  }

  if (stored?.entry_method) {
    assert(stored.entry_method === "QUICK_CAPTURE", "entry_method QUICK_CAPTURE");
  }

  if (stored?.prospect_number) {
    assert(/^TV-\d{6}$/.test(stored.prospect_number), "Prospect number format TV-000001");
  }

  console.log("✓ Persisted Quick Capture metadata when migration applied");

  console.log("\n--- Golden Scenarios ---");
  const golden = await runAllGoldenScenarios();
  console.log(`Golden: ${golden.passed}/${golden.total} passed`);
  assert(golden.failed === 0, `${golden.failed} golden scenario(s) failed`);

  await cleanupAll();

  console.log("\n=== All Sprint 10.1 checks passed ===");
}

main().catch(async (error) => {
  console.error("\n✗", error.message);
  await cleanupAll();
  process.exit(1);
});
