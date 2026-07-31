const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapAppointmentSlugToOutcomeId,
  resolveAppointmentOutcomeSlug
} = require("../core/interviewOutcomeSlugMap");
const { APPOINTMENT_OUTCOMES } = require("../core/configuration/appointmentDomain");

test("mapAppointmentSlugToOutcomeId maps appointment completion slugs to catalog outcomes", () => {
  assert.equal(mapAppointmentSlugToOutcomeId(APPOINTMENT_OUTCOMES.RECRUITED), "Recruited");
  assert.equal(mapAppointmentSlugToOutcomeId(APPOINTMENT_OUTCOMES.NO_SHOW), "No Show");
  assert.equal(mapAppointmentSlugToOutcomeId(APPOINTMENT_OUTCOMES.FOLLOW_UP), "Thinking About It");
  assert.equal(mapAppointmentSlugToOutcomeId(APPOINTMENT_OUTCOMES.RESCHEDULED), "Reschedule Interview");
});

test("resolveAppointmentOutcomeSlug maps catalog outcomes back to appointment slugs", () => {
  assert.equal(resolveAppointmentOutcomeSlug("Recruited"), APPOINTMENT_OUTCOMES.RECRUITED);
  assert.equal(resolveAppointmentOutcomeSlug("No Show"), APPOINTMENT_OUTCOMES.NO_SHOW);
  assert.equal(resolveAppointmentOutcomeSlug("Thinking About It"), APPOINTMENT_OUTCOMES.FOLLOW_UP);
  assert.equal(resolveAppointmentOutcomeSlug("Not Interested"), APPOINTMENT_OUTCOMES.NOT_INTERESTED);
});
