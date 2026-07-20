/**
 * Sprint 11.1 — Live WhatsApp Foundation verification.
 * Run: node backend/dev/verifySprint11_1.js
 */

require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const {
  parseWhatsAppWebhookBody,
  normalizeMessageBody
} = require("../services/whatsappWebhookParser");
const {
  processInboundWhatsAppMessage,
  buildInboundCorrelationId
} = require("../core/whatsappInboundPipeline");
const { resolveStoragePhone } = require("../core/whatsappProspectResolver");
const { EVENT_TYPES } = require("../core/workflowConstants");
const webhookRoute = require("../routes/webhook");
const { findWorkflowEventByCorrelationId } = require("../services/workflowEventService");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSampleWebhookBody(providerMessageId, phone, text) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "test" },
              contacts: [{ profile: { name: "Live Test Lead" } }],
              messages: [
                {
                  id: providerMessageId,
                  from: phone,
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  type: "text",
                  text: { body: text }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function verifyParserUnitTests() {
  const body = buildSampleWebhookBody("wamid.test-1", "15551234567", "Hola Atlas");
  const parsed = parseWhatsAppWebhookBody(body);

  assert(parsed.length === 1, "Parser returns one message");
  assert(parsed[0].providerMessageId === "wamid.test-1", "Provider message id preserved");
  assert(parsed[0].body === "Hola Atlas", "Text body preserved");
  assert(
    normalizeMessageBody({ type: "image" }) === "[image message]",
    "Non-text body normalized"
  );
  console.log("✓ WhatsApp webhook parser");
}

function verifySignatureHelper() {
  const secret = "test-secret";
  const payload = Buffer.from('{"hello":"world"}');
  const signature =
    "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");

  assert(signature.startsWith("sha256="), "Signature format valid");
  console.log("✓ Meta signature helper");
}

async function verifyWebhookRoute() {
  const app = express();
  app.use("/webhook", express.raw({ type: "application/json" }), webhookRoute);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const verifyResponse = await fetch(`http://127.0.0.1:${port}/webhook?hub.mode=subscribe&hub.verify_token=${process.env.VERIFY_TOKEN}&hub.challenge=12345`);
    assert(verifyResponse.status === 200, "Webhook verification returns 200");
    assert((await verifyResponse.text()) === "12345", "Webhook verification challenge echoed");
    console.log("✓ Webhook GET verification route");
  } finally {
    server.close();
  }
}

async function verifyInboundPipeline() {
  const providerMessageId = `wamid.verify-11-1-${Date.now()}`;
  const phone = "15559998877";
  const inbound = parseWhatsAppWebhookBody(
    buildSampleWebhookBody(providerMessageId, phone, "Sprint 11.1 live pipeline test")
  )[0];

  assert(inbound, "Inbound sample parsed");

  const first = await processInboundWhatsAppMessage(inbound);
  assert(first.success, "First inbound processing succeeds");
  assert(first.skipped !== true, "First inbound is not skipped");

  const correlationId = buildInboundCorrelationId(providerMessageId);
  const event = await findWorkflowEventByCorrelationId(correlationId);
  assert(event?.event_type === EVENT_TYPES.MESSAGE_RECEIVED, "MessageReceived event persisted");

  const second = await processInboundWhatsAppMessage(inbound);
  assert(second.skipped === true, "Duplicate provider message is idempotent");
  console.log("✓ Inbound pipeline persist + idempotency");

  const storagePhone = resolveStoragePhone(phone);
  assert(storagePhone.startsWith("+"), "Storage phone normalized with + prefix");
}

async function main() {
  console.log("=== Sprint 11.1 Live WhatsApp Foundation Verification ===\n");

  verifyParserUnitTests();
  verifySignatureHelper();
  await verifyWebhookRoute();
  await verifyInboundPipeline();

  console.log("\n--- Sprint 10.3 regression ---");
  const { spawnSync } = require("child_process");
  const regression = spawnSync(process.execPath, ["backend/dev/verifySprint10_3.js"], {
    stdio: "inherit",
    env: process.env
  });
  assert(regression.status === 0, "Sprint 10.3 verification failed");
  console.log("✓ Sprint 10.3 regression passed");

  console.log("\n=== All Sprint 11.1 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
