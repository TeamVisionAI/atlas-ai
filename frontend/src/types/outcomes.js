/**
 * BR-044 — Representative-facing interview outcome constants.
 */

export const INTERVIEW_OUTCOMES = {
  RECRUITED: "Recruited",
  BECAME_CLIENT: "Became Client",
  RESCHEDULED: "Rescheduled",
  NO_SHOW: "No Show",
  FOLLOW_UP_NEEDED: "Follow Up Needed",
  NOT_INTERESTED: "Not Interested"
};

export const INTERVIEW_OUTCOME_SELECTOR_IDS = Object.freeze([
  INTERVIEW_OUTCOMES.RECRUITED,
  INTERVIEW_OUTCOMES.BECAME_CLIENT,
  INTERVIEW_OUTCOMES.RESCHEDULED,
  INTERVIEW_OUTCOMES.NO_SHOW,
  INTERVIEW_OUTCOMES.FOLLOW_UP_NEEDED,
  INTERVIEW_OUTCOMES.NOT_INTERESTED
]);

/** @typedef {typeof INTERVIEW_OUTCOMES[keyof typeof INTERVIEW_OUTCOMES]} InterviewOutcome */
