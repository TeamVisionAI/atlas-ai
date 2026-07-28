/**
 * Sprint 20.1.4 — Integrations endpoint verification.
 */

require("dotenv").config();

const assert = require("assert");
const orgSvc = require("../services/organizationIntegrationService");

const orgId = process.env.DEFAULT_ORG_ID || "00000000-0000-4000-8000-000000000001";

async function run() {
  const integrations = await orgSvc.getIntegrationsStatus(orgId);

  assert.ok(integrations, "integrations payload should be returned");
  assert.ok(integrations.googleCalendar, "googleCalendar section should exist");
  assert.ok(integrations.whatsapp, "whatsapp section should exist");
  assert.strictEqual(typeof integrations.googleCalendar.connected, "boolean");
  assert.strictEqual(typeof integrations.whatsapp.connected, "boolean");

  console.log("PASS: getIntegrationsStatus returns disconnected-safe payload");
  console.log(JSON.stringify(integrations, null, 2));
}

run().catch((error) => {
  console.error("FAILED:", error.code || error.message);
  process.exit(1);
});
