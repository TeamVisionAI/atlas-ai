/**
 * Sprint 22.1 — Appointment Engine polish tests.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  detectZoomFailure,
  detectUnusualMeetingRequest,
  detectSchedulingEscalation,
  getPeriodPreferenceQuestion,
  getEmailCollectionQuestion
} = require("../core/teamVisionAppointmentRules");
const {
  buildReminderMessage,
  REMINDER_TYPES,
  scheduleReminders,
  cancelReminders,
  replaceReminders
} = require("../services/appointmentReminderEngine");
const { recordHistoryEvent } = require("../core/appointmentHistory");
const { detectRequestedInterviewType } = require("../core/businessRulesEngine");
const { parseInterviewType } = require("../core/interviewScheduling");

describe("Sprint 22.1 — Team Vision rules", () => {
  it("detects zoom failure messages", () => {
    assert.equal(detectZoomFailure("No puedo instalar Zoom"), true);
    assert.equal(detectZoomFailure("see you tomorrow"), false);
  });

  it("detects unusual meeting requests", () => {
    assert.equal(detectUnusualMeetingRequest("prefiero google meet"), true);
    assert.equal(detectUnusualMeetingRequest("en la tarde"), false);
  });

  it("escalates zoom and unusual requests", () => {
    assert.equal(detectSchedulingEscalation("zoom no funciona").escalate, true);
    assert.equal(detectSchedulingEscalation("prefiero oficina").escalate, true);
  });

  it("uses zoom-first period question", () => {
    assert.match(getPeriodPreferenceQuestion("es"), /Zoom/i);
    assert.match(getPeriodPreferenceQuestion("es"), /mañana o en la tarde/i);
  });

  it("uses Team Vision email prompt", () => {
    assert.match(getEmailCollectionQuestion("es"), /correo electrónico/i);
  });
});

describe("Sprint 22.1 — business rules defaults", () => {
  it("defaults interview type requests to zoom unless escalated", () => {
    assert.equal(parseInterviewType("virtual interview"), "Zoom");
    assert.equal(parseInterviewType("office visit"), null);
    assert.equal(detectRequestedInterviewType("google meet"), "UNUSUAL_METHOD");
  });
});

describe("Sprint 22.1 — reminder engine", () => {
  it("builds reminder messages", () => {
    const message = buildReminderMessage(
      {
        startDateTime: "2026-07-28T15:00:00.000Z",
        timezone: "America/New_York",
        virtualMeetingUrl: "https://zoom.us/j/123"
      },
      REMINDER_TYPES.REMINDER_15M,
      { name: "Ana" }
    );

    assert.match(message, /15 minutos|15 minutes/i);
  });

  it("schedules, replaces, and cancels reminders", () => {
    const appointment = {
      id: "test-appt-1",
      organizationId: "org-1",
      prospectPhone: "+15555550100",
      startDateTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      timezone: "America/New_York",
      virtualMeetingUrl: null,
      metadata: { prospectName: "Test" }
    };

    const scheduled = scheduleReminders(appointment);
    assert.ok(scheduled.count >= 3);

    const replaced = replaceReminders(appointment);
    assert.equal(replaced.status, "scheduled");

    const cancelled = cancelReminders(appointment.id);
    assert.equal(cancelled.status, "cancelled");
  });
});

describe("Sprint 22.1 — appointment history", () => {
  it("records structured history events", () => {
    const history = recordHistoryEvent({ history: [] }, {
      type: "rescheduled",
      actor: "agent-1",
      reason: "agent_requested",
      oldValues: { startDateTime: "2026-07-28T10:00:00.000Z" },
      newValues: { startDateTime: "2026-07-28T14:00:00.000Z" }
    });

    assert.equal(history.length, 1);
    assert.equal(history[0].type, "rescheduled");
    assert.equal(history[0].actor, "agent-1");
  });
});
