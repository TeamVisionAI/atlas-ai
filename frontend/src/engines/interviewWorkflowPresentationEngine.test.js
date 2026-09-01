import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERVIEW_WORKFLOW_UI_STATES,
  filterMissionActionsForInterviewWorkflow,
  isCommunicationActionHiddenDuringResultPending,
  resolveAppointmentCardActionPlan,
  resolveInterviewWorkflowUiStateFromInterview,
  resolveOperationalInterviewActionPlan,
  shouldHideCommunicationCard
} from "./interviewWorkflowPresentationEngine.js";

test("resolveInterviewWorkflowUiStateFromInterview maps gate to result pending", () => {
  assert.equal(
    resolveInterviewWorkflowUiStateFromInterview({ gateActive: true, datetime: "2026-08-01T15:00:00.000Z" }),
    INTERVIEW_WORKFLOW_UI_STATES.RESULT_PENDING
  );
});

test("recorded FOLLOW_UP_NEEDED outranks a stale result-pending gate", () => {
  assert.equal(
    resolveInterviewWorkflowUiStateFromInterview({
      gateActive: true,
      outcome: "Follow Up Needed",
      datetime: "2026-09-01T19:30:00.000Z"
    }),
    INTERVIEW_WORKFLOW_UI_STATES.COMPLETED
  );
});

test("resolveInterviewWorkflowUiStateFromInterview maps scheduled interview", () => {
  assert.equal(
    resolveInterviewWorkflowUiStateFromInterview({
      datetime: "2026-08-01T15:00:00.000Z",
      appointmentId: "appt-1"
    }),
    INTERVIEW_WORKFLOW_UI_STATES.SCHEDULED
  );
});

test("resolveInterviewWorkflowUiStateFromInterview maps cancelled lifecycle before datetime fallback", () => {
  assert.equal(
    resolveInterviewWorkflowUiStateFromInterview({
      datetime: "2026-08-01T15:00:00.000Z",
      lifecycleState: "cancelled",
      appointmentStatus: "cancelled"
    }),
    INTERVIEW_WORKFLOW_UI_STATES.CANCELLED
  );
});

test("resolveAppointmentCardActionPlan hides lifecycle actions for cancelled appointments", () => {
  const plan = resolveAppointmentCardActionPlan({
    status: "cancelled",
    metadata: { lifecycleState: "cancelled" },
    prospectPhone: "+15551234567"
  });

  assert.equal(plan.state, INTERVIEW_WORKFLOW_UI_STATES.CANCELLED);
  assert.equal(plan.showCancel, false);
  assert.equal(plan.showReschedule, false);
});

test("filterMissionActionsForInterviewWorkflow keeps only outcome actions during gate", () => {
  const filtered = filterMissionActionsForInterviewWorkflow(
    [
      { id: "schedule", label: "Schedule" },
      { id: "enter_interview_outcome", label: "Record Outcome" },
      { id: "reschedule", label: "Reschedule" }
    ],
    { active: true }
  );

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "enter_interview_outcome");
});

test("shouldHideCommunicationCard hides only unavailable cards", () => {
  assert.equal(shouldHideCommunicationCard({ id: "send_zoom_link", enabled: false }), true);
  assert.equal(shouldHideCommunicationCard({ id: "call", enabled: true }), false);
});

test("isCommunicationActionHiddenDuringResultPending hides post-interview invitations only", () => {
  assert.equal(isCommunicationActionHiddenDuringResultPending("send_zoom_link"), true);
  assert.equal(isCommunicationActionHiddenDuringResultPending("send_interview_reminder"), true);
  assert.equal(isCommunicationActionHiddenDuringResultPending("send_office_location"), true);
  assert.equal(isCommunicationActionHiddenDuringResultPending("resend_interview_details"), false);
  assert.equal(isCommunicationActionHiddenDuringResultPending("whatsapp"), false);
});

test("resolveAppointmentCardActionPlan shows terminal actions only when completed", () => {
  const plan = resolveAppointmentCardActionPlan({
    status: "completed",
    prospectPhone: "+15551234567"
  });

  assert.equal(plan.showJoinZoom, false);
  assert.equal(plan.showCommunicationHistory, true);
  assert.equal(plan.openWorkspaceLabelKey, "appointmentsViewWorkspace");
});

test("resolveAppointmentCardActionPlan uses compact card action labels for active appointments", () => {
  const zoomPlan = resolveAppointmentCardActionPlan({
    status: "scheduled",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: "https://us02web.zoom.us/j/123"
  });
  const inPersonPlan = resolveAppointmentCardActionPlan({
    status: "scheduled",
    meetingType: "in_person",
    meetingLocationType: "office",
    meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  });

  assert.equal(zoomPlan.openWorkspaceLabelKey, "appointmentsCardWorkspace");
  assert.equal(zoomPlan.cancelLabelKey, "appointmentsCancel");
  assert.equal(zoomPlan.completeLabelKey, "appointmentsComplete");
  assert.equal(zoomPlan.showJoinZoom, true);
  assert.equal(inPersonPlan.showJoinZoom, false);
  assert.equal(inPersonPlan.openWorkspaceLabelKey, "appointmentsCardWorkspace");
});

test("resolveOperationalInterviewActionPlan hides actions when result pending", () => {
  const plan = resolveOperationalInterviewActionPlan(
    { gateActive: true },
    { showComplete: true, showReschedule: true, showCancel: true }
  );

  assert.equal(plan.showPanelActions, false);
  assert.equal(plan.showRecordOutcomeHint, true);
});
