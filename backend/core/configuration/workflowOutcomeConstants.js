/**
 * Milestone 4 PR-1.1 — Shared workflow outcome vocabulary for Mission + Agent Action engines.
 */

const INTERESTED_OUTCOMES = Object.freeze(new Set(["Interested", "Information Collected"]));

const SCHEDULE_MISSION_BLOCKING_OUTCOMES = Object.freeze(
  new Set([
    "Not Interested",
    "No Answer",
    "Left Voicemail",
    "Needs More Time",
    "Appointment Scheduled"
  ])
);

const FOLLOW_UP_OUTCOMES = Object.freeze(new Set(["Needs More Time", "No Show"]));

/** Interview outcomes that close the post-interview workflow gate. */
const RECORDED_INTERVIEW_OUTCOMES = Object.freeze(
  new Set(["Recruited", "No Show", "Needs More Time", "Not Interested", "Rescheduled"])
);

function isInterestedOutcome(outcome) {
  return Boolean(outcome && INTERESTED_OUTCOMES.has(outcome));
}

function isFollowUpOutcome(outcome) {
  return Boolean(outcome && FOLLOW_UP_OUTCOMES.has(outcome));
}

function isScheduleMissionBlockingOutcome(outcome) {
  return Boolean(outcome && SCHEDULE_MISSION_BLOCKING_OUTCOMES.has(outcome));
}

function isRecordedInterviewOutcome(outcome) {
  return Boolean(outcome && RECORDED_INTERVIEW_OUTCOMES.has(outcome));
}

module.exports = {
  INTERESTED_OUTCOMES,
  SCHEDULE_MISSION_BLOCKING_OUTCOMES,
  FOLLOW_UP_OUTCOMES,
  RECORDED_INTERVIEW_OUTCOMES,
  isInterestedOutcome,
  isFollowUpOutcome,
  isScheduleMissionBlockingOutcome,
  isRecordedInterviewOutcome
};
