import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translations } from "../i18n/translations.js";
import { resolveAppointmentCardActionPlan } from "./interviewWorkflowPresentationEngine.js";
import {
  appointmentCardAllowsHorizontalOverflow,
  buildAppointmentCardAddressModel,
  buildAppointmentCardContactModel,
  buildMapsDirectionsUrl,
  formatAppointmentMetaLabel,
  formatInPersonAddressLines,
  isSyntheticWhatsAppStorageKey,
  isZoomMeetingMode,
  resolveAppointmentActionRowLayoutMode,
  resolveAppointmentMeetingLabel,
  shouldShowInPersonAddress,
  shouldShowJoinZoomAction,
  shouldShowLifecycleActions
} from "./appointmentCardPresentation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const translate = (key) =>
  ({
    appointmentsMeetingProvider_zoom: "Zoom",
    appointmentsMeetingType_virtual: "Virtual",
    appointmentsMeetingType_in_person: "In person",
    appointmentsMeetingLocation_office: "Office",
    appointmentsMeetingLocation_public_location: "Public location"
  })[key] || key;

test("real phone renders formatted/clickable contact model", () => {
  const contact = buildAppointmentCardContactModel({
    prospectName: "Mayra",
    prospectPhone: "+17865551234",
    prospectVisiblePhone: "+17865551234",
    prospectHasVisiblePhone: true
  });

  assert.equal(contact.contactKind, "phone");
  assert.equal(contact.contactLabel, "+17865551234");
  assert.equal(contact.telHref, "tel:+17865551234");
  assert.equal(contact.exposesSyntheticKey, false);
});

test("username-only prospect shows @username", () => {
  const contact = buildAppointmentCardContactModel({
    prospectName: "Paid Ad Lead",
    prospectPhone: "wa:bsuid:CC.A7K4BSUID1234567890",
    prospectWhatsAppUsername: "paid_ad_lead",
    prospectHasVisiblePhone: false
  });

  assert.equal(contact.contactKind, "username");
  assert.equal(contact.contactLabel, "@paid_ad_lead");
  assert.equal(contact.telHref, null);
  assert.equal(contact.copyValue, "@paid_ad_lead");
});

test("synthetic wa:bsuid key never rendered as phone contact", () => {
  const contact = buildAppointmentCardContactModel({
    prospectPhone: "wa:bsuid:CC.A7K4BSUID1234567890",
    prospectHasVisiblePhone: false
  });

  assert.equal(contact.contactKind, "unavailable");
  assert.equal(isSyntheticWhatsAppStorageKey("wa:bsuid:CC.A7K4BSUID1234567890"), true);
  assert.equal(contact.exposesSyntheticKey, true);
  assert.doesNotMatch(contact.contactLabel, /wa:bsuid:/);
});

test("phone unavailable fallback when no phone or username", () => {
  const contact = buildAppointmentCardContactModel({}, { phoneUnavailableLabel: "Phone unavailable" });
  assert.equal(contact.contactKind, "unavailable");
  assert.equal(contact.contactLabel, "Phone unavailable");
});

test("Zoom appointment shows Join Zoom when url and mode match", () => {
  assert.equal(
    shouldShowJoinZoomAction({
      status: "scheduled",
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: "https://us02web.zoom.us/j/123"
    }),
    true
  );
});

test("non-Zoom appointment does not show Join Zoom", () => {
  assert.equal(
    shouldShowJoinZoomAction({
      status: "scheduled",
      meetingType: "in_person",
      meetingLocationType: "office",
      meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    }),
    false
  );

  assert.equal(
    shouldShowJoinZoomAction({
      status: "scheduled",
      meetingType: "virtual",
      meetingProvider: "google_meet",
      virtualMeetingUrl: "https://meet.google.com/abc-defg-hij"
    }),
    false
  );
});

