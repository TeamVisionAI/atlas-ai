import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNICATION_ACTION_IDS,
  resolveCommunicationActions,
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

test("resolveCommunicationActions always returns the full communication catalog", () => {
  const actions = resolveCommunicationActions(null, { translate });

  assert.equal(actions.length, 5);
  assert.deepEqual(
    actions.map((action) => action.id),
    [
      COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
      COMMUNICATION_ACTION_IDS.SEND_ZOOM,
      COMMUNICATION_ACTION_IDS.SEND_OFFICE,
      COMMUNICATION_ACTION_IDS.SEND_REMINDER,
      COMMUNICATION_ACTION_IDS.CUSTOM
    ]
  );
});

test("resolveCommunicationActions keeps the section populated during workflow gate", () => {
  const actions = resolveCommunicationActions(buildWorkspace({ workflowGate: { active: true } }), {
    translate
  });

  assert.ok(actions.length > 0);
  assert.equal(actions.every((action) => !action.enabled), true);
  assert.equal(actions[0].disabledReasonKey, "whatsappActionDisabledWorkflowGate");
});

test("resend interview details explains missing appointment linkage", () => {
  const actions = resolveCommunicationActions(
    buildWorkspace({ interview: { appointmentId: null, calendarEventId: "cal-123" } }),
    { translate, organizationSettings: { office: { fullAddress: "123 Main St" } } }
  );

  const resend = actions.find(
    (action) => action.id === COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS
  );

  assert.equal(resend.enabled, false);
  assert.equal(resend.disabledReasonKey, "whatsappActionDisabledAppointmentNotLinked");
});

test("send zoom explains missing meeting link for zoom interviews", () => {
  const actions = resolveCommunicationActions(
    buildWorkspace({
      interview: { appointmentId: "appt-123", calendarEventId: null },
      raw: { prospect: {} }
    }),
    { translate, organizationSettings: { office: { fullAddress: "123 Main St" } } }
  );

  const zoom = actions.find((action) => action.id === COMMUNICATION_ACTION_IDS.SEND_ZOOM);

  assert.equal(zoom.enabled, false);
  assert.equal(zoom.disabledReasonKey, "whatsappActionDisabledZoomNotCreated");
});

test("send office explains office interview type mismatch", () => {
  const actions = resolveCommunicationActions(buildWorkspace(), {
    translate,
    organizationSettings: { office: { fullAddress: "123 Main St" } }
  });

  const office = actions.find((action) => action.id === COMMUNICATION_ACTION_IDS.SEND_OFFICE);

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
    { translate, organizationSettings: { office: { fullAddress: "123 Main St" } } }
  );

  const custom = actions.find((action) => action.id === COMMUNICATION_ACTION_IDS.CUSTOM);

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

test("enabled actions keep the one-click hint subtitle", () => {
  const actions = resolveCommunicationActions(buildWorkspace(), {
    translate,
    organizationSettings: { office: { fullAddress: "123 Main St" } }
  });

  const custom = actions.find((action) => action.id === COMMUNICATION_ACTION_IDS.CUSTOM);

  assert.equal(custom.enabled, true);
  assert.equal(custom.subtitle, "whatsappActionOneClickHint");
});
