/**
 * Sprint 12.0.3 — Production Appointment Engine verification.
 * Run: node backend/dev/verifySprint12_0_3.js
 */

const assert = require("assert");
const fs = require("fs");

const appointmentStore = require("../appointments/AppointmentStore");
const {
  PROSPECT_STATUS,
  bookProductionAppointment,
  filterSlotsByGoogleCalendar
} = require("../appointments/AppointmentEngine");
const { getSharedProspectRepository, resetSharedProspectRepository } = require("../prospects");
const { STORE_FILE: PROSPECT_STORE_FILE } = require("../prospects/ProspectRepository");
const { withSimulatorGuard } = require("./simulatorGuard");

function tomorrowAt(hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function run() {
  console.log("Sprint 12.0.3 — Production Appointment Engine verification\n");

  appointmentStore.clearStore();
  resetSharedProspectRepository();

  if (fs.existsSync(PROSPECT_STORE_FILE)) {
    fs.writeFileSync(PROSPECT_STORE_FILE, JSON.stringify({ sequence: 0, prospects: {} }, null, 2));
  }

  process.env.ATLAS_SIMULATE_EXTERNAL_COMMS = "true";

  await withSimulatorGuard(async () => {
  const repository = getSharedProspectRepository();
  const atlasProspect = {
    atlasId: "ATL-000099",
    displayName: "Maria Test",
    storageKey: "messenger:USER_CLICKIT",
    recruitingStage: "SCHEDULE",
    qualificationProgress: { missingFields: [] },
    assignedOwnerId: null,
    channelIdentities: [
      { channel: "messenger", channelUserId: "USER_CLICKIT", linkedAt: new Date().toISOString() }
    ],
    communication: { primaryChannel: "messenger", conversationIds: [] },
    conversationHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString()
  };

  await repository.save(atlasProspect);

  const startTime = tomorrowAt(10, 0).toISOString();
  const prospect = {
    phone: "messenger:USER_CLICKIT",
    name: "Maria Test",
    appointment_date: startTime,
    interview_time: "10:00 AM",
    interview_type: "Office",
    last_message: "Friday morning works"
  };

  const profile = {
    interviewType: "Office",
    preferredTime: "10:00 AM",
    email: "maria@test.com",
    city: "Miami",
    state: "FL"
  };

  const filtered = await filterSlotsByGoogleCalendar([
    { dateKey: startTime.slice(0, 10), timeKey: "10:00", interviewType: "office" }
  ]);

  assert.strictEqual(filtered.length, 1);
  console.log("✓ Google Calendar slot filter preserves open capacity slots (simulated)");

  const booked = await bookProductionAppointment({
    prospect,
    profile,
    language: "en",
    channel: "messenger",
    atlasProspectId: "ATL-000099"
  });

  assert.strictEqual(booked.success, true);
  assert.ok(booked.calendar.calendarEventId);
  assert.strictEqual(booked.prospectStatus, PROSPECT_STATUS.APPOINTMENT_BOOKED);
  assert.ok(booked.reply);
  console.log("✓ Production appointment books through Google Calendar connector (simulated)");

  const appointments = await appointmentStore.listAppointments();
  assert.strictEqual(appointments.length, 1);
  assert.strictEqual(appointments[0].calendarEventId, booked.calendar.calendarEventId);
  assert.strictEqual(appointments[0].atlasProspectId, "ATL-000099");
  assert.strictEqual(appointments[0].channel, "messenger");
  console.log("✓ Appointment persisted and linked to Atlas prospect");

  const enriched = await repository.findByAtlasId("ATL-000099");
  assert.strictEqual(enriched.recruitingStage, PROSPECT_STATUS.APPOINTMENT_BOOKED);
  assert.strictEqual(enriched.appointment.appointmentId, appointments[0].id);
  assert.strictEqual(enriched.appointment.calendarEventId, booked.calendar.calendarEventId);
  console.log("✓ Prospect status updated to APPOINTMENT_BOOKED with calendar event id");

  const duplicate = await bookProductionAppointment({
    prospect,
    profile,
    language: "en",
    channel: "messenger",
    atlasProspectId: "ATL-000099"
  });

  assert.strictEqual(duplicate.success, false);
  assert.strictEqual(duplicate.reason, "DUPLICATE_BOOKING");
  console.log("✓ Duplicate booking prevented");
  });

  delete process.env.ATLAS_SIMULATE_EXTERNAL_COMMS;

  console.log("\nAll Sprint 12.0.3 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
