/**
 * Sprint 13.2.1 — Investigation trace for interview assignment (NO business logic changes).
 */

function logInterviewerTrace(payload = {}) {
  console.info("[interviewer-trace]", {
    authenticatedUserId: payload.authenticatedUserId ?? null,
    authenticatedUserName: payload.authenticatedUserName ?? null,
    interviewerUserId: payload.interviewerUserId ?? null,
    interviewerName: payload.interviewerName ?? null,
    appointmentId: payload.appointmentId ?? null,
    source: payload.source ?? null
  });
}

module.exports = {
  logInterviewerTrace
};
