#!/usr/bin/env node
/**
 * Sprint 20.1 — WhatsApp Embedded Signup integration verification.
 * Run: node backend/dev/verifySprint20WhatsAppIntegration.js
 */

require("dotenv").config();

const {
  createJsonMetaWhatsAppConnectionRepository
} = require("../repositories/jsonMetaWhatsAppConnectionRepository");
const { toSafeConnection } = require("../repositories/metaConnectionRepositoryInterface");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");

const TEST_ORG_ID = process.env.WHATSAPP_TEST_ORG_ID || "00000000-0000-4000-8000-000000000001";
const repository = createJsonMetaWhatsAppConnectionRepository();

function assert(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`FAILED: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  console.log(`PASS: ${name}`);
}

async function runRepositoryTests() {
  const tokenEncryption = createTokenEncryption();
  const now = new Date().toISOString();

  const saved = await repository.saveConnection(TEST_ORG_ID, {
    business_id: "business-123",
    waba_id: "waba-123",
    phone_number_id: "phone-456",
    connection_type: "whatsapp_business_app",
    status: "connected",
    access_token: "test-access-token",
    display_phone_number: "+1 786-752-8080",
    business_name: "Team Vision Financial",
    verified_name: "Team Vision Financial",
    connected_at: now,
    last_sync_at: now
  });

  assert("saveConnection persists org-scoped record", saved.organization_id === TEST_ORG_ID);
  assert("saveConnection encrypts token", tokenEncryption.isEncrypted(saved.access_token_encrypted));

  const safe = toSafeConnection(saved);
  assert("toSafeConnection hides token", !("access_token" in safe) && !("access_token_encrypted" in safe));
  assert("toSafeConnection exposes business metadata", safe.businessName === "Team Vision Financial");
  assert("toSafeConnection exposes businessId", safe.businessId === "business-123");

  const decrypted = await repository.getDecryptedAccessToken(TEST_ORG_ID);
  assert("getDecryptedAccessToken round-trip", decrypted === "test-access-token");

  const roundTrip = await repository.getConnection(TEST_ORG_ID);
  assert("getConnection round-trip", roundTrip?.waba_id === "waba-123");

  const disconnected = await repository.disconnectConnection(TEST_ORG_ID);
  assert("disconnect clears token", !disconnected.access_token_encrypted);
  assert("disconnect sets status", disconnected.status === "disconnected");

  const afterDisconnect = await repository.getDecryptedAccessToken(TEST_ORG_ID);
  assert("token unavailable after disconnect", afterDisconnect === null);
}

async function main() {
  console.log("Sprint 20.1 WhatsApp Integration Verification\n");
  await runRepositoryTests();
  console.log("\nSprint 20.1 verification complete.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { runRepositoryTests };
