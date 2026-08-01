/**
 * Sprint 13.4 — BR-044 Interview Outcome Simplification.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildInterviewOutcomeReadModel,
  resolveInterviewAdvancePayload,
  listInterviewOutcomeSelectorIds,
  resolveOutcomeId
} = require("../core/interviewOutcomeMappings");
const { mapAppointmentSlugToOutcomeId } = require("../core/interviewOutcomeSlugMap");
const { APPOINTMENT_OUTCOMES } = require("../core/configuration/appointmentDomain");
const { MILESTONES } = require("../core/workflowConstants");

describe("Sprint 13.4 — BR-044 interview outcome selector", () => {
  it("exposes exactly six representative-facing outcomes", () => {
    const readModel = buildInterviewOutcomeReadModel();
    const flat = readModel.categories.flatMap((category) => category.outcomes);

    assert.equal(readModel.categories.length, 1);
    assert.equal(flat.length, 6);
    assert.deepEqual(listInterviewOutcomeSelectorIds(), [
      "Recruited",
      "Became Client",
      "Rescheduled",
      "No Show",
      "Follow Up Needed",
      "Not Interested"
    ]);
  });

  it("does not expose operational milestones in selector labels", () => {
    const readModel = buildInterviewOutcomeReadModel();
    const labels = readModel.categories.flatMap((category) =>
      category.outcomes.map((outcome) => outcome.label)
    );

    assert.ok(labels.every((label) => !label.includes("Pending IBA")));
    assert.ok(labels.every((label) => !label.includes("Application Pending")));
    assert.ok(labels.some((label) => label.includes("Recruited")));
    assert.ok(labels.some((label) => label.includes("Follow Up Needed")));
  });

  it("Recruited advances to Pending IBA operational milestone automatically", () => {
    const payload = resolveInterviewAdvancePayload("Recruited", {});

    assert.equal(payload.targetMilestone, MILESTONES.LICENSING);
    assert.equal(payload.capturedFields.outcome, "Pending IBA");
    assert.equal(payload.capturedFields.interviewBusinessOutcome, "Recruited");
  });

  it("Follow Up Needed continues follow-up workflow without operational milestone labels", () => {
    const payload = resolveInterviewAdvancePayload("Follow Up Needed", {});

    assert.equal(payload.targetMilestone, MILESTONES.FOLLOW_UP);
    assert.equal(payload.capturedFields.outcome, "Needs More Time");
    assert.equal(payload.capturedFields.interviewBusinessOutcome, "Follow Up Needed");
  });

  it("Became Client does not map to Application Pending", () => {
    const payload = resolveInterviewAdvancePayload("Became Client", {});

    assert.equal(payload.capturedFields.outcome, "Became Client");
    assert.notEqual(payload.capturedFields.outcome, "Application Pending");
    assert.equal(payload.targetMilestone, MILESTONES.FAST_START);
  });

  it("Rescheduled resolves to reschedule interview workflow", () => {
    assert.equal(resolveOutcomeId("Rescheduled"), "Reschedule Interview");

    const payload = resolveInterviewAdvancePayload("Rescheduled", {
      rescheduleDate: "2026-08-15",
      rescheduleTime: "10:00"
    });

    assert.equal(payload.targetMilestone, MILESTONES.INTERVIEW_SCHEDULED);
  });

  it("appointment follow_up slug maps to Follow Up Needed selector outcome", () => {
    assert.equal(mapAppointmentSlugToOutcomeId(APPOINTMENT_OUTCOMES.FOLLOW_UP), "Follow Up Needed");
  });
});
