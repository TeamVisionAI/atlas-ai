/**
 * Sprint 12.6 — Executive Dashboard analytics verification.
 * Run: node backend/dev/verifySprint12_6.js
 */

const assert = require("assert");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { CHANNEL } = require("../communication/models/Channel");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      messaging: [
        {
          sender: { id: "USER_PSID_ED" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.$sprint126",
            text: "Executive dashboard test"
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
  console.log("Sprint 12.6 — Executive Dashboard analytics verification\n");

  const { gateway, executiveDashboardService, operatorService, messengerConnector } =
    createCommunicationGateway({ aiAdapter: new MockAIAdapter() });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  const pass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  const conversationId = pass[0].conversation.id;

  let summary = executiveDashboardService.getSummary();

  assert.strictEqual(summary.metrics.messagesReceivedToday, 1);
  assert.strictEqual(summary.metrics.messagesSentToday, 1);
  assert.strictEqual(summary.metrics.newProspectsToday, 1);
  assert.strictEqual(summary.metrics.activeProspects, 1);
  assert.strictEqual(summary.metrics.activeConversations, 1);
  assert.strictEqual(summary.metrics.aiResponsesToday, 1);
  assert.ok(summary.metrics.averageConversationLength >= 2);
  assert.ok(summary.generatedAt);
  assert.ok(summary.today.date);
  console.log("✓ EventBus updates daily metrics and active counters");

  await operatorService.registerOperator({ id: "operator-ed", displayName: "Executive Op" });
  await gateway.assignToOperator(conversationId, "operator-ed");

  summary = executiveDashboardService.getSummary();
  assert.strictEqual(summary.metrics.humanTakeoversToday, 1);
  assert.strictEqual(summary.today.operatorAssignmentsToday, 1);
  console.log("✓ Human takeover and operator assignment metrics tracked");

  await gateway.releaseToAI(conversationId);

  summary = executiveDashboardService.getSummary();
  assert.strictEqual(summary.today.operatorUnassignmentsToday, 1);
  console.log("✓ Operator unassignment metrics tracked");

  assert.ok(typeof summary.trends === "object");
  assert.ok(Array.isArray(summary.history));
  console.log("✓ getSummary returns metrics, trends, and today block");

  console.log("\nAll Sprint 12.6 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
