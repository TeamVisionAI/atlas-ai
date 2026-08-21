/**
 * DR1 — Durable appointment reminder storage.
 * Cadence unchanged (24h / 1h / 30m). Persistence must survive process restart.
 */

require("dotenv").config();

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { REMINDER_STATUSES } = require("../core/configuration/appointmentDomain");
const {
  createMemoryAppointmentReminderRepository,
  setAppointmentReminderRepositoryForTests,
  resetAppointmentReminderRepositoryCache
} = require("../repositories/appointmentReminderRepository");
const {
  REMINDER_TYPES,
  REMINDER_SCHEDULE,
  scheduleReminders,
  replaceReminders,
  cancelReminders,
  processDueReminders,
  migratePendingFifteenMinuteReminders,
  deliverReminder,
  stopReminderPoller
} = require("../services/appointmentReminderEngine");
const {
  auditJsonReminderStoreForDurableImport
} = require("../core/appointmentReminderStoreMigration");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

let memoryRepo;

function freshRepo() {
  memoryRepo = createMemoryAppointmentReminderRepository();
  setAppointmentReminderRepositoryForTests(memoryRepo);
  return memoryRepo;
}

async function activeTypes(appointmentId) {
  const rows = await memoryRepo.listByAppointmentId(appointmentId);
  return rows
    .filter((row) => row.status === REMINDER_STATUSES.SCHEDULED)
    .map((row) => row.reminderType)
    .sort();
}

test.beforeEach(() => {
  stopReminderPoller();
  freshRepo();
});

test.afterEach(() => {
  stopReminderPoller();
  resetAppointmentReminderRepositoryCache();
});

test("1. create >24h → 24h/1h/30m", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TV,
    prospectPhone: "+15555551001",
    startDateTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };

  const scheduled = await scheduleReminders(appointment);
  assert.equal(scheduled.count, 3);
  assert.deepEqual(await activeTypes(appointment.id), [
    "reminder_1h",
    "reminder_24h",
    "reminder_30m"
  ]);
});

test("2. create <24h → only future reminders", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TL,
    prospectPhone: "+15555551002",
    startDateTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };

  const scheduled = await scheduleReminders(appointment);
  const active = await activeTypes(appointment.id);
  assert.equal(active.includes("reminder_24h"), false);
  assert.deepEqual(active, ["reminder_1h", "reminder_30m"]);
  assert.equal(scheduled.count, 2);
});

test("3. no 15m generated", async () => {
  assert.equal(
    REMINDER_SCHEDULE.some((row) => row.type === REMINDER_TYPES.REMINDER_15M),
    false
  );
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TV,
    prospectPhone: "+15555551003",
    startDateTime: new Date(Date.now() + 80 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };
  await scheduleReminders(appointment);
  assert.equal((await activeTypes(appointment.id)).includes("reminder_15m"), false);
});

test("4+10. restart durability — poller resumes from durable state", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TL,
    prospectPhone: "+15555551004",
    startDateTime: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York",
    meetingType: "in_person"
  };

  await scheduleReminders(appointment);
  const before = await memoryRepo.listByAppointmentId(appointment.id);
  assert.equal(before.filter((r) => r.status === REMINDER_STATUSES.SCHEDULED).length, 3);

  // Simulate process restart: new engine consumers resolve the same durable repo instance.
  resetAppointmentReminderRepositoryCache();
  setAppointmentReminderRepositoryForTests(memoryRepo);

  const afterRestart = await memoryRepo.listByAppointmentId(appointment.id);
  assert.equal(afterRestart.length, before.length);
  assert.deepEqual(
    afterRestart.map((r) => r.reminderType).sort(),
    before.map((r) => r.reminderType).sort()
  );

  // Due processing continues from durable rows (none due yet → processed 0).
  const poll = await processDueReminders();
  assert.equal(poll.processed, 0);
  assert.equal((await activeTypes(appointment.id)).length, 3);
});

test("5. reschedule replacement", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TV,
    prospectPhone: "+15555551005",
    startDateTime: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };

  await scheduleReminders(appointment);
  const first = await memoryRepo.listByAppointmentId(appointment.id);
  const firstTimes = first
    .filter((r) => r.status === REMINDER_STATUSES.SCHEDULED)
    .map((r) => r.scheduledFor)
    .sort();

  const moved = {
    ...appointment,
    startDateTime: new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString()
  };
  await replaceReminders(moved);

  const second = await memoryRepo.listByAppointmentId(appointment.id);
  const active = second.filter((r) => r.status === REMINDER_STATUSES.SCHEDULED);
  assert.equal(active.length, 3);
  const secondTimes = active.map((r) => r.scheduledFor).sort();
  assert.notDeepEqual(secondTimes, firstTimes);
});

test("6. no duplicates active type", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TL,
    prospectPhone: "+15555551006",
    startDateTime: new Date(Date.now() + 70 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };

  await scheduleReminders(appointment);
  await scheduleReminders(appointment);
  const active = await activeTypes(appointment.id);
  assert.deepEqual(active, ["reminder_1h", "reminder_24h", "reminder_30m"]);
  assert.equal(active.filter((t) => t === "reminder_30m").length, 1);
});

