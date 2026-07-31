import test from "node:test";
import assert from "node:assert/strict";
import { resolveOperationalInterviewActions } from "./interviewOperationalEngine.js";

test("resolveOperationalInterviewActions hides actions when gate is active", () => {
  const actions = resolveOperationalInterviewActions({
    datetime: new Date(Date.now() + 86400000).toISOString(),
    appointmentId: "appt-1",
    gateActive: true
  });

  assert.equal(actions.showReschedule, false);
  assert.equal(actions.showComplete, false);
  assert.equal(actions.showCancel, false);
});

test("resolveOperationalInterviewActions shows legacy reschedule without appointment id", () => {
  const actions = resolveOperationalInterviewActions({
    datetime: new Date(Date.now() + 86400000).toISOString()
  });

  assert.equal(actions.showReschedule, true);
  assert.equal(actions.showComplete, false);
  assert.equal(actions.showCancel, false);
  assert.equal(actions.useAppointmentDialogs, false);
});

test("resolveOperationalInterviewActions shows appointment management when linked", () => {
  const actions = resolveOperationalInterviewActions({
    datetime: new Date(Date.now() + 86400000).toISOString(),
    appointmentId: "appt-1"
  });

  assert.equal(actions.showReschedule, true);
  assert.equal(actions.showComplete, true);
  assert.equal(actions.showCancel, true);
  assert.equal(actions.useAppointmentDialogs, true);
});

test("resolveOperationalInterviewActions hides actions after outcome", () => {
  const actions = resolveOperationalInterviewActions({
    datetime: new Date(Date.now() - 86400000).toISOString(),
    appointmentId: "appt-1",
    outcome: "Recruited"
  });

  assert.equal(actions.showReschedule, false);
});
