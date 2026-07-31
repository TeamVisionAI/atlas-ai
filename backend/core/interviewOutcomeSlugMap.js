/**
 * Pure mappings between appointment outcome slugs and interview outcome catalog IDs.
 */

const { APPOINTMENT_OUTCOMES } = require("./configuration/appointmentDomain");

const RECRUIT_OUTCOMES = new Set(["Recruited", "Orientation Scheduled", "Pending IBA", "Pending License"]);
const CLIENT_OUTCOMES = new Set(["Became Client", "FNA Scheduled", "Application Pending", "Policy Submitted"]);
const FOLLOW_UP_OUTCOMES = new Set([
  "Thinking About It",
  "Requested More Information",
  "Wants to Talk to Spouse",
  "Call Back Later",
  "FNA Scheduled"
]);
const CLOSED_OUTCOMES = new Set([
  "Not Interested",
  "Not Qualified",
  "Already Working with Another Company",
  "Unable to Contact"
]);

const APPOINTMENT_SLUG_TO_OUTCOME_ID = Object.freeze({
  [APPOINTMENT_OUTCOMES.RECRUITED]: "Recruited",
  [APPOINTMENT_OUTCOMES.CLIENT]: "Became Client",
  [APPOINTMENT_OUTCOMES.FOLLOW_UP]: "Thinking About It",
  [APPOINTMENT_OUTCOMES.NO_SHOW]: "No Show",
  [APPOINTMENT_OUTCOMES.NOT_INTERESTED]: "Not Interested",
  [APPOINTMENT_OUTCOMES.CANCELLED]: "Not Interested",
  [APPOINTMENT_OUTCOMES.RESCHEDULED]: "Reschedule Interview",
  [APPOINTMENT_OUTCOMES.OTHER]: "Thinking About It"
});

function mapAppointmentSlugToOutcomeId(slug) {
  return APPOINTMENT_SLUG_TO_OUTCOME_ID[slug] || slug;
}

function resolveAppointmentOutcomeSlug(outcomeId) {
  if (RECRUIT_OUTCOMES.has(outcomeId)) {
    return APPOINTMENT_OUTCOMES.RECRUITED;
  }

  if (CLIENT_OUTCOMES.has(outcomeId)) {
    return APPOINTMENT_OUTCOMES.CLIENT;
  }

  if (outcomeId === "No Show") {
    return APPOINTMENT_OUTCOMES.NO_SHOW;
  }

  if (CLOSED_OUTCOMES.has(outcomeId)) {
    return APPOINTMENT_OUTCOMES.NOT_INTERESTED;
  }

  if (outcomeId === "Reschedule Interview") {
    return APPOINTMENT_OUTCOMES.RESCHEDULED;
  }

  if (FOLLOW_UP_OUTCOMES.has(outcomeId)) {
    return APPOINTMENT_OUTCOMES.FOLLOW_UP;
  }

  return APPOINTMENT_OUTCOMES.OTHER;
}

module.exports = {
  APPOINTMENT_SLUG_TO_OUTCOME_ID,
  mapAppointmentSlugToOutcomeId,
  resolveAppointmentOutcomeSlug
};
