/**
 * Journey #2 — First Appointment verification.
 * Run: node backend/dev/verifyJourney2.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { createCommunicationGateway, resetCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { CHANNEL } = require("../communication/models/Channel");
const { AppointmentEvent } = require("../appointments");
const appointmentStore = require("../appointments/AppointmentStore");
const { getDashboardData } = require("../appointments/AppointmentService");
const {
  signupWithPassword
} = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  activateOrganization
} = require("../services/organizationService");
const { getHomeDashboardSummary } = require("../services/onboardingService");

const ORGS_FILE = path.join(__dirname, "../data/organizations.json");

class RecruitingMockAIAdapter extends AIAdapter {
  constructor(scenario) {
    super();
    this.scenario = scenario;
  }

  async generateReply(inboundMessage) {
    const text = inboundMessage.text || "";
    const extracted = this.scenario[text] || {};
    return { text: `AI: ${text}`, provider: "mock", extracted };
  }
}

function buildWebhook(text, senderId = "USER_J2") {
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
            message: {
              mid: `mid.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
              text
            }
          }
        ]
      }
    ]
  };
}

async function runScenario(gateway, text) {
  await gateway.receive(CHANNEL.MESSENGER, buildWebhook(text));
}

async function run() {
  console.log("Journey #2 — First Appointment verification\n");

  resetCommunicationGateway();
  appointmentStore.clearStore();

  if (fs.existsSync(ORGS_FILE)) {
    fs.unlinkSync(ORGS_FILE);
  }

  const scenario = {
    "Hi there": {},
    Hello: {},
    "Tampa, FL": { city: "Tampa", state: "FL" },
    yes: { authorizedToWork: true },
    "Tell me more": {},
    "Maria Lopez, maria@example.com, 813-555-0100": {
      name: "Maria Lopez",
      email: "maria@example.com",
      phone: "813-555-0100"
    },
    "office interview please": { interviewType: "office" },
    "tomorrow morning": { preferredDate: "tomorrow", preferredTime: "morning" },
    Thanks: {},
    "See you then": {}
  };

  const captured = [];
  const confirmedEvents = [];

  const { gateway, eventBus, messengerConnector } = createCommunicationGateway({
    aiAdapter: new RecruitingMockAIAdapter(scenario),
    registerRecruitingWorkflow: true
  });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  eventBus.on(AppointmentEvent.SCHEDULED, (payload) => captured.push(payload));
  eventBus.on(AppointmentEvent.CONFIRMED, (payload) => confirmedEvents.push(payload));

  const user = await signupWithPassword({
    email: `journey2.${Date.now()}@example.com`,
    password: "AtlasTest123"
  });
  const organization = await createOrganizationForUser(user.id, "Team Vision Journey 2");
  await activateOrganization(organization.id);

  for (const message of Object.keys(scenario)) {
    await runScenario(gateway, message);
  }

  assert.ok(captured.length >= 1, "Expected appointment.scheduled event");
  console.log("✓ Interview request books first appointment");

  assert.ok(confirmedEvents.length >= 1, "Expected appointment.confirmed event");
  const confirmedPayload = confirmedEvents[0];
  assert.ok(confirmedPayload.appointment, "Expected appointment in confirmed payload");
  assert.ok(confirmedPayload.confirmation, "Expected confirmation in confirmed payload");
  assert.ok(confirmedPayload.organization, "Expected organization in confirmed payload");
  assert.ok(confirmedPayload.prospect, "Expected prospect in confirmed payload");
  assert.strictEqual(confirmedPayload.appointment.status, "confirmed");
  assert.ok(
    confirmedPayload.confirmation.confirmationMessage.includes("You're all set!"),
    "Expected friendly confirmation message"
  );
  assert.ok(
    confirmedPayload.confirmation.confirmationMessage.includes("Team Vision Office"),
    "Expected office location in confirmation message"
  );
  console.log("✓ Confirmation generated and appointment.confirmed emitted");

  const storedConfirmation = await appointmentStore.getConfirmation(
    confirmedPayload.appointment.id
  );
  assert.ok(storedConfirmation, "Expected confirmation stored on appointment");
  assert.ok(storedConfirmation.confirmationMessage);
  console.log("✓ Confirmation stored on appointment record");

  const dashboard = await getDashboardData(organization.id);
  assert.ok(dashboard.nextMeeting, "Expected next meeting on dashboard data");
  assert.strictEqual(dashboard.nextMeeting.prospectName, "Maria Lopez");
  assert.strictEqual(dashboard.nextMeeting.status, "confirmed");
  assert.ok(dashboard.nextMeeting.confirmation);
  console.log("✓ Next meeting available for organization");

  const homeSummary = await getHomeDashboardSummary(user);
  assert.ok(homeSummary.nextMeeting);
  assert.ok(homeSummary.atlasActivity.length >= 1);
  assert.ok(
    homeSummary.atlasActivity.some((entry) =>
      entry.message.includes("Appointment confirmed for Maria Lopez.")
    ),
    "Expected confirmation activity on home dashboard"
  );
  assert.ok(homeSummary.newProspects.length >= 1);
  console.log("✓ Home dashboard summary populated");

  console.log("\nAll Journey #2 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
