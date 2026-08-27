/**
 * Appointment Settings profile payload uses current personal calendars
 * and fails closed on the Super Admin control plane.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(__dirname, "../controllers/appointmentController.js"),
  "utf8"
);
const routes = fs.readFileSync(path.join(__dirname, "../routes/appointments.js"), "utf8");
const plane = fs.readFileSync(
  path.join(__dirname, "../core/operationalControlPlane.js"),
  "utf8"
);

test("getProfile reads personal Google and iCloud, not org-legacy only", () => {
  assert.match(controller, /getPersonalIntegrationStatus/);
  assert.match(controller, /icloudCalendarIntegrationService/);
  assert.match(controller, /calendarSources/);
  assert.match(controller, /organizationOffice/);
  assert.match(controller, /tenantContext\.organizationId/);
  assert.match(controller, /tenantContext\.userId/);
  assert.doesNotMatch(controller, /DEFAULT_ORGANIZATION_ID/);
  assert.doesNotMatch(controller, /fetchOrganizationLegacyIntegration/);
});

test("profile GET\/PATCH stay empty on the Super Admin control plane", () => {
  assert.match(plane, /function emptyAppointmentProfile/);
  assert.match(routes, /operationalControlPlaneEmpty\(emptyAppointmentProfile\)/);
});

test("save path remains self-scoped appointmentProfile", () => {
  const updateSrc = fs.readFileSync(
    path.join(__dirname, "../controllers/appointmentController.js"),
    "utf8"
  );
  assert.match(updateSrc, /updateProfile\(/);
  assert.match(updateSrc, /tenantContext\.userId/);
});
