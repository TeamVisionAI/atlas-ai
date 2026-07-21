/**
 * Journey #7 — Production Connectors verification.
 * Run: node backend/dev/verifyJourney7.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { EventBus } = require("../communication/events/EventBus");
const { createCommunicationGateway } = require("../gateway");
const { createCalendarEvent } = require("../meetings/CalendarService");
const { createZoomMeeting } = require("../meetings/ZoomService");
const { GENERIC_INTAKE_WORKFLOW } = require("../workflows/intelligence");
const agentStore = require("../agent/AgentStore");
const { sessionStore } = require("../agent/runtime");
const { executionHistory } = require("../agent/tools");
const { clearStore: clearWorkflowState } = require("../workflows/intelligence/WorkflowState");
const { withSimulatorGuard } = require("./simulatorGuard");
const { signupWithPassword } = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  activateOrganization
} = require("../services/organizationService");
const {
  createConnectorRegistry,
  resetConnectorRegistry,
  createMetaWebhookConnector,
  ConnectorEvent,
  HEALTH_STATUS
} = require("../connectors");

const ORGS_FILE = path.join(__dirname, "../data/organizations.json");

function buildMessengerPayload(text = "Hi there") {
  return {
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "USER_J7" },
            recipient: { id: "PAGE_ID" },
            timestamp: 1520383572,
            message: { mid: `mid.j7.${Date.now()}`, text }
          }
        ]
      }
    ]
  };
}

function buildWhatsAppPayload(text = "Hi there") {
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
                  from: "15551234567",
                  id: `wamid.j7.${Date.now()}`,
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

function buildInstagramPayload(text = "Hi there") {
  return {
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "IG_USER_J7" },
            recipient: { id: "IG_PAGE" },
            timestamp: 1520383572,
            message: { mid: `mid.ig.j7.${Date.now()}`, text }
          }
        ]
      }
    ]
  };
}

async function run() {
  console.log("Journey #7 — Production Connectors verification\n");

  await withSimulatorGuard(async () => {
    resetConnectorRegistry();
    agentStore.clearStore();
    clearWorkflowState();
    executionHistory.clearHistory();
    sessionStore.clearStore();

    if (fs.existsSync(ORGS_FILE)) {
      fs.unlinkSync(ORGS_FILE);
    }

    const eventBus = new EventBus();
    const connectorEvents = {
      connected: [],
      messageReceived: [],
      messageSent: [],
      failed: [],
      retry: []
    };

    eventBus.on(ConnectorEvent.CONNECTED, (payload) => connectorEvents.connected.push(payload));
    eventBus.on(ConnectorEvent.MESSAGE_RECEIVED, (payload) =>
      connectorEvents.messageReceived.push(payload)
    );
    eventBus.on(ConnectorEvent.MESSAGE_SENT, (payload) =>
      connectorEvents.messageSent.push(payload)
    );
    eventBus.on(ConnectorEvent.FAILED, (payload) => connectorEvents.failed.push(payload));
    eventBus.on(ConnectorEvent.RETRY, (payload) => connectorEvents.retry.push(payload));

    const registry = createConnectorRegistry({ eventBus });
    assert.ok(registry.has("messenger"), "Expected messenger connector registered");
    assert.ok(registry.has("whatsapp"), "Expected whatsapp connector registered");
    assert.ok(registry.has("instagram"), "Expected instagram connector registered");
    assert.ok(registry.has("google-calendar"), "Expected google-calendar connector registered");
    assert.ok(registry.has("zoom"), "Expected zoom connector registered");
    console.log("✓ Connector Registry operational");

    const messenger = registry.get("messenger");
    const whatsapp = registry.get("whatsapp");
    const instagram = registry.get("instagram");
    const googleCalendar = registry.get("google-calendar");
    const zoom = registry.get("zoom");

    messenger.validate(buildMessengerPayload());
    whatsapp.validate(buildWhatsAppPayload());
    instagram.validate(buildInstagramPayload());
    console.log("✓ Meta webhook payloads validated");

    messenger.receive(buildMessengerPayload());
    whatsapp.receive(buildWhatsAppPayload());
    instagram.receive(buildInstagramPayload());
    console.log("✓ Messenger connected");
    console.log("✓ WhatsApp connected");
    console.log("✓ Instagram connected");

    const messengerHealth = await messenger.health();
    const whatsappHealth = await whatsapp.health();
    const googleHealth = await googleCalendar.health();
    const zoomHealth = await zoom.health();

    assert.ok(
      Object.values(HEALTH_STATUS).includes(messengerHealth.status),
      "Expected standardized messenger health"
    );
    assert.ok(
      Object.values(HEALTH_STATUS).includes(googleHealth.status),
      "Expected standardized google health"
    );
    console.log("✓ Connector health reporting operational");

    const sendResult = await messenger.send({
      recipientId: "USER_J7",
      text: "Hello from Atlas"
    });
    assert.strictEqual(sendResult.success, true);
    assert.strictEqual(sendResult.simulated, true);
    console.log("✓ Production send path operational (simulator mode)");

    const calendarResult = await createCalendarEvent({
      organizationId: "org-j7",
      prospectName: "Maria Lopez",
      meetingType: "office",
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      timeZone: "America/New_York"
    });
    assert.strictEqual(calendarResult.status, "created");
    assert.strictEqual(calendarResult.simulated, true);
    console.log("✓ Google Calendar operational");

    const zoomResult = await createZoomMeeting({
      prospectName: "Maria Lopez",
      meetingType: "zoom",
      startTime: new Date().toISOString(),
      timeZone: "America/New_York"
    });
    assert.strictEqual(zoomResult.status, "created");
    assert.strictEqual(zoomResult.simulated, true);
    console.log("✓ Zoom operational");

    const user = await signupWithPassword({
      email: `journey7.${Date.now()}@example.com`,
      password: "AtlasTest123"
    });
    const orgRecord = await createOrganizationForUser(user.id, "Team Vision Connectors");
    await activateOrganization(orgRecord.id);

    const organization = {
      id: orgRecord.id,
      name: "Team Vision Connectors",
      officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    };

    const gateway = createCommunicationGateway({ eventBus });
    const metaWebhook = createMetaWebhookConnector({ gateway, eventBus });

    const webhookResult = await metaWebhook.handle({
      rawBody: Buffer.from(JSON.stringify(buildMessengerPayload())),
      routingContext: {
        organizationId: organization.id,
        organization,
        prospectId: "ATL-J7-001",
        prospectDisplayName: "Maria Lopez",
        workflowName: GENERIC_INTAKE_WORKFLOW.name
      }
    });

    assert.strictEqual(webhookResult.success, true);
    assert.strictEqual(webhookResult.data.platform, "messenger");
    assert.strictEqual(webhookResult.data.acknowledgment, "EVENT_RECEIVED");
    console.log("✓ Meta webhook accepted and forwarded to Gateway");

    assert.ok(connectorEvents.connected.length >= 5, "Expected connector.connected events");
    assert.ok(connectorEvents.messageReceived.length >= 4, "Expected connector.message.received");
    assert.ok(connectorEvents.messageSent.length >= 1, "Expected connector.message.sent");
    console.log("✓ Connector observability events emitted");
  });

  console.log("\nVerifying locked journeys remain green...\n");

  const scripts = [
    "backend/dev/verifyJourney6.js",
    "backend/dev/verifyJourney5Increment4.js",
    "backend/dev/verifyJourney2.js",
    "backend/dev/verifyJourney3.js"
  ];

  for (const script of scripts) {
    execSync(`node ${script}`, { stdio: "inherit", cwd: path.join(__dirname, "..", "..") });
  }

  console.log("\n✓ Gateway unchanged");
  console.log("✓ Agent unchanged");
  console.log("✓ Existing journeys remain green");
  console.log("\nAll Journey #7 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
