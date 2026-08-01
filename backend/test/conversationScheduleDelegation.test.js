const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveConversationSchedulePayload
} = require("../core/conversationScheduleDelegation");

test("resolveConversationSchedulePayload prefers pending confirmation keys", () => {
  const payload = resolveConversationSchedulePayload(
    {
      notes:
        'SCHEDULING:{"phase":"CONFIRM","pendingConfirmation":{"dateKey":"2026-08-05","timeKey":"14:00","interviewType":"Zoom"}}',
      appointment_date: "2026-08-05T18:00:00.000Z"
    },
    { interviewType: "Zoom", email: "prospect@example.com" }
  );

  assert.equal(payload.dateKey, "2026-08-05");
  assert.equal(payload.timeKey, "14:00");
  assert.equal(payload.interviewType, "Zoom");
  assert.equal(payload.email, "prospect@example.com");
});

test("resolveConversationSchedulePayload derives keys from appointment_date", () => {
  const payload = resolveConversationSchedulePayload(
    {
      appointment_date: "2026-08-05T14:00:00.000Z",
      interview_type: "In Person"
    },
    { interviewType: "In Person" }
  );

  assert.equal(payload.dateKey, "2026-08-05");
  assert.ok(payload.timeKey);
  assert.equal(payload.interviewType, "In Person");
});
