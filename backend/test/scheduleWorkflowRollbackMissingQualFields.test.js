/**
 * Marielena canary rollback reproduction (read-only contract).
 *
 * Live failure: appointment 04e10031… created then cancelled with
 * schedule_workflow_rollback + calendar_event_id=null.
 *
 * Mission path after Calendar+persist calls advanceProspectWorkflow with
 * capturedFields that do NOT include city/state/authorization. Legacy prospect
 * rows updated only by V2 durable still had city/state/work_authorized=null,
 * so INTERVIEW_SCHEDULED validation fails → workflow_advance rollback.
 *
 * Same class as Anthony occupation rollback (workflow validation after persist),
 * different missing fields (city/state/authorization; occupation remains optional
 * per BR-123). Missing email is non-causal (BR-123 / invitation enrichment).
 */
"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  validateMilestoneAdvancement,
  MILESTONE_REQUIRED_FIELDS
} = require("../core/milestoneValidationEngine");
const { MILESTONES } = require("../core/workflowConstants");

/** Exact legacy shape after speak-only V2 (city/state/auth never dual-written). */
const MARIELENA_LEGACY = {
  id: "cc539cb3-1bfd-4329-8ddb-e3b74bf75c33",
  phone: "+17863071530",
  name: "Marielena Campo",
  city: null,
  state: null,
  work_authorized: null,
  occupation: null,
  interview_type: null,
  notes: null,
  current_step: "NEW"
};

/** Capture bag actually passed by executeScheduleInterview after booking. */
const MISSION_CAPTURED = {
  interviewDateTime: "2026-08-10T17:00:00.000Z",
  interviewType: "In Person",
  confirmed: true,
  appointmentDate: "2026-08-10",
  preferredTime: "13:00",
  email: undefined
};

test("Marielena-shaped advance to INTERVIEW_SCHEDULED fails city/state/authorization", () => {
  const result = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.INTERVIEW_READY,
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    prospect: MARIELENA_LEGACY,
    capturedFields: MISSION_CAPTURED
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.missingFields.sort(), ["authorization", "city", "state"].sort());
  assert.ok(result.errors.every((e) => e.code === "REQUIRED_FIELD_MISSING"));
  assert.ok(!result.missingFields.includes("occupation"));
  assert.ok(!result.missingFields.includes("email"));
});

test("BR-123 occupation optional; Marielena primary blockers are city/state/authorization", () => {
  assert.ok(
    !MILESTONE_REQUIRED_FIELDS[MILESTONES.INTERVIEW_SCHEDULED].includes("occupation")
  );
  assert.ok(!MILESTONE_REQUIRED_FIELDS[MILESTONES.INTERVIEW_SCHEDULED].includes("email"));

  const primary = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.INTERVIEW_READY,
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    prospect: MARIELENA_LEGACY,
    capturedFields: MISSION_CAPTURED
  });
  assert.equal(primary.valid, false);
  assert.ok(primary.missingFields.includes("city"));
  assert.ok(primary.missingFields.includes("state"));
  assert.ok(primary.missingFields.includes("authorization"));
  // Email is not reached while city is missing (getMissingFields short-circuits).
  assert.ok(!primary.missingFields.includes("email"));
  assert.ok(!primary.missingFields.includes("occupation"));
});

test("latent email no longer blocks INTERVIEW_SCHEDULED after city/state/auth (BR-127)", () => {
  const r = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.INTERVIEW_READY,
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    prospect: {
      ...MARIELENA_LEGACY,
      city: "Miami",
      state: "FL",
      work_authorized: true,
      occupation: null
    },
    capturedFields: MISSION_CAPTURED
  });
  assert.equal(r.valid, true);
  assert.deepEqual(r.missingFields, []);
});

test("missionExecution wires workflow failure → schedule_workflow_rollback", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.ok(src.includes("advanceWorkflow(phone"));
  assert.ok(src.includes('reason: "schedule_workflow_rollback"'));
  assert.ok(src.includes('phase: "workflow_advance"'));
  assert.ok(src.includes("!advanceResult.success"));
  assert.ok(src.includes("synchronizeQualificationFactsForSchedule"));

  const advanceIdx = src.indexOf("const advanceResult = await advanceWorkflow(phone");
  const workflowPhaseIdx = src.indexOf('phase: "workflow_advance"', advanceIdx);
  assert.ok(advanceIdx > 0);
  assert.ok(workflowPhaseIdx > advanceIdx);
});

test("cancelAppointment clears calendar_event_id (explains null after rollback)", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(src, /calendar_event_id:\s*null/);
  assert.match(src, /calendarEventId:\s*null/);
});
