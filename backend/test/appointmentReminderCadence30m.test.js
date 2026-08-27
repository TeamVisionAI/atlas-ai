/**
 * Global appointment reminder cadence: 24h + 1h + 30m (replaces 15m).
 * Shared engine for Team Vision and Team Legacy — not tenant-configurable.
 * DR1 — uses durable in-memory repository in tests (no JSON file).
 */

require("dotenv").config();

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const {
  REMINDER_TYPES,
  REMINDER_SCHEDULE,
  scheduleReminders,
  replaceReminders,
  cancelReminders,
  buildReminderMessage,
  migratePendingFifteenMinuteReminders,
  deliverReminder,
  stopReminderPoller
} = require("../services/appointmentReminderEngine");
const { REMINDER_STATUSES } = require("../core/configuration/appointmentDomain");
const {
  createMemoryAppointmentReminderRepository,
  setAppointmentReminderRepositoryForTests,
  resetAppointmentReminderRepositoryCache
} = require("../repositories/appointmentReminderRepository");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

let memoryRepo;

async function activeTypes(appointmentId) {
  const rows = await memoryRepo.listByAppointmentId(appointmentId);
  return rows
    .filter((row) => row.status === REMINDER_STATUSES.SCHEDULED)
    .map((row) => row.reminderType)
    .sort();
}

async function allStatuses(appointmentId) {
  const rows = await memoryRepo.listByAppointmentId(appointmentId);
  return rows.map((row) => ({
    type: row.reminderType,
    status: row.status
  }));
}

test.beforeEach(() => {
  stopReminderPoller();
  memoryRepo = createMemoryAppointmentReminderRepository();
  setAppointmentReminderRepositoryForTests(memoryRepo);
});

test.afterEach(() => {
  stopReminderPoller();
  resetAppointmentReminderRepositoryCache();
});

test("1. new appointment schedules 24h + 1h + 30m only", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TV,
    prospectPhone: "+15555550301",
    startDateTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York",
    meetingType: "in_person",
    meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  };

  const scheduled = await scheduleReminders(appointment);
  assert.equal(scheduled.count, 3);
  assert.deepEqual(await activeTypes(appointment.id), [
    "reminder_1h",
    "reminder_24h",
    "reminder_30m"
  ]);
  assert.equal((await activeTypes(appointment.id)).includes("reminder_15m"), false);

  await cancelReminders(appointment.id);
});

test("2. schedule never includes reminder_15m", () => {
  assert.deepEqual(
    REMINDER_SCHEDULE.map((row) => row.type),
    [
      REMINDER_TYPES.REMINDER_24H,
      REMINDER_TYPES.REMINDER_1H,
      REMINDER_TYPES.REMINDER_30M
    ]
  );
  assert.equal(
    REMINDER_SCHEDULE.some((row) => row.type === REMINDER_TYPES.REMINDER_15M),
    false
  );
  assert.equal(
    REMINDER_SCHEDULE.some((row) => row.offsetMinutes === 15),
    false
  );
  assert.equal(
    REMINDER_SCHEDULE.find((row) => row.type === REMINDER_TYPES.REMINDER_30M)?.offsetMinutes,
    30
  );
});

test("3-4. reschedule recalculates exactly three active reminders with no duplicates", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TL,
    prospectPhone: "+15555550302",
    startDateTime: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York",
    meetingType: "virtual",
    virtualMeetingUrl: "https://us02web.zoom.us/j/5572841859",
    meetingProvider: "zoom"
  };

  await scheduleReminders(appointment);
  const moved = {
    ...appointment,
    startDateTime: new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString()
  };
  await replaceReminders(moved);

  const active = await activeTypes(appointment.id);
  assert.deepEqual(active, ["reminder_1h", "reminder_24h", "reminder_30m"]);
  assert.equal(active.filter((t) => t === "reminder_30m").length, 1);
  assert.equal(active.filter((t) => t === "reminder_15m").length, 0);

  await cancelReminders(appointment.id);
});

test("5. cancel suppresses all three", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TV,
    prospectPhone: "+15555550303",
    startDateTime: new Date(Date.now() + 80 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };

  await scheduleReminders(appointment);
  await cancelReminders(appointment.id);
  const statuses = await allStatuses(appointment.id);
  assert.ok(statuses.length >= 3);
  assert.equal(
    statuses.every((row) => row.status === REMINDER_STATUSES.CANCELLED),
    true
  );
  assert.equal((await activeTypes(appointment.id)).length, 0);
});

