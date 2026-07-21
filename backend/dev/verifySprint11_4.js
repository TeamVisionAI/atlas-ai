/**
 * Sprint 11.4 Phase A — Conversation Engine live wiring verification.
 * Run: node backend/dev/verifySprint11_4.js
 */

require("dotenv").config();

const { withSimulatorGuard } = require("./simulatorGuard");
const {
  parseWhatsAppWebhookBody
} = require("../services/whatsappWebhookParser");
const {
  processInboundWhatsAppMessage,
  buildInboundCorrelationId
} = require("../core/whatsappInboundPipeline");
const { buildNormalizedMessageFromWhatsApp } = require("../core/channelMessage");
const {
  processNormalizedInboundMessage,
  shouldDeliverAutomatedReply
} = require("../core/communicationHub");
const { resolveStoragePhone } = require("../core/whatsappProspectResolver");
const { EVENT_TYPES } = require("../core/workflowConstants");
const { findWorkflowEventByCorrelationId } = require("../services/workflowEventService");
const { findProspect } = require("../services/supabaseService");

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
              contacts: [{ profile: { name: "Sprint 11.4 Lead" } }],
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

function verifyNormalizedMessage() {
  const inbound = parseWhatsAppWebhookBody(
    buildSampleWebhookBody("wamid.norm-1", "15551112233", "Hola")
  )[0];
  const storagePhone = resolveStoragePhone(inbound.phone);
  const normalized = buildNormalizedMessageFromWhatsApp(inbound, storagePhone);

  assert(normalized.channel === "whatsapp", "Normalized channel is whatsapp");
  assert(normalized.phone === storagePhone, "Normalized phone uses storage key");
  assert(normalized.text === "Hola", "Normalized text preserved");
  assert(normalized.providerMessageId === "wamid.norm-1", "Provider id preserved");
  assert(!normalized.rawMessage, "Normalized message excludes Meta raw payload");
  console.log("✓ Normalized channel message envelope");
}

async function verifyProductionPipelineWithEngine() {
  const providerMessageId = `wamid.verify-11-4-${Date.now()}`;
  const phone = "15554443322";
  const inbound = parseWhatsAppWebhookBody(
    buildSampleWebhookBody(providerMessageId, phone, "Hello Atlas Sprint 11.4")
  )[0];

  const result = await withSimulatorGuard(async () =>
    processInboundWhatsAppMessage(inbound)
  );

  assert(result.success, "Inbound pipeline succeeds");
  assert(result.conversation, "Conversation hub result present");
  assert(
    result.conversation.success !== false,
    "Conversation engine path completes without fatal error"
  );
  assert(
    typeof result.conversation.replyText === "string" &&
      result.conversation.replyText.length > 0,
    "Conversation Engine returns reply text"
  );
  assert(result.conversation.replied === true, "Outbound pipeline delivers reply (mocked)");

  const inboundCorrelation = buildInboundCorrelationId(providerMessageId);
  const inboundEvent = await findWorkflowEventByCorrelationId(inboundCorrelation);
  assert(
    inboundEvent?.event_type === EVENT_TYPES.MESSAGE_RECEIVED,
    "Single inbound MessageReceived event (no duplicate from engine)"
  );

  const storagePhone = resolveStoragePhone(phone);
  const prospect = await findProspect(storagePhone);
  assert(prospect, "Prospect exists after inbound");

  console.log("✓ Production inbound → engine → outbound pipeline (mocked delivery)");
}

async function verifyDuplicateSkipsEngine() {
  const providerMessageId = `wamid.verify-11-4-dup-${Date.now()}`;
  const phone = "15553334455";
  const inbound = parseWhatsAppWebhookBody(
    buildSampleWebhookBody(providerMessageId, phone, "Duplicate test")
  )[0];

  await withSimulatorGuard(async () => processInboundWhatsAppMessage(inbound));
  const second = await withSimulatorGuard(async () =>
    processInboundWhatsAppMessage(inbound)
  );

  assert(second.skipped === true, "Duplicate provider message skipped");
  assert(!second.conversation, "Engine not invoked on duplicate");
  console.log("✓ Duplicate inbound remains idempotent");
}

async function verifySimulatorUsesHub() {
  const phone = "+15556667788";
  let prospect = await findProspect(phone);

  if (!prospect) {
    const { createProspect } = require("../services/supabaseService");
    await createProspect(phone, "Simulator Hub Test", "seed");
    prospect = await findProspect(phone);
  }

  assert(prospect, "Simulator prospect available");

  const hubResult = await withSimulatorGuard(async () =>
    processNormalizedInboundMessage(
      {
        channel: "simulator",
        providerMessageId: `sim-verify-${Date.now()}`,
        phone,
        contactName: prospect.name,
        text: "Hi from simulator hub test",
        messageType: "text",
        timestamp: new Date().toISOString()
      },
      { prospect }
    )
  );

  assert(hubResult.success, "Simulator hub path succeeds");
  assert(hubResult.reason === "NON_WHATSAPP_CHANNEL", "Simulator skips WhatsApp transport");
  assert(
    typeof hubResult.replyText === "string" && hubResult.replyText.length > 0,
    "Simulator hub returns engine reply text"
  );
  console.log("✓ Simulator routes through Communication Hub");
}

async function verifyBusinessRulesGateHelper() {
  const prospect = {
    phone: "+10000000001",
    current_step: "QUALIFYING"
  };

  assert(shouldDeliverAutomatedReply(prospect) === true, "Default prospect allows automated reply");

  const closed = {
    ...prospect,
    current_step: "CLOSED"
  };

  assert(shouldDeliverAutomatedReply(closed) === false, "Closed prospect blocks automated reply");
  console.log("✓ Automated reply business-rules gate");
}

async function main() {
  console.log("=== Sprint 11.4 Phase A Verification ===\n");

  verifyNormalizedMessage();
  await verifyBusinessRulesGateHelper();
  await verifySimulatorUsesHub();
  await verifyProductionPipelineWithEngine();
  await verifyDuplicateSkipsEngine();

  console.log("\n--- Sprint 11.1 regression ---");
  const { spawnSync } = require("child_process");
  const regression = spawnSync(process.execPath, ["backend/dev/verifySprint11_1.js"], {
    stdio: "inherit",
    env: process.env
  });
  assert(regression.status === 0, "Sprint 11.1 verification failed");
  console.log("✓ Sprint 11.1 regression passed");

  console.log("\n=== All Sprint 11.4 Phase A checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
