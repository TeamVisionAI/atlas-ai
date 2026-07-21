/**
 * Sprint 12.4 — Human takeover verification.
 * Run: node backend/dev/verifySprint12_4.js
 */

const assert = require("assert");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { CommunicationEvent } = require("../communication/events/eventNames");
const { OwnershipMode } = require("../communication/constants/OwnershipMode");
const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { OperatorEvent } = require("../operators/operatorEvents");
const { CHANNEL } = require("../communication/models/Channel");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      messaging: [
        {
          sender: { id: "USER_PSID_TAKEOVER" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.$sprint124",
            text: "Need a human please"
          }
        }
      ]
    }
  ]
};

class MockAIAdapter extends AIAdapter {
  constructor() {
    super();
    this.callCount = 0;
  }

  async generateReply(inboundMessage) {
    this.callCount += 1;
    return {
      text: `AI reply: ${inboundMessage.text}`,
      provider: "mock"
    };
  }
}

async function run() {
  console.log("Sprint 12.4 — Human takeover verification\n");

  const events = [];
  const aiAdapter = new MockAIAdapter();
  const { gateway, eventBus, operatorService, messengerConnector } = createCommunicationGateway({
    aiAdapter
  });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  for (const eventName of [
    CommunicationEvent.HUMAN_TAKEOVER,
    CommunicationEvent.HUMAN_RELEASE,
    CommunicationEvent.HUMAN_MESSAGE_WAITING,
    OperatorEvent.ASSIGNED,
    OperatorEvent.UNASSIGNED
  ]) {
    eventBus.on(eventName, () => events.push(eventName));
  }

  const aiPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(aiPass[0].routeResult.aiInvoked, true);
  assert.strictEqual(aiAdapter.callCount, 1);
  console.log("✓ AI responds while conversation ownership is AI");

  const conversationId = aiPass[0].conversation.id;

  await operatorService.registerOperator({ id: "operator-42", displayName: "Test Operator" });
  const assigned = await gateway.assignToOperator(conversationId, "operator-42");

  assert.strictEqual(assigned.ownershipMode, OwnershipMode.HUMAN);
  assert.strictEqual(assigned.assignedOperatorId, "operator-42");
  assert.ok(assigned.assignedAt);
  assert.strictEqual(assigned.releasedAt, null);
  console.log("✓ Conversation assigned to operator with timestamps");

  assert.ok(events.includes(OperatorEvent.ASSIGNED));
  assert.ok(events.includes(CommunicationEvent.HUMAN_TAKEOVER));
  console.log("✓ EventBus emitted operator.assigned and human.takeover");

  aiAdapter.callCount = 0;
  events.length = 0;

  const humanPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(humanPass[0].routeResult.aiInvoked, false);
  assert.strictEqual(humanPass[0].routeResult.skippedReason, "HUMAN_TAKEOVER");
  assert.strictEqual(aiAdapter.callCount, 0);
  assert.strictEqual(humanPass[0].sendResult, null);
  console.log("✓ AI does not respond while ownership is HUMAN");

  assert.ok(events.includes(CommunicationEvent.HUMAN_MESSAGE_WAITING));
  console.log("✓ EventBus emitted human.message.waiting");

  const released = await gateway.releaseToAI(conversationId);

  assert.strictEqual(released.ownershipMode, OwnershipMode.AI);
  assert.strictEqual(released.assignedOperatorId, null);
  assert.ok(released.releasedAt);
  console.log("✓ Conversation released back to AI");

  assert.ok(events.includes(OperatorEvent.UNASSIGNED));
  assert.ok(events.includes(CommunicationEvent.HUMAN_RELEASE));
  console.log("✓ EventBus emitted operator.unassigned and human.release");

  aiAdapter.callCount = 0;
  const aiAgain = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(aiAgain[0].routeResult.aiInvoked, true);
  assert.strictEqual(aiAdapter.callCount, 1);
  console.log("✓ AI responds again after release to AI");

  const transferPass = await gateway.receive(CHANNEL.MESSENGER, {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        messaging: [
          {
            sender: { id: "USER_TRANSFER" },
            recipient: { id: "PAGE_ID" },
            timestamp: 1520383573,
            message: { mid: "mid.transfer", text: "Transfer test" }
          }
        ]
      }
    ]
  });

  const transferConversationId = transferPass[0].conversation.id;
  await operatorService.initiateTransfer(transferConversationId, "operator-42");

  aiAdapter.callCount = 0;
  const pendingPass = await gateway.receive(CHANNEL.MESSENGER, {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        messaging: [
          {
            sender: { id: "USER_TRANSFER" },
            recipient: { id: "PAGE_ID" },
            timestamp: 1520383574,
            message: { mid: "mid.transfer2", text: "Still waiting" }
          }
        ]
      }
    ]
  });

  assert.strictEqual(pendingPass[0].routeResult.skippedReason, "TRANSFER_PENDING");
  assert.strictEqual(aiAdapter.callCount, 0);
  console.log("✓ AI does not respond while ownership is TRANSFER_PENDING");

  console.log("\nAll Sprint 12.4 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
