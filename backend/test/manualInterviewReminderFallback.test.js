const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  MANUAL_REMINDER_CONTACT_NAME,
  buildManualInterviewReminderFallback,
  buildManualInterviewDetailsFallback,
  buildManualOfficeAddressFallback,
  buildManualZoomInvitationFallback,
  formatReminderWhenParts
} = require("../core/manualInterviewReminderFallback");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");

const OFFICE_ADDRESS = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const START_ISO = "2026-03-15T18:30:00.000Z";
const TIMEZONE = "America/New_York";

test("BR-214 contact name is Ana Perez", () => {
  assert.equal(MANUAL_REMINDER_CONTACT_NAME, "Ana Perez");
});

test("in-person reminder fallback includes name, local time, office address, and Ana Perez", () => {
  const when = formatReminderWhenParts(START_ISO, TIMEZONE, "es");
  const message = buildManualInterviewReminderFallback({
    prospectName: "Maria Lopez",
    startIso: START_ISO,
    timezone: TIMEZONE,
    meetingMode: "in_person",
    officeAddress: OFFICE_ADDRESS,
    language: "es",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });

  assert.match(message, /Hola, Maria\./);
  assert.match(message, new RegExp(when.weekday, "i"));
  assert.match(message, new RegExp(when.date.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(message.includes(when.time));
  assert.ok(message.includes(OFFICE_ADDRESS));
  assert.ok(message.includes("Ana Perez"));
  assert.ok(message.includes("oficina"));
  assert.ok(!message.toLowerCase().includes("zoom"));
});

test("Zoom reminder fallback includes name, local time, Zoom wording, Ana Perez, and no office address", () => {
  const when = formatReminderWhenParts(START_ISO, TIMEZONE, "es");
  const message = buildManualInterviewReminderFallback({
    prospectName: "Maria Lopez",
    startIso: START_ISO,
    timezone: TIMEZONE,
    meetingMode: "zoom",
    officeAddress: OFFICE_ADDRESS,
    language: "es",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });

  assert.match(message, /Hola, Maria\./);
  assert.match(message, new RegExp(when.weekday, "i"));
  assert.ok(message.includes(when.time));
  assert.ok(message.includes("por Zoom"));
  assert.ok(message.includes("Ana Perez"));
  assert.ok(!message.includes(OFFICE_ADDRESS));
  assert.ok(!message.includes("oficina"));
});

test("interview details fallback includes local time, office or Zoom, and Ana Perez", () => {
  const office = buildManualInterviewDetailsFallback({
    prospectName: "Maria Lopez",
    startIso: START_ISO,
    timezone: TIMEZONE,
    meetingMode: "in_person",
    officeAddress: OFFICE_ADDRESS,
    language: "es",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.match(office, /Le confirmamos su cita/);
  assert.ok(office.includes(OFFICE_ADDRESS));
  assert.ok(office.includes("Ana Perez"));

  const zoom = buildManualInterviewDetailsFallback({
    prospectName: "Maria Lopez",
    startIso: START_ISO,
    timezone: TIMEZONE,
    meetingMode: "zoom",
    officeAddress: OFFICE_ADDRESS,
    language: "es",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.ok(zoom.includes("por Zoom"));
  assert.ok(!zoom.includes(OFFICE_ADDRESS));
});

test("office address fallback includes configured address and Ana Perez", () => {
  const message = buildManualOfficeAddressFallback({
    prospectName: "Maria Lopez",
    officeAddress: OFFICE_ADDRESS,
    language: "es",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.match(message, /Hola, Maria\./);
  assert.ok(message.includes(OFFICE_ADDRESS));
  assert.ok(message.includes("Ana Perez"));
  assert.ok(!message.toLowerCase().includes("zoom"));
});

test("Zoom invitation fallback excludes office address", () => {
  const message = buildManualZoomInvitationFallback({
    prospectName: "Maria Lopez",
    startIso: START_ISO,
    timezone: TIMEZONE,
    officeAddress: OFFICE_ADDRESS,
    language: "es",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.ok(message.includes("por Zoom"));
  assert.ok(message.includes("Ana Perez"));
  assert.ok(!message.includes(OFFICE_ADDRESS));
});

test("reminder preview no longer requires a Zoom URL and all appointment previews fall back", () => {
  const application = fs.readFileSync(
    path.join(__dirname, "../application/whatsappCommunicationApplicationService.js"),
    "utf8"
  );
  assert.match(application, /INTERVIEW_DETAILS && isZoomInterview/);
  assert.doesNotMatch(application, /INTERVIEW_REMINDER && isZoomInterview/);

  const service = fs.readFileSync(
    path.join(__dirname, "../services/communicationService.js"),
    "utf8"
  );
  assert.match(service, /assembleManualCommunicationFallback/);
  assert.match(service, /previewAppointmentCommunicationWithFallback/);
  assert.match(service, /previewInterviewReminderCommunication/);
  assert.match(service, /previewInterviewDetailsCommunication/);
  assert.match(service, /previewZoomInvitationCommunication/);
  assert.match(service, /previewOfficeLocationCommunication/);
  assert.match(service, /fallbackUsed: true/);
  assert.match(service, /Interview reminder fallback ready/);
});
