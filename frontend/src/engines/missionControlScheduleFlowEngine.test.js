import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScheduledAppointmentId,
  shouldOpenScheduleCommunicationPreview
} from "./missionControlScheduleFlowEngine.js";

test("resolveScheduledAppointmentId prefers top-level appointmentId from schedule result", () => {
  assert.equal(
    resolveScheduledAppointmentId({
      appointmentId: "appt-123",
      appointment: { id: "legacy-id" }
    }),
    "appt-123"
  );
  assert.equal(
    resolveScheduledAppointmentId({ appointment: { id: "appt-456" } }),
    "appt-456"
  );
  assert.equal(resolveScheduledAppointmentId({ success: true }), null);
});

test("resolveScheduledAppointmentId rejects prospect-derived ids", () => {
  assert.equal(
    resolveScheduledAppointmentId({
      appointmentId: "prospect-derived:+15551234567:1785439800000"
    }),
    null
  );
});

test("shouldOpenScheduleCommunicationPreview requires persisted appointment id", () => {
  assert.equal(
    shouldOpenScheduleCommunicationPreview({ appointmentId: "appt-123" }),
    true
  );
  assert.equal(
    shouldOpenScheduleCommunicationPreview({ calendarEventId: "cal-123" }),
    false
  );
});
