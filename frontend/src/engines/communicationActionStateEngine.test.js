import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNICATION_ACTION_IDS,
  COMMUNICATION_PANEL_ACTION_ORDER,
  resolveCommunicationActions,
  evaluateAppointmentCommunicationAvailability,
  buildCommunicationActionContext,
  isInterviewConfirmed
} from "./communicationActionStateEngine.js";

const translate = (key) => key;

function buildWorkspace(overrides = {}) {
  return {
    phone: "+15555550100",
    prospect: {
      milestone: "Interview Confirmed",
      interviewType: "Zoom",
      email: "prospect@example.com",
      ...(overrides.prospect || {})
    },
    interview: {
      datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      type: "virtual",
      appointmentId: "appt-123",
      calendarEventId: "cal-123",
      ...(overrides.interview || {})
    },
    brain: {
      currentStep: "CONFIRMED",
      interviewType: "Zoom",
      ...(overrides.brain || {})
    },
    workflowGate: overrides.workflowGate || { active: false },
    raw: overrides.raw || {},
    ...overrides
  };
}

function findAction(actions, actionId) {
  return actions.find((action) => action.id === actionId);
}

const organizationSettings = {
  office: { fullAddress: "123 Main St" },
  meetingManagement: { personalMeetingUrl: "https://zoom.us/j/123" }
};

test("appointment communications disable together when appointment is not linked", () => {
  const workspace = buildWorkspace({
    interview: {
      appointmentId: null,
      calendarEventId: "cal-123",
      datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    }
  });
  const actions = resolveCommunicationActions(workspace, { translate, organizationSettings });

  for (const actionId of [
    COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
    COMMUNICATION_ACTION_IDS.SEND_ZOOM,
    COMMUNICATION_ACTION_IDS.SEND_REMINDER
  ]) {
    const action = findAction(actions, actionId);
    assert.equal(action.enabled, false, actionId);
    assert.equal(action.disabledReasonKey, "whatsappActionDisabledAppointmentNotLinked", actionId);
  }
});

test("appointment communications disable together for synthetic appointment ids", () => {
  const workspace = buildWorkspace({
    interview: {
      appointmentId: "prospect-derived:+15551234567:1785439800000",
      calendarEventId: "cal-123",
      datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    }
  });
  const actions = resolveCommunicationActions(workspace, { translate, organizationSettings });

  for (const actionId of [
    COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
    COMMUNICATION_ACTION_IDS.SEND_ZOOM,
    COMMUNICATION_ACTION_IDS.SEND_REMINDER
  ]) {
    const action = findAction(actions, actionId);
    assert.equal(action.enabled, false, actionId);
    assert.equal(action.disabledReasonKey, "whatsappActionDisabledAppointmentNotLinked", actionId);
  }
});

test("appointment communications enable together when persisted appointment exists", () => {
  const actions = resolveCommunicationActions(buildWorkspace(), { translate, organizationSettings });

  for (const actionId of [
    COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
    COMMUNICATION_ACTION_IDS.SEND_ZOOM,
    COMMUNICATION_ACTION_IDS.SEND_REMINDER
  ]) {
    const action = findAction(actions, actionId);
    assert.equal(action.enabled, true, actionId);
  }
});

test("send zoom requires persisted appointment even when calendar event exists", () => {
  const ctx = buildCommunicationActionContext(
    buildWorkspace({
      interview: {
        appointmentId: null,
        calendarEventId: "cal-123",
        datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      }
    }),
    organizationSettings
  );

  assert.equal(
    evaluateAppointmentCommunicationAvailability(ctx, { requireZoomInterview: true }),
    "whatsappActionDisabledAppointmentNotLinked"
  );
});

test("send zoom explains missing meeting link only after appointment linkage passes", () => {
  const actions = resolveCommunicationActions(
    buildWorkspace({
      interview: {
        appointmentId: "appt-123",
        calendarEventId: null,
        datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      },
      raw: { prospect: {} }
    }),
    { translate, organizationSettings: { office: { fullAddress: "123 Main St" } } }
  );

  const zoom = findAction(actions, COMMUNICATION_ACTION_IDS.SEND_ZOOM);
  const resend = findAction(actions, COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS);
  const reminder = findAction(actions, COMMUNICATION_ACTION_IDS.SEND_REMINDER);

  assert.equal(zoom.enabled, false);
  assert.equal(resend.enabled, false);
  assert.equal(reminder.enabled, false);
  assert.equal(zoom.disabledReasonKey, "whatsappActionDisabledZoomNotCreated");
  assert.equal(resend.disabledReasonKey, "whatsappActionDisabledZoomNotCreated");
  assert.equal(reminder.disabledReasonKey, "whatsappActionDisabledZoomNotCreated");
});

test("send office explains office interview type mismatch", () => {
  const actions = resolveCommunicationActions(buildWorkspace(), {
    translate,
    organizationSettings: { office: { fullAddress: "123 Main St" } }
  });

  const office = findAction(actions, COMMUNICATION_ACTION_IDS.SEND_OFFICE);

  assert.equal(office.enabled, false);
  assert.equal(office.disabledReasonKey, "whatsappActionDisabledInterviewTypeOffice");
});

test("custom whatsapp remains available when interview is not confirmed", () => {
  const actions = resolveCommunicationActions(
    buildWorkspace({
      prospect: { milestone: "Qualified" },
      brain: { currentStep: "QUALIFIED" },
      interview: { appointmentId: null, calendarEventId: null, datetime: null }
    }),
    { translate, organizationSettings }
  );

  const custom = findAction(actions, COMMUNICATION_ACTION_IDS.CUSTOM);

  assert.equal(custom.enabled, true);
  assert.equal(
    isInterviewConfirmed(
      buildWorkspace({
        prospect: { milestone: "Qualified" },
        brain: { currentStep: "QUALIFIED" },
        interview: { appointmentId: null, calendarEventId: null, datetime: null }
      })
    ),
    false
  );
});

test("resolveCommunicationActions always returns the full communication catalog", () => {
  const actions = resolveCommunicationActions(null, { translate });

  assert.equal(actions.length, 5);
  assert.deepEqual(
    actions.map((action) => action.id),
    COMMUNICATION_PANEL_ACTION_ORDER
  );
});

test("custom WhatsApp uses native composer hint subtitle", () => {
  const actions = resolveCommunicationActions(buildWorkspace(), {
    translate,
    organizationSettings
  });

  const custom = findAction(actions, COMMUNICATION_ACTION_IDS.CUSTOM);

  assert.equal(custom.enabled, true);
  assert.equal(custom.subtitle, "whatsappActionNativeComposerHint");
});

test("result pending gate keeps follow-up communications and hides pre-interview invitations", () => {
  const actions = resolveCommunicationActions(
    buildWorkspace({ workflowGate: { active: true } }),
    { translate, organizationSettings }
  );

  assert.equal(findAction(actions, COMMUNICATION_ACTION_IDS.CUSTOM).enabled, true);
  assert.equal(findAction(actions, COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS).enabled, true);
  assert.equal(findAction(actions, COMMUNICATION_ACTION_IDS.SEND_ZOOM).enabled, false);
  assert.equal(findAction(actions, COMMUNICATION_ACTION_IDS.SEND_REMINDER).enabled, false);
  assert.equal(findAction(actions, COMMUNICATION_ACTION_IDS.SEND_OFFICE).enabled, false);
});
