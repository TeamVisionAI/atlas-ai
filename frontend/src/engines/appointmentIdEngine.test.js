import test from "node:test";
import assert from "node:assert/strict";
import {
  isProspectDerivedAppointmentId,
  resolvePersistedAppointmentId
} from "./appointmentIdEngine.js";

test("isProspectDerivedAppointmentId detects synthetic ids", () => {
  assert.equal(
    isProspectDerivedAppointmentId("prospect-derived:+15551234567:1785439800000"),
    true
  );
  assert.equal(isProspectDerivedAppointmentId("appt-123"), false);
  assert.equal(isProspectDerivedAppointmentId(null), false);
});

test("resolvePersistedAppointmentId rejects synthetic ids", () => {
  assert.equal(
    resolvePersistedAppointmentId("prospect-derived:+15551234567:1785439800000"),
    null
  );
  assert.equal(resolvePersistedAppointmentId("appt-123"), "appt-123");
  assert.equal(resolvePersistedAppointmentId(null), null);
});
