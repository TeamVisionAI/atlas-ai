/**
 * Sprint 18.2 — Configuration & Scheduling Foundation verification.
 * Run: node backend/dev/verifySprint18_2.js
 */

require("dotenv").config();

const { APPOINTMENT_TYPES, isValidAppointmentType } = require("../core/configuration/appointmentTypes");
const { ORGANIZATION_LEVELS, isValidOrganizationLevel } = require("../core/configuration/organizationLevels");
const { USER_ROLES } = require("../core/configuration/userRoles");
const { getAvailableSlots } = require("../services/availabilityService");
const { scheduleAppointment } = require("../services/schedulingService");
const { normalizeSchedulingSettings } = require("../services/organizationService");
const { signOAuthState, verifyOAuthState } = require("../services/googleCalendarIntegrationService");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=== Sprint 18.2 Configuration & Scheduling Verification ===\n");

  assert(isValidOrganizationLevel(ORGANIZATION_LEVELS.RVP), "RVP level valid");
  assert(isValidOrganizationLevel("INVALID") === false, "Invalid org level rejected");
  console.log("✓ Organization levels defined (informational only)");

  assert(isValidAppointmentType(APPOINTMENT_TYPES.INTERVIEW), "Interview type valid");
  assert(isValidAppointmentType(APPOINTMENT_TYPES.FNA), "FNA type valid");
  assert(isValidAppointmentType("unknown") === false, "Unknown type rejected");
  console.log("✓ Generic appointment types supported");

  assert(USER_ROLES.ORGANIZATION_OWNER, "User roles defined separately from org level");
  console.log("✓ User roles decoupled from organization level");

  const scheduling = normalizeSchedulingSettings({});
  assert(scheduling.maxConcurrentBusinessAppointments === 2, "Default scheduling settings");
  assert(scheduling.respectPersonalCalendar === true, "Respect personal calendar default");
  console.log("✓ Scheduling settings normalize with defaults");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }

  const availability = await getAvailableSlots({
    date: tomorrow.toISOString().slice(0, 10),
    appointmentType: APPOINTMENT_TYPES.MEETING,
    duration: 30
  });

  assert(Array.isArray(availability.slots), "Availability returns slots array");
  assert(availability.appointmentType === APPOINTMENT_TYPES.MEETING, "Appointment type echoed");
  console.log(`✓ AvailabilityService returned ${availability.slots.length} slot(s)`);

  if (availability.slots.length > 0) {
    const slot = availability.slots[0];
    const booked = await scheduleAppointment({
      organizationId: null,
      appointmentType: APPOINTMENT_TYPES.MEETING,
      dateKey: slot.dateKey,
      timeKey: slot.timeKey,
      duration: 30,
      metadata: { name: "Verification Prospect" }
    });

    assert(booked.success === true, "SchedulingService books generic appointment");
    console.log("✓ SchedulingService schedules generic appointment type");
  }

  const state = signOAuthState({
    organizationId: "00000000-0000-4000-8000-000000000001",
    userId: "test-user",
    exp: Date.now() + 60_000
  });
  const verified = verifyOAuthState(state);
  assert(verified?.organizationId, "OAuth state round-trip");
  console.log("✓ Google OAuth state signing verified");

  console.log("\n=== All Sprint 18.2 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
