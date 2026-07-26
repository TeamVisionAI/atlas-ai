/**
 * Sprint 21 — Mission Execution Engine tests.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeInterviewType,
  validateSchedulePayload,
  executeMission
} = require("../application/missionExecutionApplicationService");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");

describe("Mission Execution — presentation helpers", () => {
  it("normalizes zoom interview types", () => {
    assert.equal(normalizeInterviewType("Zoom"), "Zoom");
    assert.equal(normalizeInterviewType("Google Meet"), "Zoom");
    assert.equal(normalizeInterviewType("office"), "In Person");
  });

  it("validates required schedule payload fields", () => {
    assert.deepEqual(validateSchedulePayload({}), ["dateKey", "timeKey", "interviewType"]);
    assert.deepEqual(
      validateSchedulePayload({
        dateKey: "2026-07-28",
        timeKey: "10:00",
        interviewType: "Zoom"
      }),
      []
    );
  });
});

describe("Mission Execution — unsupported missions", () => {
  it("rejects unknown mission types", async () => {
    const result = await executeMission("+15555550100", {
      missionType: "UnknownMission",
      payload: {}
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "UNSUPPORTED_MISSION");
  });

  it("routes ScheduleInterview mission type through schedule executor validation", async () => {
    const result = await executeMission("+15555550100", {
      missionType: MISSION_TYPES.SCHEDULE_INTERVIEW,
      payload: {}
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "VALIDATION_FAILED");
  });
});
