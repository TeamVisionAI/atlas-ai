import test from "node:test";
import assert from "node:assert/strict";
import {
  hasCanonicalRecordedOutcome,
  resolveCanonicalAppointmentOutcome,
  resolveOutcomeCompleteDisplayStatus,
  canonicalOutcomeLabel
} from "./appointmentOutcomeState.js";

test("FOLLOW_UP_NEEDED is a recorded complete outcome", () => {
  const appointment = {
    status: "scheduled",
    outcome: "follow_up",
    metadata: { lifecycleState: "scheduled" }
  };
  assert.equal(hasCanonicalRecordedOutcome(appointment), true);
  assert.equal(resolveCanonicalAppointmentOutcome(appointment), "follow_up");
  assert.equal(resolveOutcomeCompleteDisplayStatus(appointment), "completed");
  assert.equal(canonicalOutcomeLabel("FOLLOW_UP_NEEDED"), "FOLLOW_UP_NEEDED");
});

test("live rescheduled appointment without recorded outcome stays active", () => {
  const appointment = { status: "rescheduled", outcome: null };
  assert.equal(hasCanonicalRecordedOutcome(appointment), false);
  assert.equal(resolveOutcomeCompleteDisplayStatus(appointment), null);
});
