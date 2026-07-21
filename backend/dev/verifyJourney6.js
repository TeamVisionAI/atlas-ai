/**
 * Journey #6 — Unified Communication Gateway verification.
 * Run: node backend/dev/verifyJourney6.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { EventBus } = require("../communication/events/EventBus");
const { DECISION_TYPE } = require("../agent");
const {
  createCommunicationGateway,
  GatewayEvent,
  ENVELOPE_FIELDS,
  envelopeStructureKeys,
  toAgentInput,
  AGENT_TRANSPORT,
  gatewayStore,
  MessengerAdapter,
  WhatsAppAdapter,
  InstagramAdapter,
  WebsiteChatAdapter
} = require("../gateway");
const { clearStore: clearWorkflowState } = require("../workflows/intelligence/WorkflowState");
const { GENERIC_INTAKE_WORKFLOW } = require("../workflows/intelligence");
const agentStore = require("../agent/AgentStore");
const { sessionStore } = require("../agent/runtime");
const { executionHistory } = require("../agent/tools");
const { withSimulatorGuard } = require("../dev/simulatorGuard");
const { signupWithPassword } = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  activateOrganization
} = require("../services/organizationService");

const ORGS_FILE = path.join(__dirname, "../data/organizations.json");
const GATEWAY_STORE_FILE = path.join(__dirname, "../data/gatewayStore.json");

const TEST_TEXT = "Hi there";

function buildMessengerPayload(text = TEST_TEXT, senderId = "USER_J6") {
  return {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: "PAGE_ID" },
            timestamp: 1520383572,
            message: { mid: `mid.messenger.${Date.now()}`, text }
          }
        ]
      }
    ]
  };
}

function buildWhatsAppPayload(text = TEST_TEXT, senderId = "15551234567") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "PHONE_ID" },
              messages: [
                {
                  from: senderId,
                  id: `wamid.${Date.now()}`,
                  timestamp: "1520383572",
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

function buildInstagramPayload(text = TEST_TEXT, senderId = "IG_USER_J6") {
  return {
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: "IG_PAGE" },
            timestamp: 1520383572,
            message: { mid: `mid.instagram.${Date.now()}`, text }
          }
        ]
      }
    ]
  };
}

function buildWebsiteChatPayload(text = TEST_TEXT, visitorId = "visitor-j6") {
  return {
    visitorId,
    sessionId: "session-j6",
    messageId: `web.${Date.now()}`,
    text,
    timestamp: new Date().toISOString()
  };
}

function normalizeOnly(adapter, rawPayload, routingContext) {
  const parsed = adapter.receive(rawPayload);
  const partial = adapter.normalize(parsed);

  return {
    ...partial,
    organizationId: routingContext.organizationId,
    prospectId: routingContext.prospectId
  };
}

async function run() {
  console.log("Journey #6 — Unified Communication Gateway verification\n");

  await withSimulatorGuard(async () => {
    agentStore.clearStore();
    clearWorkflowState();
    executionHistory.clearHistory();
    sessionStore.clearStore();
    gatewayStore.clearStore();

    if (fs.existsSync(ORGS_FILE)) {
      fs.unlinkSync(ORGS_FILE);
    }

    const user = await signupWithPassword({
      email: `journey6.${Date.now()}@example.com`,
      password: "AtlasTest123"
    });
    const orgRecord = await createOrganizationForUser(user.id, "Team Vision Gateway");
    await activateOrganization(orgRecord.id);

    const organization = {
      id: orgRecord.id,
      name: "Team Vision Gateway",
      officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    };

    const routingContext = {
      organizationId: organization.id,
      organization,
      prospectId: "ATL-J6-001",
      prospectDisplayName: "Maria Lopez",
      workflowName: GENERIC_INTAKE_WORKFLOW.name
    };

    const messengerAdapter = new MessengerAdapter();
    const whatsAppAdapter = new WhatsAppAdapter();
    const instagramAdapter = new InstagramAdapter();
    const websiteChatAdapter = new WebsiteChatAdapter();

    const messengerEnvelope = normalizeOnly(
      messengerAdapter,
      buildMessengerPayload(),
      routingContext
    );
    const whatsAppEnvelope = normalizeOnly(
      whatsAppAdapter,
      buildWhatsAppPayload(),
      routingContext
    );
    const instagramEnvelope = normalizeOnly(
      instagramAdapter,
      buildInstagramPayload(),
      routingContext
    );
    const websiteEnvelope = normalizeOnly(
      websiteChatAdapter,
      buildWebsiteChatPayload(),
      routingContext
    );

    for (const envelope of [
      messengerEnvelope,
      whatsAppEnvelope,
      instagramEnvelope,
      websiteEnvelope
    ]) {
      assert.deepStrictEqual(envelopeStructureKeys(envelope), ENVELOPE_FIELDS);
      assert.strictEqual(envelope.text, TEST_TEXT);
      assert.strictEqual(envelope.organizationId, organization.id);
      assert.strictEqual(envelope.prospectId, routingContext.prospectId);
    }

    console.log("✓ Messenger payload normalized");
    console.log("✓ WhatsApp payload normalized");
    console.log("✓ Instagram payload normalized");
    console.log("✓ Website Chat payload normalized");
    console.log("✓ All produce identical Message Envelope structure");

    const agentInput = toAgentInput(messengerEnvelope, routingContext);
    assert.strictEqual(agentInput.channel, AGENT_TRANSPORT);
    assert.ok(!agentInput.metadata, "Agent input must not include channel metadata");
    console.log("✓ Agent receives channel-neutral input");

    const eventBus = new EventBus();
    const gatewayEvents = {
      received: [],
      normalized: [],
      processed: [],
      sent: [],
      connected: [],
      errors: []
    };

    eventBus.on(GatewayEvent.MESSAGE_RECEIVED, (payload) => gatewayEvents.received.push(payload));
    eventBus.on(GatewayEvent.MESSAGE_NORMALIZED, (payload) =>
      gatewayEvents.normalized.push(payload)
    );
    eventBus.on(GatewayEvent.MESSAGE_PROCESSED, (payload) =>
      gatewayEvents.processed.push(payload)
    );
    eventBus.on(GatewayEvent.MESSAGE_SENT, (payload) => gatewayEvents.sent.push(payload));
    eventBus.on(GatewayEvent.CHANNEL_CONNECTED, (payload) =>
      gatewayEvents.connected.push(payload)
    );
    eventBus.on(GatewayEvent.CHANNEL_ERROR, (payload) => gatewayEvents.errors.push(payload));

    const gateway = createCommunicationGateway({ eventBus });

    const sentMessages = [];
    for (const channelId of ["messenger", "whatsapp", "instagram", "website-chat"]) {
      const adapter = gateway.channelRegistry.get(channelId);
      adapter.send = async (outbound) => {
        sentMessages.push({ channel: channelId, ...outbound });
        return {
          success: true,
          channel: channelId,
          providerMessageId: `mock.${channelId}.${Date.now()}`
        };
      };
    }

    const turnOne = await gateway.receive("messenger", buildMessengerPayload(), routingContext);

    assert.strictEqual(turnOne.success, true);
    assert.ok(turnOne.envelope, "Expected normalized envelope");
    assert.strictEqual(turnOne.agentResult.decision.decisionType, DECISION_TYPE.ASK);
    assert.ok(turnOne.deliveryStatus?.success, "Expected outbound delivery");
    assert.ok(sentMessages.length >= 1, "Expected outbound message routed");
    assert.strictEqual(sentMessages[0].channel, "messenger");
    console.log("✓ Agent processes envelope successfully");
    console.log("✓ Outbound response routed correctly");

    const turnTwo = await gateway.receive(
      "messenger",
      buildMessengerPayload("Maria Lopez"),
      {
        ...routingContext,
        conversationId: turnOne.agentResult.conversationId
      }
    );

    assert.strictEqual(turnTwo.agentResult.decision.currentStep, "collect_email");
    console.log("✓ Multi-turn conversation through gateway");

    assert.ok(gatewayEvents.received.length >= 2, "Expected gateway.message.received");
    assert.ok(gatewayEvents.normalized.length >= 2, "Expected gateway.message.normalized");
    assert.ok(gatewayEvents.processed.length >= 2, "Expected gateway.message.processed");
    assert.ok(gatewayEvents.sent.length >= 2, "Expected gateway.message.sent");
    assert.ok(gatewayEvents.connected.length >= 9, "Expected gateway.channel.connected");
    console.log("✓ Gateway lifecycle events emitted");

    const store = gatewayStore.readStore();
    assert.ok(store.inbound.length >= 2, "Expected inbound persistence");
    assert.ok(store.envelopes.length >= 2, "Expected envelope persistence");
    assert.ok(store.outbound.length >= 2, "Expected outbound persistence");
    assert.ok(fs.existsSync(GATEWAY_STORE_FILE), "Expected gateway store file");
    console.log("✓ Gateway persistence operational");

    const badResult = await gateway.receive("messenger", { object: "invalid" }, routingContext);
    assert.strictEqual(badResult.success, false);
    assert.ok(badResult.error);
    assert.ok(gatewayEvents.errors.length >= 1, "Expected gateway.channel.error");
    console.log("✓ Normalization failures handled without crash");
  });

  console.log("\nAll Journey #6 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
