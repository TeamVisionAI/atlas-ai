import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAppointmentMetaLabel,
  resolveAppointmentMeetingLabel,
  shouldShowJoinZoomAction,
  shouldShowLifecycleActions
} from "./appointmentCardPresentation.js";

const translate = (key) =>
  ({
    appointmentsMeetingProvider_zoom: "Zoom",
    appointmentsMeetingType_virtual: "Virtual",
    appointmentsMeetingType_in_person: "In person"
  })[key] || key;

test("shouldShowJoinZoomAction requires valid zoom url and active status", () => {
  assert.equal(
    shouldShowJoinZoomAction({
      status: "scheduled",
      virtualMeetingUrl: "https://us02web.zoom.us/j/123",
      meetingProvider: "zoom"
    }),
    true
  );

  assert.equal(
    shouldShowJoinZoomAction({
      status: "completed",
      virtualMeetingUrl: "https://us02web.zoom.us/j/123",
      meetingProvider: "zoom"
    }),
    false
  );

  assert.equal(
    shouldShowJoinZoomAction({
      status: "cancelled",
      virtualMeetingUrl: "https://us02web.zoom.us/j/123",
      meetingProvider: "zoom"
    }),
    false
  );

  assert.equal(
    shouldShowJoinZoomAction({
      status: "scheduled",
      virtualMeetingUrl: "",
      meetingProvider: "zoom"
    }),
    false
  );
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
