/**
 * Sprint 12.2 — Communication Gateway + AI adapter verification.
 * Run: node backend/dev/verifySprint12_2.js
 */

const assert = require("assert");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { MessageDirection } = require("../communication/constants/MessageDirection");
const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { CommunicationEvent } = require("../communication/events/eventNames");
const { CHANNEL } = require("../communication/models/Channel");
const { GatewayMessage } = require("../communication/models/GatewayMessage");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      messaging: [
        {
          sender: { id: "USER_PSID_456" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.$sprint122",
            text: "Hi Atlas, how are you?"
          }
        }
      ]
    }
  ]
};

class MockAIAdapter extends AIAdapter {
  async generateReply(inboundMessage) {
    return {
      text: `Atlas received: ${inboundMessage.text}`,
      provider: "mock",
      model: "mock-model"
    };
  }
}

async function run() {
  console.log("Sprint 12.2 — End-to-end AI conversation verification\n");

  const events = [];
  const { gateway, eventBus, messengerConnector, conversationManager } =
    createCommunicationGateway({ aiAdapter: new MockAIAdapter() });

  let sentPayload = null;
  messengerConnector.sendMessage = async (message) => {
    sentPayload = message;
    return { success: true, providerMessageId: "mock.outbound.1" };
  };

  for (const eventName of [
    CommunicationEvent.MESSAGE_RECEIVED,
    CommunicationEvent.AI_RESPONSE_GENERATED,
    CommunicationEvent.MESSAGE_SENT,
    CommunicationEvent.CONVERSATION_UPDATED
  ]) {
    eventBus.on(eventName, () => events.push(eventName));
  }

  const results = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].routeResult.aiInvoked, true);
  assert.ok(results[0].routeResult.outboundMessage);
  assert.ok(results[0].sendResult?.success);
  console.log("✓ Inbound message routed through AI adapter and sent outbound");

  assert.ok(sentPayload);
  assert.strictEqual(sentPayload.direction, MessageDirection.OUTBOUND);
  assert.strictEqual(sentPayload.recipientId, "USER_PSID_456");
  assert.match(sentPayload.text, /Atlas received:/);
  console.log("✓ MessengerConnector.sendMessage received channel-agnostic GatewayMessage");

  const history = await conversationManager.getHistory(results[0].conversation.id);
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].direction, MessageDirection.INBOUND);
  assert.strictEqual(history[1].direction, MessageDirection.OUTBOUND);
  console.log("✓ Conversation history stores inbound and outbound messages");

  assert.ok(events.includes(CommunicationEvent.MESSAGE_RECEIVED));
  assert.ok(events.includes(CommunicationEvent.AI_RESPONSE_GENERATED));
  assert.ok(events.includes(CommunicationEvent.MESSAGE_SENT));
  console.log("✓ EventBus emitted message.received, ai.response.generated, message.sent");

  const failingAdapter = new AIAdapter();
  failingAdapter.generateReply = async () => ({
    text: "fallback",
    provider: "mock",
    fallback: true,
    error: "simulated failure"
  });

  const errorEvents = [];
  const { gateway: errorGateway, eventBus: errorEventBus } = createCommunicationGateway({
    aiAdapter: failingAdapter
  });
  errorEventBus.on(CommunicationEvent.AI_ERROR, () => {
    errorEvents.push(CommunicationEvent.AI_ERROR);
  });
  errorGateway.registerConnector({
    channelId: CHANNEL.MESSENGER,
    connect: async () => ({}),
    disconnect: async () => ({}),
    receiveMessage: async () => [
      new GatewayMessage({
        channel: CHANNEL.MESSENGER,
        senderId: "USER_ERR",
        recipientId: "PAGE_ID",
        text: "trigger error"
      })
    ],
    sendMessage: async (message) => {
      assert.strictEqual(message.text, "fallback");
      return { success: true };
    },
    markAsRead: async () => ({}),
    typingIndicator: async () => ({}),
    healthCheck: async () => ({ healthy: true })
  });

  await errorGateway.receive(CHANNEL.MESSENGER, {});
  assert.ok(errorEvents.includes(CommunicationEvent.AI_ERROR));
  console.log("✓ AI failure emits ai.error and sends fallback without crashing");

  console.log("\nAll Sprint 12.2 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
