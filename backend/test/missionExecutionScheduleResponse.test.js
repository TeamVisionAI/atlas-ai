require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveScheduleAgentId,
  buildScheduleExecutionResponse
} = require("../application/missionExecutionApplicationService");

test("resolveScheduleAgentId prefers authenticated user identifiers", () => {
  assert.equal(resolveScheduleAgentId({ userId: "user-1" }), "user-1");
  assert.equal(resolveScheduleAgentId({ agentId: "agent-1" }), "agent-1");
  assert.equal(resolveScheduleAgentId({ authorUserId: "author-1" }), "author-1");
  assert.equal(resolveScheduleAgentId({}), null);
});

test("buildScheduleExecutionResponse exposes persisted appointmentId", () => {
  const response = buildScheduleExecutionResponse({
    bookingResult: {
      googleCalendarEventId: "cal-event-123",
      meetingUrl: "https://zoom.us/j/123"
    },
    meetingUrl: "https://zoom.us/j/123",
    appointmentRecord: { id: "appt-123", prospectPhone: "+15555550100" },
    advanceResult: { workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" } }
  });

  assert.equal(response.appointmentId, "appt-123");
  assert.equal(response.appointment.id, "appt-123");
  assert.equal(response.calendarEventId, "cal-event-123");
  assert.notEqual(response.appointmentId, response.calendarEventId);
});

test("buildScheduleExecutionResponse rejects success without persisted appointmentId", () => {
  assert.throws(
    () =>
      buildScheduleExecutionResponse({
        bookingResult: { googleCalendarEventId: "cal-event-123" },
        meetingUrl: null,
        appointmentRecord: null,
        advanceResult: { workflow: null }
      }),
    /appointmentId is required/
  );
});