test("6-8. TV/TL identity and location copy unchanged for 30m", () => {
  const when = "2030-06-01T15:00:00.000Z";
  const tvMsg = buildReminderMessage(
    {
      startDateTime: when,
      timezone: "America/New_York",
      meetingType: "in_person",
      meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    },
    REMINDER_TYPES.REMINDER_30M,
    { name: "Alex", preferred_language: "en" },
    { handoffDisplayName: "Team Vision", displayName: "Team Vision" }
  );
  assert.match(tvMsg, /30 minutes/i);
  assert.match(tvMsg, /Team Vision/);
  assert.doesNotMatch(tvMsg, /Team Legacy/);
  assert.match(tvMsg, /office/i);

  const tlMsg = buildReminderMessage(
    {
      startDateTime: when,
      timezone: "America/New_York",
      meetingType: "virtual",
      virtualMeetingUrl: "https://us02web.zoom.us/j/5572841859?pwd=x"
    },
    REMINDER_TYPES.REMINDER_30M,
    { name: "Sam", preferred_language: "es" },
    { handoffDisplayName: "Team Legacy", displayName: "Team Legacy" }
  );
  assert.match(tlMsg, /30 minutos/i);
  assert.match(tlMsg, /Team Legacy/);
  assert.doesNotMatch(tlMsg, /Team Vision/);
  assert.match(tlMsg, /5572841859/);
  assert.doesNotMatch(tlMsg, /7862967254/);
});

test("missing identity never signs a reminder as Team Vision", () => {
  const msg = buildReminderMessage(
    {
      startDateTime: "2030-06-01T15:00:00.000Z",
      timezone: "America/New_York",
      meetingType: "virtual",
      virtualMeetingUrl: "https://zoom.example/x",
      organizationId: ORG_TL
    },
    REMINDER_TYPES.REMINDER_30M,
    { name: "Sam", preferred_language: "en" },
    {}
  );
  assert.match(msg, /Atlas/);
  assert.doesNotMatch(msg, /Team Vision/);
});

test("pending reminder_15m migrates to 30m without dual delivery", async () => {
  const appointmentId = crypto.randomUUID();
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const memStore = {
    [appointmentId]: [
      {
        id: "legacy-15",
        appointmentId,
        organizationId: ORG_TL,
        prospectPhone: "+15555550304",
        reminderType: REMINDER_TYPES.REMINDER_15M,
        scheduledFor: new Date(start.getTime() - 15 * 60 * 1000).toISOString(),
        offsetMinutes: 15,
        status: REMINDER_STATUSES.SCHEDULED,
        channel: "whatsapp",
        appointmentStart: start.toISOString(),
        timezone: "America/New_York",
        meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
      },
      {
        id: "keep-24",
        appointmentId,
        organizationId: ORG_TL,
        prospectPhone: "+15555550304",
        reminderType: REMINDER_TYPES.REMINDER_24H,
        scheduledFor: new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        offsetMinutes: 1440,
        status: REMINDER_STATUSES.SCHEDULED,
        channel: "whatsapp",
        appointmentStart: start.toISOString()
      }
    ]
  };

  const result = await migratePendingFifteenMinuteReminders(memStore);
  assert.equal(result.cancelled15m, 1);
  assert.equal(result.added30m, 1);

  const after = memStore[appointmentId];
  assert.equal(
    after.filter(
      (row) =>
        row.reminderType === REMINDER_TYPES.REMINDER_15M &&
        row.status === REMINDER_STATUSES.SCHEDULED
    ).length,
    0
  );
  assert.equal(
    after.filter(
      (row) =>
        row.reminderType === REMINDER_TYPES.REMINDER_30M &&
        row.status === REMINDER_STATUSES.SCHEDULED
    ).length,
    1
  );

  const suppressed = await deliverReminder(
    {
      reminderType: REMINDER_TYPES.REMINDER_15M,
      prospectPhone: "+15555550304",
      organizationId: ORG_TL,
      appointmentId
    },
    { id: appointmentId, organizationId: ORG_TL, prospectPhone: "+15555550304" }
  );
  assert.equal(suppressed.suppressed, true);
  assert.equal(suppressed.reason, "LEGACY_REMINDER_15M_SUPPRESSED");
});
