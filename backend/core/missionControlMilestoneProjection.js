/**
 * Implements BR-139 — Mission Control projection vs durable milestone (single SoR).
 *
 * Canonical INTERVIEW_READY and later interview milestones outrank stale
 * QUAL_CAPTURE / conversationOutcome.requiredInputs / brain.missingFields.
 * Do not invent a milestone rollback here — only reconcile derived MC state.
 */

const { MILESTONES } = require("./workflowConstants");

const QUALIFICATION_COMPLETE_MILESTONES = new Set([
  MILESTONES.INTERVIEW_READY,
  MILESTONES.INTERVIEW_SCHEDULED,
  MILESTONES.INTERVIEW_DUE,
  MILESTONES.INTERVIEW_COMPLETED,
  MILESTONES.INTERVIEW_RESULT_PENDING
]);

function isQualificationCompleteByCanonicalMilestone(workflow) {
  return QUALIFICATION_COMPLETE_MILESTONES.has(workflow?.canonicalMilestone);
}

function isInterviewReadyWithoutScheduledInterview(workflow, activeAppointment = null) {
  return (
    workflow?.canonicalMilestone === MILESTONES.INTERVIEW_READY && !activeAppointment
  );
}

module.exports = {
  QUALIFICATION_COMPLETE_MILESTONES,
  isQualificationCompleteByCanonicalMilestone,
  isInterviewReadyWithoutScheduledInterview
};
