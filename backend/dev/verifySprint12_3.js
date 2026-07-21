/**
 * Sprint 12.3 — Prospect intelligence verification.
 * Run: node backend/dev/verifySprint12_3.js
 */

const assert = require("assert");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { ProspectEvent } = require("../prospects/prospectEvents");
const { CHANNEL } = require("../communication/models/Channel");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      messaging: [
        {
          sender: { id: "USER_PSID_789" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.$sprint123",
            text: "First message from new user"
          }
        }
      ]
    }
  ]
};

class MockAIAdapter extends AIAdapter {
  async generateReply(inboundMessage) {
    return {
      text: `Reply to ${inboundMessage.text}`,
      provider: "mock"
    };
  }
}

async function run() {
  console.log("Sprint 12.3 — Prospect intelligence verification\n");

  const events = [];
  const { gateway, eventBus, prospectService, messengerConnector } = createCommunicationGateway({
    aiAdapter: new MockAIAdapter()
  });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  for (const eventName of [
    ProspectEvent.CREATED,
    ProspectEvent.UPDATED,
    ProspectEvent.LINKED_CHANNEL
  ]) {
    eventBus.on(eventName, (payload) => events.push({ eventName, payload }));
  }

  const firstPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);

  assert.strictEqual(firstPass.length, 1);
  assert.ok(firstPass[0].prospect);
  assert.strictEqual(firstPass[0].prospectCreated, true);
  assert.match(firstPass[0].prospect.atlasId, /^ATL-\d{6}$/);
  assert.strictEqual(firstPass[0].conversation.atlasProspectId, firstPass[0].prospect.atlasId);
  console.log(`✓ First-time Messenger user assigned ${firstPass[0].prospect.atlasId}`);

  assert.ok(events.some((entry) => entry.eventName === ProspectEvent.CREATED));
  console.log("✓ EventBus emitted prospect.created");

  const atlasId = firstPass[0].prospect.atlasId;

  const secondPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  assert.strictEqual(secondPass[0].prospectCreated, false);
  assert.strictEqual(secondPass[0].prospect.atlasId, atlasId);
  console.log("✓ Returning user keeps the same Atlas ID");

  assert.ok(events.some((entry) => entry.eventName === ProspectEvent.UPDATED));
  console.log("✓ EventBus emitted prospect.updated on activity");

  const linked = await prospectService.linkChannel(
    atlasId,
    CHANNEL.INSTAGRAM,
    "IG_USER_999"
  );

  assert.strictEqual(linked.linked, true);
  assert.strictEqual(linked.prospect.channelIdentities.length, 2);
  console.log("✓ Additional channel identity linked to same prospect");

  assert.ok(events.some((entry) => entry.eventName === ProspectEvent.LINKED_CHANNEL));
  console.log("✓ EventBus emitted prospect.linkedChannel");

  const fromInstagram = await prospectService.findByChannelIdentity(
    CHANNEL.INSTAGRAM,
    "IG_USER_999"
  );
  assert.strictEqual(fromInstagram.atlasId, atlasId);
  console.log("✓ Instagram identity resolves to the same Atlas prospect");

  const secondUser = await gateway.receive(CHANNEL.MESSENGER, {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        messaging: [
          {
            sender: { id: "USER_PSID_OTHER" },
            recipient: { id: "PAGE_ID" },
            timestamp: 1520383573,
            message: { mid: "mid.other", text: "Another user" }
          }
        ]
      }
    ]
  });

  assert.notStrictEqual(secondUser[0].prospect.atlasId, atlasId);
  assert.match(secondUser[0].prospect.atlasId, /^ATL-\d{6}$/);
  console.log("✓ Distinct users receive distinct Atlas IDs");

  console.log("\nAll Sprint 12.3 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
