/**
 * BR-123 — Occupation is optional for interview readiness / scheduling / due.
 * Guards against the live incident where occupation=null blocked INTERVIEW_SCHEDULED.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MILESTONE_REQUIRED_FIELDS,
  validateMilestoneAdvancement
} = require("../core/milestoneValidationEngine");
const { MILESTONES } = require("../core/workflowConstants");
const { getMissingFields } = require("../core/informationModel");

const anthonyLikeProspect = {
  id: "83167302-cd24-4708-b11d-95815aa43568",
  phone: "+17867527481",
  name: "Anthony Perez",
  city: "Miami",
  state: "FL",
  work_authorized: true,
  occupation: null,
  interview_type: "In Person",
  notes: "EMAIL:otcnpms@gmail.com"
};

test("BR-123 required lists omit occupation for READY/SCHEDULED/DUE", () => {
  assert.equal(MILESTONE_REQUIRED_FIELDS[MILESTONES.INTERVIEW_READY].includes("occupation"), false);
  assert.equal(
    MILESTONE_REQUIRED_FIELDS[MILESTONES.INTERVIEW_SCHEDULED].includes("occupation"),
    false
  );
  assert.equal(MILESTONE_REQUIRED_FIELDS[MILESTONES.INTERVIEW_DUE].includes("occupation"), false);
  assert.ok(MILESTONE_REQUIRED_FIELDS[MILESTONES.INTERVIEW_SCHEDULED].includes("interviewDateTime"));
});

test("BR-123 informationModel getMissingFields does not require occupation", () => {
  const missing = getMissingFields({
    city: "Miami",
    state: "FL",
    authorization: true,
    interviewType: "In Person",
    dayPart: "evening",
    occupation: null,
    appointmentDate: "2026-08-10",
    preferredTime: "20:00",
    interviewTime: "2026-08-11T00:00:00.000Z",
    name: "Anthony Perez",
    email: "otcnpms@gmail.com"
  });
  assert.equal(missing.includes("occupation"), false);
});

test("BR-123 advance to INTERVIEW_SCHEDULED succeeds with occupation=null", () => {
  const result = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.INTERVIEW_READY,
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    prospect: anthonyLikeProspect,
    capturedFields: {
      interviewDateTime: "2026-08-11T00:00:00.000Z",
      interviewType: "In Person",
      confirmed: true,
      appointmentDate: "2026-08-10",
      preferredTime: "20:00"
    }
  });

  assert.equal(result.valid, true);
  assert.equal((result.missingFields || []).includes("occupation"), false);
});

test("BR-123 advance to INTERVIEW_READY never fails for occupation=null", () => {
  const result = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.QUALIFICATION,
    targetMilestone: MILESTONES.INTERVIEW_READY,
    prospect: {
      ...anthonyLikeProspect,
      calendar_event_id: "cal-placeholder",
      interview_time: "2026-08-11T00:00:00.000Z",
      appointment_date: "2026-08-11T00:00:00.000Z"
    },
    capturedFields: {
      city: "Miami",
      state: "FL",
      authorization: true,
      interviewType: "In Person"
    }
  });

  assert.equal((result.missingFields || []).includes("occupation"), false);
  assert.equal(
    (result.errors || []).some((e) => e.field === "occupation"),
    false
  );
  assert.equal(result.valid, true);
});

test("BR-123 INTERVIEW_DUE does not fail on occupation=null when schedule confirmed", () => {
  const result = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    targetMilestone: MILESTONES.INTERVIEW_DUE,
    prospect: {
      ...anthonyLikeProspect,
      interview_time: "2026-08-11T00:00:00.000Z",
      appointment_date: "2026-08-11T00:00:00.000Z",
      calendar_event_id: "cal-event"
    },
    capturedFields: {
      interviewDateTime: "2026-08-11T00:00:00.000Z",
      confirmed: true
    }
  });

  assert.equal(result.valid, true);
  assert.equal((result.missingFields || []).includes("occupation"), false);
});

test("BR-123 still requires city/state/authorization for INTERVIEW_SCHEDULED", () => {
  const result = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.QUALIFICATION,
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    prospect: {
      phone: "+17867527481",
      city: null,
      state: null,
      work_authorized: null,
      occupation: null
    },
    capturedFields: {
      interviewDateTime: "2026-08-11T00:00:00.000Z"
    }
  });

  assert.equal(result.valid, false);
  assert.ok(
    (result.missingFields || []).some((f) => ["city", "state", "authorization"].includes(f))
  );
});

test("BR-123 docs present", () => {
  const fs = require("node:fs");
  const rules = fs.readFileSync("docs/06-business/BUSINESS_RULES.md", "utf8");
  assert.match(rules, /## BR-123/);
  assert.match(rules, /Occupation Optional for Interview Scheduling/);
  assert.match(rules, /enrichment\s*\/\s*optional/i);
  assert.match(rules, /not.*prerequisite/i);
});
