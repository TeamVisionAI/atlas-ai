/**
 * Sprint 22 — Appointment Engine verification script.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function checkFile(relativePath) {
  const fullPath = path.join(__dirname, "..", relativePath);
  assert(fs.existsSync(fullPath), `Missing file: ${relativePath}`);
}

async function main() {
  console.log("Sprint 22 — Appointment Engine verification\n");

  checkFile("database/migrations/013_atlas_appointments.sql");
  checkFile("core/configuration/appointmentDomain.js");
  checkFile("core/emailNormalization.js");
  checkFile("services/appointmentProfileService.js");
  checkFile("services/appointmentSchedulingEngine.js");
  checkFile("services/reminderAdapterService.js");
  checkFile("services/meetingManagementService.js");
  checkFile("repositories/appointmentRepository.js");
  checkFile("application/appointmentApplicationService.js");
  checkFile("controllers/appointmentController.js");
  checkFile("routes/appointments.js");
  checkFile("test/sprint22.test.js");

  const domain = require("../core/configuration/appointmentDomain");
  assert(domain.APPOINTMENT_STATUSES.SCHEDULED === "scheduled", "appointment statuses exported");

  const profileService = require("../services/appointmentProfileService");
  const schedule = profileService.buildDefaultWeekSchedule();
  assert(schedule.length === 7, "default week schedule has 7 days");

  const email = require("../core/emailNormalization");
  assert(email.normalizeEmail(" Test@Gmail.con ") === "test@gmail.com", "email normalization works");

  const appointmentService = require("../application/appointmentApplicationService");
  assert(typeof appointmentService.listAppointments === "function", "listAppointments exported");
  assert(typeof appointmentService.rescheduleAppointment === "function", "reschedule exported");

  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert(serverSource.includes("/api/appointments"), "appointments route mounted in server.js");

  console.log("✅ Sprint 22 verification passed");
}

main().catch((error) => {
  console.error("❌ Sprint 22 verification failed:", error.message);
  process.exit(1);
});
