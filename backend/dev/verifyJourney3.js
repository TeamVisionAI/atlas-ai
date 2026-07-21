/**
 * Journey #3 — Perfect Day verification.
 * Run: node backend/dev/verifyJourney3.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const {
  createCommunicationGateway,
  resetCommunicationGateway
} = require("../communication/gateway/createCommunicationGateway");
const { CHANNEL } = require("../communication/models/Channel");
const { AppointmentEvent } = require("../appointments");
const appointmentStore = require("../appointments/AppointmentStore");
const { MeetingEvent, MEETING_LIFECYCLE, meetingStore } = require("../meetings");
const { getMeetingDashboardData } = require("../meetings/MeetingDashboardService");
const { withSimulatorGuard } = require("../dev/simulatorGuard");
const { signupWithPassword } = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  activateOrganization,
  markCalendarConnected
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

function buildWebhook(text, senderId = "USER_J3") {
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

async function runScenario(gateway, text, senderId = "USER_J3") {
  await gateway.receive(CHANNEL.MESSENGER, buildWebhook(text, senderId));
}

async function runMeetingFlow({ label, scenario, senderId, expectZoom }) {
  resetCommunicationGateway();
  appointmentStore.clearStore();
  meetingStore.clearStore();

  if (fs.existsSync(ORGS_FILE)) {
    fs.unlinkSync(ORGS_FILE);
  }

  const events = {
    created: [],
    calendarCreated: [],
    zoomCreated: [],
    zoomSkipped: [],
    reminderCreated: [],
    ready: []
  };

  const { gateway, eventBus, messengerConnector } = createCommunicationGateway({
    aiAdapter: new RecruitingMockAIAdapter(scenario),
    registerRecruitingWorkflow: true
  });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  eventBus.on(MeetingEvent.CREATED, (payload) => events.created.push(payload));
  eventBus.on(MeetingEvent.CALENDAR_CREATED, (payload) =>
    events.calendarCreated.push(payload)
  );
  eventBus.on(MeetingEvent.ZOOM_CREATED, (payload) => events.zoomCreated.push(payload));
  eventBus.on(MeetingEvent.ZOOM_SKIPPED, (payload) => events.zoomSkipped.push(payload));
  eventBus.on(MeetingEvent.REMINDER_CREATED, (payload) =>
    events.reminderCreated.push(payload)
  );
  eventBus.on(MeetingEvent.READY, (payload) => events.ready.push(payload));

  const user = await signupWithPassword({
    email: `journey3.${label}.${Date.now()}@example.com`,
    password: "AtlasTest123"
  });
  const organization = await createOrganizationForUser(user.id, `Team Vision Journey 3 ${label}`);
  await markCalendarConnected(organization.id, "mock-refresh-token");
  await activateOrganization(organization.id);

  for (const message of Object.keys(scenario)) {
    await runScenario(gateway, message, senderId);
  }

  assert.ok(events.created.length >= 1, `[${label}] Expected meeting.created`);
  assert.ok(events.calendarCreated.length >= 1, `[${label}] Expected meeting.calendar.created`);
  assert.strictEqual(events.calendarCreated[0].calendar.status, "created");
  assert.ok(events.calendarCreated[0].calendar.calendarEventId, `[${label}] Expected calendarEventId`);

  if (expectZoom) {
    assert.ok(events.zoomCreated.length >= 1, `[${label}] Expected meeting.zoom.created`);
    assert.ok(events.zoomCreated[0].zoom.joinUrl, `[${label}] Expected Zoom join URL`);
    assert.strictEqual(events.zoomSkipped.length, 0, `[${label}] Zoom should not be skipped`);
  } else {
    assert.ok(events.zoomSkipped.length >= 1, `[${label}] Expected meeting.zoom.skipped`);
    assert.strictEqual(events.zoomCreated.length, 0, `[${label}] Zoom should not be created`);
  }

  assert.ok(events.reminderCreated.length >= 1, `[${label}] Expected meeting.reminder.created`);
  assert.ok(events.ready.length >= 1, `[${label}] Expected meeting.ready`);
  assert.strictEqual(
    events.ready[0].meeting.lifecycleStatus,
    MEETING_LIFECYCLE.MEETING_READY
  );

  const storedMeeting = await meetingStore.getMeeting(events.created[0].meeting.id);
  assert.ok(storedMeeting, `[${label}] Expected meeting stored`);
  assert.strictEqual(storedMeeting.calendar.status, "created");
  assert.ok(storedMeeting.reminders.length >= 1, `[${label}] Expected stored reminders`);

  const dashboard = await getMeetingDashboardData(organization.id);
  assert.ok(dashboard.nextMeeting, `[${label}] Expected next meeting on dashboard`);
  assert.ok(dashboard.upcomingMeetings.length >= 1, `[${label}] Expected upcoming meetings`);
  assert.strictEqual(dashboard.needsAttention.length, 0, `[${label}] Expected no attention items`);

  const homeSummary = await getHomeDashboardSummary(user);
  assert.ok(homeSummary.nextMeeting, `[${label}] Expected home next meeting`);
  assert.ok(homeSummary.upcomingMeetings.length >= 1, `[${label}] Expected home upcoming meetings`);
  assert.ok(homeSummary.atlasActivity.length >= 1, `[${label}] Expected home activity`);

  console.log(`✓ ${label} meeting lifecycle complete`);
}

async function run() {
  console.log("Journey #3 — Perfect Day verification\n");

  const officeScenario = {
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

  const zoomScenario = {
    "Hi there": {},
    Hello: {},
    "Miami, FL": { city: "Miami", state: "FL" },
    yes: { authorizedToWork: true },
    "Tell me more": {},
    "Carlos Ruiz, carlos@example.com, 305-555-0200": {
      name: "Carlos Ruiz",
      email: "carlos@example.com",
      phone: "305-555-0200"
    },
    "zoom interview please": { interviewType: "zoom" },
    "tomorrow morning": { preferredDate: "tomorrow", preferredTime: "morning" },
    Thanks: {},
    "See you then": {}
  };

  await withSimulatorGuard(async () => {
    await runMeetingFlow({
      label: "Office",
      scenario: officeScenario,
      senderId: "USER_J3_OFFICE",
      expectZoom: false
    });

    await runMeetingFlow({
      label: "Zoom",
      scenario: zoomScenario,
      senderId: "USER_J3_ZOOM",
      expectZoom: true
    });
  });

  console.log("\nAll Journey #3 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
