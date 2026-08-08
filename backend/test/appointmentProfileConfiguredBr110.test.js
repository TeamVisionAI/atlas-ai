/**
 * BR-110 — configured vs engine-default appointment profiles + self-scope.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isAppointmentProfileConfigured,
  normalizeAppointmentProfile,
  buildDefaultWeekSchedule
} = require("../services/appointmentProfileService");
const appointmentController = require("../controllers/appointmentController");
const appointmentApplicationService = require("../application/appointmentApplicationService");

test("persisted 7-day workingSchedule → profileConfigured true", () => {
  const raw = {
    workingSchedule: buildDefaultWeekSchedule().map((day) => ({
      ...day,
      enabled: day.dayOfWeek >= 1 && day.dayOfWeek <= 5,
      blocks:
        day.dayOfWeek >= 1 && day.dayOfWeek <= 5
          ? [{ start: "09:00", end: "21:00" }]
          : []
    }))
  };
  assert.equal(isAppointmentProfileConfigured(raw), true);
});

test("missing / empty appointmentProfile → profileConfigured false", () => {
  assert.equal(isAppointmentProfileConfigured(null), false);
  assert.equal(isAppointmentProfileConfigured(undefined), false);
  assert.equal(isAppointmentProfileConfigured({}), false);
  assert.equal(isAppointmentProfileConfigured({ defaults: { timezone: "America/New_York" } }), false);
});

test("engine normalize still supplies default schedule when unconfigured", () => {
  const normalized = normalizeAppointmentProfile({}, "America/New_York");
  assert.equal(normalized.workingSchedule.length, 7);
  const monday = normalized.workingSchedule.find((d) => d.dayOfWeek === 1);
  assert.equal(monday.enabled, true);
  assert.deepEqual(monday.blocks, [{ start: "09:00", end: "17:00" }]);
  // But the raw empty object is still unconfigured.
  assert.equal(isAppointmentProfileConfigured({}), false);
});

test("controller getProfile / updateProfile bind only tenantContext.userId", () => {
  const getSrc = appointmentController.getProfile.toString();
  const patchSrc = appointmentController.updateProfile.toString();
  assert.match(getSrc, /tenantContext\.userId/);
  assert.match(patchSrc, /tenantContext\.userId/);
  assert.doesNotMatch(getSrc, /req\.params\.userId|req\.body\.userId/);
  assert.doesNotMatch(patchSrc, /req\.params\.userId|req\.body\.agentId/);
});

test("application getProfile/updateProfile pass through agentId without cross-user override API", () => {
  assert.equal(typeof appointmentApplicationService.getProfile, "function");
  assert.equal(typeof appointmentApplicationService.updateProfile, "function");
  const updateSrc = appointmentApplicationService.updateProfile.toString();
  // No alternate targetUserId parameter in the public signature path.
  assert.match(updateSrc, /updateAppointmentProfile/);
});

test("production/shadow agent resolution does not require profileConfigured", () => {
  const readerSrc = require("fs").readFileSync(
    require("path").join(
      __dirname,
      "../core/recruitAiV2/schedulingAvailabilityReader.js"
    ),
    "utf8"
  );
  // Canonical owner chain must remain independent of Playground configured-profile bind.
  assert.match(readerSrc, /EXISTING_BR080_OWNER/);
  assert.match(readerSrc, /ORG_DEFAULT/);
  assert.doesNotMatch(readerSrc, /profileConfigured|isAppointmentProfileConfigured/);
});
