import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAppointmentZoomDiagnostics,
  formatAppointmentMetaLabel,
  isZoomMeetingAppointment,
  resolveAppointmentMeetingLabel,
  shouldShowCopyZoomLinkAction,
  shouldShowJoinZoomAction,
  shouldShowLifecycleActions,
  shouldShowZoomLinkUnavailableWarning
} from "./appointmentCardPresentation.js";

const translate = (key) =>
  ({
    appointmentsMeetingProvider_zoom: "Zoom",
    appointmentsMeetingType_virtual: "Virtual",
    appointmentsMeetingType_in_person: "In person"
  })[key] || key;

const ZOOM_URL = "https://us02web.zoom.us/j/123456789";

test("scheduled Zoom + valid link → Join Zoom and Copy Zoom Link visible", () => {
  const appointment = {
    status: "scheduled",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: ZOOM_URL
  };

  assert.equal(shouldShowJoinZoomAction(appointment), true);
  assert.equal(shouldShowCopyZoomLinkAction(appointment), true);
  assert.equal(shouldShowZoomLinkUnavailableWarning(appointment), false);
});

test("scheduled Zoom + no link → warning state, no Join Zoom", () => {
  const appointment = {
    status: "scheduled",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: null,
    metadata: { virtualUrlStatus: "pending" }
  };

  assert.equal(shouldShowJoinZoomAction(appointment), false);
  assert.equal(shouldShowCopyZoomLinkAction(appointment), false);
  assert.equal(shouldShowZoomLinkUnavailableWarning(appointment), true);
});

test("in-person → no Zoom action or warning", () => {
  const appointment = {
    status: "scheduled",
    meetingType: "in_person",
    meetingProvider: null,
    meetingLocationName: "Team Vision Office"
  };

  assert.equal(isZoomMeetingAppointment(appointment), false);
  assert.equal(shouldShowJoinZoomAction(appointment), false);
  assert.equal(shouldShowZoomLinkUnavailableWarning(appointment), false);
});

test("completed Zoom → Join Zoom hidden", () => {
  assert.equal(
    shouldShowJoinZoomAction({
      status: "completed",
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: ZOOM_URL
    }),
    false
  );
  assert.equal(
    shouldShowZoomLinkUnavailableWarning({
      status: "completed",
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: ""
    }),
    false
  );
});

test("cancelled Zoom → Join Zoom hidden", () => {
  assert.equal(
    shouldShowJoinZoomAction({
      status: "cancelled",
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: ZOOM_URL
    }),
    false
  );
  assert.equal(
    shouldShowZoomLinkUnavailableWarning({
      status: "cancelled",
      meetingType: "virtual",
      meetingProvider: "zoom"
    }),
    false
  );
});

test("wrong-case enum does not silently break Zoom rendering", () => {
  const appointment = {
    status: "Scheduled",
    meetingType: "Virtual",
    meetingProvider: "Zoom",
    virtualMeetingUrl: ZOOM_URL
  };

  assert.equal(isZoomMeetingAppointment(appointment), true);
  assert.equal(shouldShowJoinZoomAction(appointment), true);
  assert.equal(
    resolveAppointmentMeetingLabel(appointment, translate),
    "Zoom"
  );
  assert.equal(
    formatAppointmentMetaLabel(appointment, translate, "Recruiting Interview"),
    "Recruiting Interview · Zoom"
  );
});

test("diagnostics never include raw meeting URL", () => {
  const diagnostics = buildAppointmentZoomDiagnostics({
    status: "scheduled",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: ZOOM_URL
  });

  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("zoom.us"), false);
  assert.equal(serialized.includes(ZOOM_URL), false);
  assert.equal(diagnostics.hasValidZoomMeetingUrl, true);
  assert.equal(diagnostics.showJoinZoom, true);
});

test("shouldShowLifecycleActions hides terminal appointments", () => {
  assert.equal(shouldShowLifecycleActions({ status: "scheduled" }), true);
  assert.equal(shouldShowLifecycleActions({ status: "completed" }), false);
  assert.equal(shouldShowLifecycleActions({ status: "cancelled" }), false);
});

test("resolveAppointmentMeetingLabel standardizes Zoom terminology", () => {
  assert.equal(
    resolveAppointmentMeetingLabel(
      { meetingType: "virtual", meetingProvider: "zoom" },
      translate
    ),
    "Zoom"
  );
});

test("formatAppointmentMetaLabel joins purpose and meeting label", () => {
  assert.equal(
    formatAppointmentMetaLabel(
      { meetingType: "virtual", meetingProvider: "zoom" },
      translate,
      "Recruiting Interview"
    ),
    "Recruiting Interview · Zoom"
  );
});

test("presentation helpers do not mutate appointment input", () => {
  const appointment = {
    status: "scheduled",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: null
  };
  const before = JSON.stringify(appointment);

  shouldShowJoinZoomAction(appointment);
  shouldShowZoomLinkUnavailableWarning(appointment);
  buildAppointmentZoomDiagnostics(appointment);

  assert.equal(JSON.stringify(appointment), before);
});
