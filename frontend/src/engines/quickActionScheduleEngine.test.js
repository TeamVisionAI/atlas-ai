import test from "node:test";
import assert from "node:assert/strict";
import { resolveQuickActionScheduleBehavior } from "./quickActionScheduleEngine.js";

test("resolveQuickActionScheduleBehavior shows schedule when no interview exists", () => {
  const behavior = resolveQuickActionScheduleBehavior({});

  assert.equal(behavior.visible, true);
  assert.equal(behavior.mode, "schedule");
  assert.equal(behavior.labelKey, "workspaceActionScheduleInterview");
  assert.equal(behavior.useAppointmentRescheduleDialog, false);
});

test("resolveQuickActionScheduleBehavior shows reschedule when interview is scheduled", () => {
  const behavior = resolveQuickActionScheduleBehavior({
    datetime: new Date(Date.now() + 86400000).toISOString(),
    appointmentId: "appt-1"
  });

  assert.equal(behavior.visible, true);
  assert.equal(behavior.mode, "reschedule");
  assert.equal(behavior.labelKey, "workspaceActionRescheduleInterview");
  assert.equal(behavior.useAppointmentRescheduleDialog, true);
});

test("resolveQuickActionScheduleBehavior hides action after interview outcome", () => {
  const behavior = resolveQuickActionScheduleBehavior({
    datetime: new Date(Date.now() - 86400000).toISOString(),
    appointmentId: "appt-1",
    outcome: "Recruited"
  });

  assert.equal(behavior.visible, false);
  assert.equal(behavior.mode, null);
});

test("resolveQuickActionScheduleBehavior hides action when interview gate is active", () => {
  const behavior = resolveQuickActionScheduleBehavior({
    datetime: new Date(Date.now() + 86400000).toISOString(),
    appointmentId: "appt-1",
    gateActive: true
  });

  assert.equal(behavior.visible, false);
});

test("resolveQuickActionScheduleBehavior uses schedule dialog for legacy reschedule", () => {
  const behavior = resolveQuickActionScheduleBehavior({
    datetime: new Date(Date.now() + 86400000).toISOString()
  });

  assert.equal(behavior.visible, true);
  assert.equal(behavior.mode, "reschedule");
  assert.equal(behavior.useAppointmentRescheduleDialog, false);
});
