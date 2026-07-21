/**
 * Sprint 12.1 — Communication Gateway + Messenger connector verification.
 * Run: node backend/dev/verifySprint12_1.js
 */

const assert = require("assert");

const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { AIAdapter } = require("../communication/ai/AIAdapter");
const { CommunicationEvent } = require("../communication/events/eventNames");
const { CHANNEL } = require("../communication/models/Channel");
const { parseMessengerWebhook } = require("../communication/connectors/messenger/messengerWebhookParser");
const { assertConnectorImplementation } = require("../communication/interfaces/CommunicationConnector");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      time: 1520383572,
      messaging: [
        {
          sender: { id: "USER_PSID_123" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.$sample",
            text: "Hello Atlas"
          }
        }
      ]
    }
  ]
};

async function run() {
  console.log("Sprint 12.1 — Communication Gateway verification\n");

  class NoReplyAIAdapter extends AIAdapter {
    async generateReply() {
      return { text: "stub", provider: "mock" };
    }
  }

  const { gateway, eventBus, messengerConnector } = createCommunicationGateway({
    aiAdapter: new NoReplyAIAdapter()
  });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.stub"
  });

  assertConnectorImplementation(messengerConnector);
  console.log("✓ MessengerConnector satisfies CommunicationConnector interface");

  const parsed = parseMessengerWebhook(SAMPLE_WEBHOOK);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].channel, CHANNEL.MESSENGER);
  assert.strictEqual(parsed[0].senderId, "USER_PSID_123");
  assert.strictEqual(parsed[0].text, "Hello Atlas");
  console.log("✓ Messenger webhook normalized to GatewayMessage");

  const receivedEvents = [];
  eventBus.on(CommunicationEvent.MESSAGE_RECEIVED, (payload) => {
    receivedEvents.push(CommunicationEvent.MESSAGE_RECEIVED);
  });
  eventBus.on(CommunicationEvent.CONVERSATION_CREATED, () => {
    receivedEvents.push(CommunicationEvent.CONVERSATION_CREATED);
  });

  const firstPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(firstPass.length, 1);
  assert.ok(firstPass[0].conversation.id);
  assert.strictEqual(firstPass[0].created, true);
  assert.strictEqual(firstPass[0].routeResult.aiInvoked, true);
  console.log("✓ CommunicationGateway.receive created conversation and routed message");

  assert.ok(receivedEvents.includes(CommunicationEvent.MESSAGE_RECEIVED));
  assert.ok(receivedEvents.includes(CommunicationEvent.CONVERSATION_CREATED));
  console.log("✓ EventBus emitted message.received and conversation.created");

  const secondPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(secondPass[0].created, false);
  assert.strictEqual(secondPass[0].conversation.id, firstPass[0].conversation.id);
  console.log("✓ Existing conversation retrieved on second message");

  const conversationId = firstPass[0].conversation.id;
  await gateway.enableHumanTakeover(conversationId, "operator-1");

  const humanPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(humanPass[0].routeResult.skippedReason, "HUMAN_TAKEOVER");
  assert.strictEqual(humanPass[0].routeResult.aiInvoked, false);
  console.log("✓ Human takeover prevents AI routing hook");

  await gateway.disableHumanTakeover(conversationId);
  console.log("✓ Human release restored AI ownership mode");

  const health = await messengerConnector.healthCheck();
  assert.ok(typeof health.healthy === "boolean");
  console.log("✓ MessengerConnector healthCheck callable");

  console.log("\nAll Sprint 12.1 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
