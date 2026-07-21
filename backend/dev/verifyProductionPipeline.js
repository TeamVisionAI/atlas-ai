/**
 * Production MVP pipeline readiness verification.
 * Run: node backend/dev/verifyProductionPipeline.js
 */
require("dotenv").config();

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  evaluateProductionReadiness
} = require("../core/productionReadiness");
const {
  resolveWhatsAppSendCredentials,
  graphApiVersion
} = require("../core/whatsappSendCredentials");

const repoRoot = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function verifyCredentialResolverStructure() {
  const outboundSource = read("backend/core/whatsappOutboundPipeline.js");

  assert.match(
    outboundSource,
    /resolveWhatsAppSendCredentials/,
    "Outbound pipeline must resolve send credentials dynamically"
  );
  assert.doesNotMatch(
    outboundSource,
    /graph\.facebook\.com\/v25\.0/,
    "Outbound must not hardcode Graph API v25"
  );

  const version = graphApiVersion();
  assert.match(version, /^v\d+\.\d+$/, "Graph API version format valid");
  console.log("✓ WhatsApp send credential resolver wired in outbound pipeline");
}

async function verifyHealthEndpointModule() {
  const healthSource = read("backend/routes/health.js");
  assert.match(healthSource, /\/production/, "Health route exposes /production readiness");
  assert.match(healthSource, /evaluateProductionReadiness/, "Health uses production readiness engine");
  console.log("✓ GET /health/production endpoint defined");
}

async function verifyReadinessReportShape() {
  const report = await evaluateProductionReadiness();

  assert.ok(Array.isArray(report.checks), "checks array present");
  assert.ok(typeof report.mvpReady === "boolean", "mvpReady boolean present");
  assert.ok(report.checks.some((c) => c.id === "whatsapp_send"), "whatsapp_send check present");
  assert.ok(report.checks.some((c) => c.id === "google_calendar"), "google_calendar check present");

  console.log("✓ Production readiness report shape valid");
  console.log(`  mvpReady=${report.mvpReady}, blockers=[${report.mvpBlockers.join(", ")}]`);
}

async function verifyCredentialFallbackBehavior() {
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;

  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;

  try {
    const credentials = await resolveWhatsAppSendCredentials();
    assert.ok(
      credentials === null || typeof credentials.source === "string",
      "Resolver returns null or valid credentials object"
    );
    console.log("✓ Credential resolver handles missing env without throwing");
  } finally {
    if (originalToken) {
      process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    }
    if (originalPhone) {
      process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhone;
    }
  }
}

async function main() {
  console.log("=== Production Pipeline Readiness Verification ===\n");

  await verifyCredentialResolverStructure();
  await verifyHealthEndpointModule();
  await verifyReadinessReportShape();
  await verifyCredentialFallbackBehavior();

  console.log("\n=== All production pipeline readiness checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
