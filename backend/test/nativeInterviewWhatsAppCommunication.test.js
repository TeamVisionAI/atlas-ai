/**
 * Native interview WhatsApp actions — communicationService routing contract.
 * Outside BR-075 window → approved Meta template pipeline (no wa.me).
 * Inside window → FE uses HumanWhatsAppComposer; send API may still record copy_open for legacy.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CANONICAL_META_TEMPLATE_NAMES,
  BASE_REGISTRY
} = require("../core/whatsappApprovedTemplateRegistry");
const {
  buildInterviewDetailsVariables,
  buildInterviewReminderVariables,
  buildZoomInvitationVariables
} = require("../core/whatsappTemplateVariableBuilder");

const servicePath = path.join(__dirname, "../services/communicationService.js");
const serviceSource = fs.readFileSync(servicePath, "utf8");

test("registry Meta names match expected interview template mapping", () => {
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_details.english,
    "atlas_interview_details_en"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_details.spanish,
    "atlas_interview_details_es"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_reminder.english,
    "atlas_interview_reminder_en"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_reminder.spanish,
    "atlas_interview_reminder_es"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.zoom_invitation.english,
    "atlas_zoom_invitation_en"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.zoom_invitation.spanish,
    "atlas_zoom_invitation_es"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_confirmation.english,
    "atlas_interview_confirmation_en"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_confirmation.spanish,
    "atlas_interview_confirmation_es"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.missed_appointment.spanish,
    "atlas_missed_appointment_es_v2"
  );
});

test("variable builders match registry expected keys", () => {
  assert.deepEqual(BASE_REGISTRY.interview_details.expectedVariableKeys, [
    "prospect_first_name",
    "interview_when",
    "meeting_type",
    "meeting_location"
  ]);
  assert.deepEqual(BASE_REGISTRY.interview_reminder.expectedVariableKeys, [
    "prospect_first_name",
    "interview_when",
    "meeting_type"
  ]);
  assert.deepEqual(BASE_REGISTRY.zoom_invitation.expectedVariableKeys, [
    "prospect_first_name"
  ]);
  assert.deepEqual(BASE_REGISTRY.zoom_invitation.expectedButtonVariableKeys, [
    "meeting_url"
  ]);

  const appointment = {
    startDateTime: "2026-08-15T15:00:00.000Z",
    timezone: "America/New_York",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: "https://zoom.us/j/123456789"
  };
  const prospect = {
    name: "Ana Garcia",
    preferred_language: "spanish"
  };

  const details = buildInterviewDetailsVariables(appointment, prospect);
  assert.equal(details.prospect_first_name, "Ana");
  assert.ok(details.interview_when);
  assert.ok(details.meeting_type);
  assert.ok("meeting_location" in details);

  const reminder = buildInterviewReminderVariables(appointment, prospect);
  assert.equal(reminder.prospect_first_name, "Ana");
  assert.ok(reminder.interview_when);
  assert.ok(reminder.meeting_type);

  const zoom = buildZoomInvitationVariables(prospect, appointment.virtualMeetingUrl);
  assert.equal(zoom.ok, true);
  assert.equal(zoom.variables.prospect_first_name, "Ana");
  assert.ok(zoom.buttonVariables.meeting_url);
});

test("communicationService routes outside-window native interview actions via sendTextMessage", () => {
  assert.match(serviceSource, /NATIVE_TEMPLATE_SOURCE_ACTIONS/);
  assert.match(serviceSource, /resend_interview_details/);
  assert.match(serviceSource, /send_interview_reminder/);
  assert.match(serviceSource, /send_zoom_link/);
  assert.match(serviceSource, /sendNativeApprovedTemplate/);
  assert.match(serviceSource, /sendTextMessage/);
  assert.match(serviceSource, /buildInterviewDetailsVariables/);
  assert.match(serviceSource, /buildInterviewReminderVariables/);
  assert.match(serviceSource, /buildZoomInvitationVariables/);
  assert.match(serviceSource, /opensWaMe: false/);
  assert.match(serviceSource, /DELIVERY_MODES\.AUTOMATIC/);
  assert.match(serviceSource, /customerCareWindow\.open === false/);
  assert.match(serviceSource, /preferComposer/);
});

test("office location is not in native interview template source actions", () => {
  const block = serviceSource.slice(
    serviceSource.indexOf("NATIVE_TEMPLATE_SOURCE_ACTIONS"),
    serviceSource.indexOf("SOURCE_ACTION_TO_TEMPLATE_KEY")
  );
  assert.match(block, /resend_interview_details/);
  assert.match(block, /send_interview_reminder/);
  assert.match(block, /send_zoom_link/);
  assert.doesNotMatch(block, /send_office_location/);
  assert.doesNotMatch(block, /send_missed_appointment/);
});
