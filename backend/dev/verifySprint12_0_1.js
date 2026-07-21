/**
 * Sprint 12.0.1 — Messenger connector verification.
 * Run: node backend/dev/verifySprint12_0_1.js
 */

const assert = require("assert");
const fs = require("fs");
const { STORE_FILE } = require("../prospects/ProspectRepository");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const {
  createCommunicationGateway,
  resetCommunicationGateway
} = require("../communication/gateway/createCommunicationGateway");
const { CHANNEL } = require("../communication/models/Channel");
const { parseMessengerWebhook } = require("../communication/connectors/messenger/messengerWebhookParser");
const { buildMessengerStorageKey } = require("../core/messengerConstants");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      messaging: [
        {
          sender: { id: "USER_PSID_1201" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.sprint1201.test",
            text: "Hola, quiero información sobre reclutamiento"
          }
        }
      ]
    }
  ]
};

class MockAIAdapter extends AIAdapter {
  constructor() {
    super();
    this.calls = 0;
  }

  async generateReply(inboundMessage) {
    this.calls += 1;
    return {
      text: `Atlas reply to: ${inboundMessage.text}`,
      provider: "mock"
    };
  }
}

async function run() {
  console.log("Sprint 12.0.1 — Messenger connector verification\n");

  resetCommunicationGateway();

  const mockAi = new MockAIAdapter();
  let outboundCount = 0;

  const { gateway, messengerConnector, conversationManager, prospectService } =
    createCommunicationGateway({
      aiAdapter: mockAi,
      useOpenAiAdapter: false
    });

  messengerConnector.sendMessage = async (message) => {
    outboundCount += 1;
    return {
      success: true,
      providerMessageId: `mock.outbound.${outboundCount}`
    };
  };

  const parsed = parseMessengerWebhook(SAMPLE_WEBHOOK);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].channel, CHANNEL.MESSENGER);
  assert.strictEqual(parsed[0].senderId, "USER_PSID_1201");
  assert.strictEqual(parsed[0].text, "Hola, quiero información sobre reclutamiento");
  console.log("✓ Messenger webhook parser normalizes payload");

  const firstPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(firstPass.length, 1);
  assert.strictEqual(firstPass[0].skipped, undefined);
  assert.ok(firstPass[0].prospect);
  assert.ok(firstPass[0].conversation);
  assert.strictEqual(firstPass[0].routeResult.aiInvoked, true);
  assert.strictEqual(mockAi.calls, 1);
  assert.strictEqual(outboundCount, 1);
  console.log("✓ Gateway creates prospect, stores conversation, invokes AI, sends Messenger reply");

  const history = await conversationManager.getHistory(firstPass[0].conversation.id);
  assert.ok(history.length >= 2, "Expected inbound + outbound messages in conversation history");
  console.log("✓ Conversation history persisted in gateway store");

  const linkedProspect = await prospectService.findByChannelIdentity(
    CHANNEL.MESSENGER,
    "USER_PSID_1201"
  );
  assert.ok(linkedProspect.storageKey, "Prospect should have storageKey");
  assert.ok(linkedProspect.communication?.activeConversationId);
  assert.ok(Array.isArray(linkedProspect.conversationHistory));
  assert.ok(linkedProspect.conversationHistory.length >= 2);
  assert.ok(linkedProspect.recruitingStage);
  assert.ok(linkedProspect.qualificationProgress);
  console.log("✓ Prospect enriched as first-class Atlas record");

  assert.ok(fs.existsSync(STORE_FILE), "Prospects should persist to disk");
  const store = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  assert.ok(store.prospects[linkedProspect.atlasId]);
  console.log("✓ Prospect record persisted to backend/data/prospects.json");

  assert.strictEqual(
    buildMessengerStorageKey("USER_PSID_1201"),
    "messenger:USER_PSID_1201"
  );
  console.log("✓ Messenger storage key format");

  const secondPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(secondPass.length, 1);
  assert.strictEqual(secondPass[0].skipped, true);
  assert.strictEqual(secondPass[0].reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.strictEqual(mockAi.calls, 1, "Duplicate webhook must not invoke AI again");
  assert.strictEqual(outboundCount, 1, "Duplicate webhook must not send another reply");
  console.log("✓ Duplicate webhook delivery is idempotent");

  console.log("\nAll Sprint 12.0.1 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
