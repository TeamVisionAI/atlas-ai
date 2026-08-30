import test from "node:test";
import assert from "node:assert/strict";
import { buildFollowUpDueDate } from "./followUpsViewModel.js";

test("date-only follow-ups do not invent a clock time", () => {
  const label = buildFollowUpDueDate("2026-09-04", null, "en-US");
  assert.ok(label);
  assert.doesNotMatch(label, /\d{1,2}:\d{2}/);
  assert.doesNotMatch(label, /AM|PM/i);
});

test("timed follow-ups include the hour", () => {
  const label = buildFollowUpDueDate("2026-09-04", "10:00", "en-US");
  assert.match(label, /10:00|10:00 AM|10 AM/i);
});
