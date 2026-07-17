/**
 * Sprint 8A.5 — Resolves interview datetime from prospect fields.
 * Uses machine-parseable interview_time when available; otherwise appointment_date.
 */

function parseInterviewDatetime(prospect) {
  if (!prospect) {
    return null;
  }

  const interviewTime = prospect.interview_time;

  if (interviewTime) {
    const parsedInterview = Date.parse(interviewTime);

    if (!Number.isNaN(parsedInterview)) {
      return parsedInterview;
    }
  }

  const appointmentDate = prospect.appointment_date;

  if (appointmentDate) {
    const parsedAppointment = Date.parse(appointmentDate);

    if (!Number.isNaN(parsedAppointment)) {
      return parsedAppointment;
    }
  }

  return null;
}

module.exports = {
  parseInterviewDatetime
};
