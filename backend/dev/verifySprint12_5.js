/**
 * Sprint 12.5 — Mission Control live feed verification.
 * Run: node backend/dev/verifySprint12_5.js
 */

const assert = require("assert");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { CommunicationEvent } = require("../communication/events/eventNames");
const { OwnershipMode } = require("../communication/constants/OwnershipMode");
const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { CHANNEL } = require("../communication/models/Channel");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      messaging: [
        {
          sender: { id: "USER_PSID_MC" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.$sprint125",
            text: "Mission Control test"
          }
        }
      ]
    }
  ]
};

class MockAIAdapter extends AIAdapter {
  async generateReply(inboundMessage) {
    return {
      text: `AI: ${inboundMessage.text}`,
      provider: "mock"
    };
  }
}

async function run() {
  console.log("Sprint 12.5 — Mission Control live feed verification\n");

  const { gateway, missionControlService, operatorService, messengerConnector } =
    createCommunicationGateway({ aiAdapter: new MockAIAdapter() });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  const firstPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  const conversationId = firstPass[0].conversation.id;
  const atlasId = firstPass[0].prospect.atlasId;

  let snapshot = missionControlService.getSnapshot();

  assert.strictEqual(snapshot.counters.totalActive, 1);
  assert.strictEqual(snapshot.counters.aiOwned, 1);
  assert.strictEqual(snapshot.counters.newProspectsToday, 1);
  assert.ok(snapshot.activeConversations.some((entry) => entry.conversationId === conversationId));
  assert.ok(snapshot.activityFeed.some((entry) => entry.summary === "Message received"));
  assert.ok(snapshot.activityFeed.some((entry) => entry.summary === "AI responded"));
  assert.ok(snapshot.activityFeed.some((entry) => entry.atlasProspectId === atlasId));
  console.log("✓ Snapshot tracks active conversation, prospect, and activity feed");

  await operatorService.registerOperator({ id: "operator-maria", displayName: "Maria" });
  await gateway.assignToOperator(conversationId, "operator-maria");

  await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);

  snapshot = missionControlService.getSnapshot();

  assert.strictEqual(snapshot.counters.humanOwned, 1);
  assert.strictEqual(snapshot.counters.aiOwned, 0);
  assert.ok(snapshot.counters.waitingForHuman >= 1);
  assert.ok(snapshot.waitingQueue.length >= 1);
  assert.ok(snapshot.activityFeed.some((entry) => entry.summary.includes("Operator Maria assigned")));
  assert.ok(snapshot.activityFeed.some((entry) => entry.summary === "Waiting for human response"));
  console.log("✓ Human-owned and waiting queue tracked after takeover");

  await gateway.releaseToAI(conversationId);

  snapshot = missionControlService.getSnapshot();

  assert.strictEqual(snapshot.counters.aiOwned, 1);
  assert.strictEqual(snapshot.counters.humanOwned, 0);
  assert.ok(snapshot.activityFeed.some((entry) => entry.summary === "Conversation released to AI"));
  console.log("✓ Release back to AI updates counters and feed");

  const transferWebhook = {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        messaging: [
          {
            sender: { id: "USER_TRANSFER_MC" },
            recipient: { id: "PAGE_ID" },
            timestamp: 1520383573,
            message: { mid: "mid.transfer.mc", text: "Transfer me" }
          }
        ]
      }
    ]
  };

  const transferPass = await gateway.receive(CHANNEL.MESSENGER, transferWebhook);
  await operatorService.initiateTransfer(transferPass[0].conversation.id, "operator-maria");

  snapshot = missionControlService.getSnapshot();
  assert.ok(snapshot.counters.transferPending >= 1);
  console.log("✓ Transfer pending conversations tracked");

  assert.ok(Array.isArray(snapshot.activityFeed));
  assert.ok(snapshot.generatedAt);
  console.log("✓ getSnapshot returns counters, active conversations, waiting queue, activity feed");

  console.log("\nAll Sprint 12.5 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