test("7. cancel suppression", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG_TV,
    prospectPhone: "+15555551007",
    startDateTime: new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };

  await scheduleReminders(appointment);
  await cancelReminders(appointment.id);
  const rows = await memoryRepo.listByAppointmentId(appointment.id);
  assert.ok(rows.length >= 3);
  assert.equal(
    rows.every((row) => row.status === REMINDER_STATUSES.CANCELLED),
    true
  );
  assert.equal((await activeTypes(appointment.id)).length, 0);
});

test("8. tenant isolation", async () => {
  const sharedLikeId = crypto.randomUUID();
  const tvAppt = {
    id: sharedLikeId,
    organizationId: ORG_TV,
    prospectPhone: "+15555551008",
    startDateTime: new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };
  // Distinct appointment IDs (UUIDs) — same phone across tenants must not collide in store.
  const tlAppt = {
    id: crypto.randomUUID(),
    organizationId: ORG_TL,
    prospectPhone: "+15555551008",
    startDateTime: new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };

  await scheduleReminders(tvAppt);
  await scheduleReminders(tlAppt);

  const tvRows = await memoryRepo.listByOrganizationId(ORG_TV);
  const tlRows = await memoryRepo.listByOrganizationId(ORG_TL);

  assert.ok(tvRows.every((row) => row.organizationId === ORG_TV));
  assert.ok(tlRows.every((row) => row.organizationId === ORG_TL));
  assert.equal(
    tvRows.some((row) => row.appointmentId === tlAppt.id),
    false
  );
  assert.equal(
    tlRows.some((row) => row.appointmentId === tvAppt.id),
    false
  );

  await cancelReminders(tvAppt.id);
  assert.equal((await activeTypes(tlAppt.id)).length, 3);
  assert.equal((await activeTypes(tvAppt.id)).length, 0);
});

test("9. legacy 15m suppression/migration", async () => {
  const appointmentId = crypto.randomUUID();
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await memoryRepo.replaceAllForAppointment(appointmentId, [
    {
      id: crypto.randomUUID(),
      appointmentId,
      organizationId: ORG_TL,
      prospectPhone: "+15555551009",
      reminderType: REMINDER_TYPES.REMINDER_15M,
      scheduledFor: new Date(start.getTime() - 15 * 60 * 1000).toISOString(),
      offsetMinutes: 15,
      status: REMINDER_STATUSES.SCHEDULED,
      channel: "whatsapp",
      appointmentStart: start.toISOString(),
      timezone: "America/New_York"
    }
  ]);

  const result = await migratePendingFifteenMinuteReminders();
  assert.equal(result.cancelled15m, 1);
  assert.equal(result.added30m, 1);

  const rows = await memoryRepo.listByAppointmentId(appointmentId);
  assert.equal(
    rows.filter(
      (r) =>
        r.reminderType === REMINDER_TYPES.REMINDER_15M &&
        r.status === REMINDER_STATUSES.SCHEDULED
    ).length,
    0
  );
  assert.equal(
    rows.filter(
      (r) =>
        r.reminderType === REMINDER_TYPES.REMINDER_30M &&
        r.status === REMINDER_STATUSES.SCHEDULED
    ).length,
    1
  );

  const suppressed = await deliverReminder(
    {
      reminderType: REMINDER_TYPES.REMINDER_15M,
      prospectPhone: "+15555551009",
      organizationId: ORG_TL,
      appointmentId
    },
    { id: appointmentId, organizationId: ORG_TL, prospectPhone: "+15555551009" }
  );
  assert.equal(suppressed.suppressed, true);
  assert.equal(suppressed.reason, "LEGACY_REMINDER_15M_SUPPRESSED");
});

test("11. reminder delivery state persists", async () => {
  const appointmentId = crypto.randomUUID();
  const entry = {
    id: crypto.randomUUID(),
    appointmentId,
    organizationId: ORG_TV,
    prospectPhone: "+15555551011",
    reminderType: REMINDER_TYPES.CONFIRMATION,
    scheduledFor: new Date(Date.now() - 60_000).toISOString(),
    offsetMinutes: 0,
    status: REMINDER_STATUSES.SCHEDULED,
    channel: "whatsapp",
    appointmentStart: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    timezone: "America/New_York"
  };
  await memoryRepo.replaceAllForAppointment(appointmentId, [entry]);

  const poll = await processDueReminders();
  assert.ok(poll.processed >= 1);

  const rows = await memoryRepo.listByAppointmentId(appointmentId);
  const confirmation = rows.find((r) => r.reminderType === REMINDER_TYPES.CONFIRMATION);
  assert.equal(confirmation.status, REMINDER_STATUSES.CANCELLED);
  assert.ok(confirmation.cancelledAt || confirmation.failureReason);
});

test("12. JSON migration audit skips fixtures; does not auto-import", () => {
  const store = {
    "test-appt-1": [
      {
        status: "scheduled",
        reminderType: "reminder_15m",
        organizationId: ORG_TV
      }
    ],
    "48ced550-f960-4208-b6ba-33359193c1b5": [
      {
        status: "scheduled",
        reminderType: "reminder_1h",
        organizationId: ORG_TL
      }
    ]
  };

  const report = auditJsonReminderStoreForDurableImport(store, {
    knownAppointmentIds: []
  });

  assert.ok(report.skippedFixtures.includes("test-appt-1"));
  assert.equal(report.eligibleForImport.length, 1);
  assert.equal(report.eligibleForImport[0].appointmentId, "48ced550-f960-4208-b6ba-33359193c1b5");
});