test("in-person appointment shows clickable address model", () => {
  const appointment = {
    meetingType: "in_person",
    meetingLocationType: "office",
    meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  };

  assert.equal(shouldShowInPersonAddress(appointment), true);

  const address = buildAppointmentCardAddressModel(appointment);
  assert.ok(address);
  assert.equal(address.lines.length, 2);
  assert.equal(address.lines[0], "2500 NW 79th Ave, Suite 189");
  assert.equal(address.lines[1], "Doral, FL 33122");
  assert.equal(
    address.mapsUrl,
    buildMapsDirectionsUrl("2500 NW 79th Ave, Suite 189, Doral, FL 33122")
  );
});

test("Zoom appointment does not show in-person address", () => {
  const appointment = {
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: "https://us02web.zoom.us/j/123",
    meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  };

  assert.equal(isZoomMeetingMode(appointment), true);
  assert.equal(shouldShowInPersonAddress(appointment), false);
  assert.equal(buildAppointmentCardAddressModel(appointment), null);
});

test("meta label uses meeting mode without duplicating address", () => {
  assert.equal(
    formatAppointmentMetaLabel(
      {
        meetingType: "in_person",
        meetingLocationType: "office",
        meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
      },
      translate,
      "Recruiting Interview"
    ),
    "Recruiting Interview · Office"
  );
});

test("action row stays compact at desktop width", () => {
  assert.equal(resolveAppointmentActionRowLayoutMode(1280), "compact-single-row");

  const css = fs.readFileSync(
    path.join(__dirname, "../pages/AppointmentsPage.css"),
    "utf8"
  );
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*flex-wrap: nowrap/);
  assert.doesNotMatch(css, /Directions/i);
});

test("mobile layout avoids page horizontal overflow", () => {
  assert.equal(resolveAppointmentActionRowLayoutMode(375), "wrap");
  assert.equal(appointmentCardAllowsHorizontalOverflow(375), true);

  const css = fs.readFileSync(
    path.join(__dirname, "../pages/AppointmentsPage.css"),
    "utf8"
  );
  assert.match(css, /\.appointments-page[\s\S]*overflow-x: hidden/);
});

test("shouldShowJoinZoomAction requires valid zoom url and active status", () => {
  assert.equal(
    shouldShowJoinZoomAction({
      status: "completed",
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: "https://us02web.zoom.us/j/123"
    }),
    false
  );

  assert.equal(
    shouldShowJoinZoomAction({
      status: "cancelled",
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: "https://us02web.zoom.us/j/123"
    }),
    false
  );

  assert.equal(
    shouldShowJoinZoomAction({
      status: "scheduled",
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: ""
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

test("formatInPersonAddressLines preserves short addresses", () => {
  assert.deepEqual(formatInPersonAddressLines("123 Main St"), ["123 Main St"]);
});

test("appointment card compact action labels render expected English copy", () => {
  const en = translations.en;
  const zoomPlan = resolveAppointmentCardActionPlan({
    status: "scheduled",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: "https://us02web.zoom.us/j/123"
  });

  assert.equal(en[zoomPlan.openWorkspaceLabelKey], "📂 Workspace");
  assert.equal(en.appointmentsJoinZoom, "🎥 Join Zoom");
  assert.equal(en.appointmentsRescheduleInterview, "📅 Reschedule");
  assert.equal(en[zoomPlan.cancelLabelKey], "❌ Cancel");
  assert.equal(en[zoomPlan.completeLabelKey], "✅ Complete");
  assert.doesNotMatch(en[zoomPlan.openWorkspaceLabelKey], /Open Workspace/i);
  assert.doesNotMatch(en[zoomPlan.cancelLabelKey], /Interview/i);
  assert.doesNotMatch(en[zoomPlan.completeLabelKey], /Interview/i);
});

test("compact card action labels reduce desktop row width estimate", () => {
  const en = translations.en;
  const compact = [
    "Add Note",
    en.appointmentsCardWorkspace,
    en.appointmentsJoinZoom,
    en.appointmentsRescheduleInterview,
    en.appointmentsCancel,
    en.appointmentsComplete
  ].join(" | ");
  const legacy = [
    "Add Note",
    en.appointmentsOpenProspect,
    en.appointmentsJoinZoom,
    en.appointmentsRescheduleInterview,
    en.appointmentsCancelInterview,
    en.appointmentsCompleteInterview
  ].join(" | ");

  assert.ok(compact.length < legacy.length);
});
