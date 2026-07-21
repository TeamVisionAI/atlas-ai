/**
 * Release 1.1 — Team Vision package event constants.
 */

const PackageEvent = Object.freeze({
  CANDIDATE_QUALIFIED: "package.candidate.qualified",
  INTERVIEW_SCHEDULED: "package.interview.scheduled",
  INTERVIEW_COMPLETED: "package.interview.completed",
  PRESENTATION_COMPLETED: "package.presentation.completed",
  LICENSE_STARTED: "package.license.started",
  LICENSE_COMPLETED: "package.license.completed",
  ORIENTATION_COMPLETED: "package.orientation.completed",
  FASTSTART_COMPLETED: "package.faststart.completed",
  FOLLOWUP_STARTED: "package.followup.started",
  FOLLOWUP_COMPLETED: "package.followup.completed"
});

module.exports = {
  PackageEvent
};
