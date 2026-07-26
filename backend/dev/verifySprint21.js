#!/usr/bin/env node
/**
 * Sprint 21 — Mission Execution Engine verification.
 */

require("dotenv").config();

const assert = require("node:assert/strict");
const {
  normalizeInterviewType,
  validateSchedulePayload
} = require("../application/missionExecutionApplicationService");
const { scheduleAppointment } = require("../services/schedulingService");
const { postMissionExecution } = require("../controllers/missionExecutionController");

function pass(label) {
  console.log(`✓ ${label}`);
}

function main() {
  assert.equal(normalizeInterviewType("Zoom / Google Meet"), "Zoom");
  pass("normalizeInterviewType handles Zoom labels");

  assert.deepEqual(validateSchedulePayload({ dateKey: "2026-07-28" }), [
    "timeKey",
    "interviewType"
  ]);
  pass("validateSchedulePayload catches missing fields");

  assert.equal(typeof scheduleAppointment, "function");
  pass("schedulingService.scheduleAppointment exported");

  assert.equal(typeof postMissionExecution, "function");
  pass("missionExecutionController.postMissionExecution exported");

  console.log("\nSprint 21 verification passed.");
}

main();
