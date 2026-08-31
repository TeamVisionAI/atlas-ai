/**
 * BR-191 — every appointment create path uses the same reminder engine.
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

require("dotenv").config();

const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  scheduleReminders,
  replaceReminders,
  cancelReminders,
  repairMissingRemindersForAppointment,
  repairMissingReminders,
  resolveReminderRecipientPhone,
  resolveAppointmentReminderSchedule,
  stopReminderPoller
} = require("../services/appointmentReminderEngine");
const { REMINDER_STATUSES } = require("../core/configuration/appointmentDomain");
const {
  createMemoryAppointmentReminderRepository,
  setAppointmentReminderRepositoryForTests,
  resetAppointmentReminderRepositoryCache
} = require("../repositories/appointmentReminderRepository");

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "+17865550191";

let memoryRepo;

function futureStart(hoursAhead) {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
}

function recruitingAppointment(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    organizationId: ORG,
    prospectPhone: PHONE,
    status: "scheduled",
    startDateTime: futureStart(72),
    timezone: "America/New_York",
    meetingType: "in_person",
    ...overrides
  };
}

function agendaAppointment(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    organizationId: ORG,
    prospectId: null,
    prospectPhone: null,
    status: "scheduled",
    startDateTime: futureStart(72),
    timezone: "America/New_York",
    meetingType: "virtual",
    metadata: {
      standaloneAgenda: true,
      agendaContactPhone: PHONE,
      agendaContactName: "Agenda Guest",
      prospectEmail: null
    },
    ...overrides
  };
}

async function activeTypes(appointmentId) {
  const rows = await memoryRepo.listByAppointmentId(appointmentId);
  return rows
    .filter((row) => row.status === REMINDER_STATUSES.SCHEDULED)
    .map((row) => row.reminderType)
    .sort();
}

describe("BR-191 appointment reminder coverage", () => {
  beforeEach(() => {
    memoryRepo = createMemoryAppointmentReminderRepository();
    setAppointmentReminderRepositoryForTests(memoryRepo);
  });

  afterEach(() => {
    stopReminderPoller();
    resetAppointmentReminderRepositoryCache();
  });

  test("docs: BR-191 documented", () => {
    const rules = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BR-191-appointment-reminders.md"),
      "utf8"
    );
    assert.match(rules, /# BR-191/);
    assert.match(rules, /Appointment Reminders After Every Create Path/);
  });

  test("source: Add Agenda and canonical create share scheduleReminders", () => {
    const agenda = fs.readFileSync(
      path.join(__dirname, "../application/agendaApplicationService.js"),
      "utf8"
    );
    const appointments = fs.readFileSync(
      path.join(__dirname, "../application/appointmentApplicationService.js"),
      "utf8"
    );
    assert.match(agenda, /appointmentReminderEngine\.scheduleReminders/);
    assert.match(appointments, /appointmentReminderEngine\.scheduleReminders/);
    assert.match(appointments, /appointmentReminderEngine\.replaceReminders/);
    assert.match(appointments, /appointmentReminderEngine\.cancelReminders/);
    assert.doesNotMatch(agenda, /emailInvitationStatus[\s\S]{0,80}scheduleReminders/);
  });

  test("Add Agenda standalone appointment creates WhatsApp reminder jobs without email", async () => {
    const appointment = agendaAppointment();
    assert.equal(appointment.prospectPhone, null);
    assert.equal(appointment.metadata.prospectEmail, null);
    assert.equal(resolveReminderRecipientPhone(appointment), PHONE);

    const scheduled = await scheduleReminders(appointment);
    assert.equal(scheduled.count, 3);
    assert.deepEqual(await activeTypes(appointment.id), [
      "reminder_1h",
      "reminder_24h",
      "reminder_30m"
    ]);
    const rows = await memoryRepo.listByAppointmentId(appointment.id);
    assert.ok(rows.every((row) => row.prospectPhone === PHONE));
    assert.ok(rows.every((row) => row.timezone === "America/New_York"));
    assert.ok(rows.every((row) => !String(row.prospectPhone || "").includes("@")));
  });

  test("AI / recruiting scheduling still creates the same cadence", async () => {
    const appointment = recruitingAppointment();
    const scheduled = await scheduleReminders(appointment);
    assert.equal(scheduled.count, 3);
    assert.deepEqual(await activeTypes(appointment.id), [
      "reminder_1h",
      "reminder_24h",
      "reminder_30m"
    ]);
  });

  test("org reminder offsets are respected and not hardcoded in Agenda", async () => {
    const schedule = resolveAppointmentReminderSchedule({
      appointmentReminderOffsetsMinutes: [60, 30]
    });
    assert.deepEqual(
      schedule.map((row) => row.offsetMinutes),
      [60, 30]
    );

    const appointment = agendaAppointment();
    const scheduled = await scheduleReminders(appointment, {
      settings: { appointmentReminderOffsetsMinutes: [60, 30] }
    });
    assert.deepEqual(await activeTypes(appointment.id), ["reminder_1h", "reminder_30m"]);
    assert.equal(scheduled.count, 2);

    const agendaSrc = fs.readFileSync(
      path.join(__dirname, "../application/agendaApplicationService.js"),
      "utf8"
    );
    assert.doesNotMatch(agendaSrc, /24 \* 60|reminder_24h|offsetMinutes:\s*1440/);
  });

  test("reschedule cancels old pending jobs and creates jobs for the new start", async () => {
    const appointment = recruitingAppointment();
    await scheduleReminders(appointment);
    const first = (await memoryRepo.listByAppointmentId(appointment.id))
      .filter((row) => row.status === REMINDER_STATUSES.SCHEDULED)
      .map((row) => row.scheduledFor)
      .sort();

    const moved = { ...appointment, startDateTime: futureStart(120) };
    await replaceReminders(moved);

    const rows = await memoryRepo.listByAppointmentId(appointment.id);
    const active = rows.filter((row) => row.status === REMINDER_STATUSES.SCHEDULED);
    const cancelled = rows.filter((row) => row.status === REMINDER_STATUSES.CANCELLED);
    assert.equal(active.length, 3);
    assert.ok(cancelled.length >= 3);
    const second = active.map((row) => row.scheduledFor).sort();
    assert.notDeepEqual(second, first);
    assert.ok(active.every((row) => row.appointmentStart === moved.startDateTime));
  });

  test("cancellation removes pending reminders and leaves sent history", async () => {
    const appointment = recruitingAppointment();
    await scheduleReminders(appointment);
    const rows = await memoryRepo.listByAppointmentId(appointment.id);
    const sent = rows.find((row) => row.reminderType === "reminder_24h");
    await memoryRepo.saveEntry({
      ...sent,
      status: REMINDER_STATUSES.SENT,
      sentAt: new Date().toISOString()
    });

    await cancelReminders(appointment.id);
    const after = await memoryRepo.listByAppointmentId(appointment.id);
    assert.equal(
      after.filter((row) => row.status === REMINDER_STATUSES.SCHEDULED).length,
      0
    );
    assert.equal(
      after.filter((row) => row.reminderType === "reminder_24h")[0].status,
      REMINDER_STATUSES.SENT
    );
  });

  test("duplicate scheduleReminders is idempotent", async () => {
    const appointment = agendaAppointment();
    const first = await scheduleReminders(appointment);
    const second = await scheduleReminders(appointment);
    assert.equal(first.createdCount, 3);
    assert.equal(second.createdCount, 0);
    assert.equal((await memoryRepo.listByAppointmentId(appointment.id)).filter((row) => row.status === REMINDER_STATUSES.SCHEDULED).length, 3);
    assert.deepEqual(await activeTypes(appointment.id), [
      "reminder_1h",
      "reminder_24h",
      "reminder_30m"
    ]);
  });

  test("backfill repairs missing future jobs only and never inserts past reminders", async () => {
    const soon = recruitingAppointment({
      startDateTime: new Date(Date.now() + 45 * 60 * 1000).toISOString()
    });
    const missing = agendaAppointment();
    const complete = recruitingAppointment({ id: crypto.randomUUID() });
    await scheduleReminders(complete);

    const appointmentRepoPath = require.resolve("../repositories/appointmentRepository");
    const appointmentRepo = require(appointmentRepoPath);
    const originalSearch = appointmentRepo.search;
    appointmentRepo.search = async () => ({
      items: [soon, missing, complete],
      total: 3
    });

    try {
      const report = await repairMissingReminders({ organizationId: ORG });
      assert.equal(report.scanned, 3);
      const soonTypes = await activeTypes(soon.id);
      assert.ok(!soonTypes.includes("reminder_24h"));
      assert.ok(!soonTypes.includes("reminder_1h"));
      assert.deepEqual(soonTypes, ["reminder_30m"]);
      assert.deepEqual(await activeTypes(missing.id), [
        "reminder_1h",
        "reminder_24h",
        "reminder_30m"
      ]);
      assert.equal(await activeTypes(complete.id).then((types) => types.length), 3);
      const soonRows = await memoryRepo.listByAppointmentId(soon.id);
      assert.ok(
        soonRows.every((row) => Date.parse(row.scheduledFor) > Date.now() - 60_000)
      );
    } finally {
      appointmentRepo.search = originalSearch;
    }
  });

  test("repair of a past or cancelled appointment creates nothing", async () => {
    const past = recruitingAppointment({
      startDateTime: new Date(Date.now() - 60 * 60 * 1000).toISOString()
    });
    const cancelled = recruitingAppointment({ status: "cancelled" });
    const pastResult = await repairMissingRemindersForAppointment(past);
    const cancelledResult = await repairMissingRemindersForAppointment(cancelled);
    assert.equal(pastResult.createdCount, 0);
    assert.equal(cancelledResult.createdCount, 0);
    assert.equal((await memoryRepo.listByAppointmentId(past.id)).length, 0);
    assert.equal((await memoryRepo.listByAppointmentId(cancelled.id)).length, 0);
  });
});
