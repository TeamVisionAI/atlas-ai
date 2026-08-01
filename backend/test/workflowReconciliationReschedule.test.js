require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldReconcile } = require("../core/workflowReconciliationEngine");
const { MILESTONES } = require("../core/workflowConstants");

test("shouldReconcile returns scheduled after result pending when interview moved to the future", () => {
  const futureInterview = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

  assert.equal(
    shouldReconcile({
      persisted: {
        canonicalMilestone: MILESTONES.INTERVIEW_RESULT_PENDING,
        reconcileEpisodeKey: "time:INTERVIEW_RESULT_PENDING:2026-08-01T15:00:00.000Z"
      },
      computedMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      agentState: { outcome: null },
      prospect: {
        current_step: "CONFIRMED",
        interview_time: futureInterview,
        appointment_date: futureInterview
      }
    }),
    true
  );
});

test("shouldReconcile does not advance scheduled to result pending for future interviews", () => {
  const futureInterview = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

  assert.equal(
    shouldReconcile({
      persisted: {
        canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
        reconcileEpisodeKey: null
      },
      computedMilestone: MILESTONES.INTERVIEW_RESULT_PENDING,
      agentState: { outcome: null },
      prospect: {
        current_step: "CONFIRMED",
        interview_time: futureInterview,
        appointment_date: futureInterview
      }
    }),
    false
  );
});
