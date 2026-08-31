/**
 * BR-185 — appointment settings lead time + timezone rendering.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildFollowUpDueDate } from "../../engines/followUpsViewModel.js";
import { formatFriendlyAppointmentWhen } from "../../engines/agentNotificationPresentation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Appointment Settings exposes minimum booking lead time", () => {
  const page = fs.readFileSync(path.join(__dirname, "AppointmentSettings.jsx"), "utf8");
  const presentation = fs.readFileSync(
    path.join(__dirname, "appointmentSettingsPresentation.js"),
    "utf8"
  );
  assert.match(page, /appointmentsMinimumLead/);
  assert.match(page, /minimumBookingLeadMinutes/);
  assert.match(presentation, /LEAD_TIME_OPTIONS/);
});

test("UTC appointment timestamps render in the operational timezone", () => {
  assert.equal(
    formatFriendlyAppointmentWhen("2026-08-15T00:30:00.000Z", "America/New_York", "en-US"),
    "Aug 14, 8:30 PM"
  );
});

test("date-only follow-up due dates stay date-only", () => {
  const label = buildFollowUpDueDate("2026-08-30", null, "en-US");
  assert.match(label, /Aug/);
  assert.doesNotMatch(label, /\d{1,2}:\d{2}/);
});
