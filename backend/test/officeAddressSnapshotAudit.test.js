/**
 * BR-077 regression guards for office-address suite preservation.
 * Read-only contract tests — no production writes, no WhatsApp sends.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getOfficeLocation } = require("../core/businessRulesEngine");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");
const { OFFICE_ADDRESS } = require("../core/teamVisionWorkflowCopy");
const {
  buildPersistedAppointmentConfirmation
} = require("../core/appointmentConfirmationCopy");
const {
  composeWhatsAppMessage,
  WHATSAPP_TEMPLATES
} = require("../core/whatsappCommunicationEngine");
const { buildCalendarEventPayload } = require("../core/appointmentGoogleSyncEngine");
const {
  composeOfficeAddressFromOfficeModel
} = require("../core/officeAddressResolver");
const {
  MEETING_PREFERENCES,
  hasPreference,
  normalizeMeetingManagement
} = require("../services/meetingManagementService");

const FULL_BR018 = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

test("1. BR-018 / getOfficeLocation full address includes Suite 189", () => {
  const office = getOfficeLocation();
  assert.equal(office.fullAddress, FULL_BR018);
  assert.match(office.fullAddress, /Suite 189/);
});

test("2. teamVisionWorkflowCopy OFFICE_ADDRESS aligned to BR-018 fullAddress", () => {
  assert.equal(OFFICE_ADDRESS, FULL_BR018);
  assert.match(OFFICE_ADDRESS, /Suite 189/);
});

test("3. composeOfficeAddressFromOfficeModel prefers fullAddress (no Doral, FL trap)", () => {
  const office = getOrganizationSettings().office;
  const snapshotted = composeOfficeAddressFromOfficeModel(office);
  assert.equal(snapshotted, FULL_BR018);
  assert.match(snapshotted, /Suite 189/);
});

test("4. confirmation fallback uses BR-018 full address with suite", () => {
  const fromFallback = buildPersistedAppointmentConfirmation(
    {
      id: "appt-2",
      meetingType: "in_person",
      meetingAddress: null,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { preferred_language: "es" }
  );
  assert.match(fromFallback.text, /Suite 189/);
  assert.equal(fromFallback.text.includes("Miami, Florida"), false);
});

test("5. confirmation with canonical full address preserves suite (EN + ES)", () => {
  const en = buildPersistedAppointmentConfirmation(
    {
      id: "appt-3",
      meetingType: "in_person",
      meetingAddress: FULL_BR018,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { preferred_language: "en" }
  );
  const es = buildPersistedAppointmentConfirmation(
    {
      id: "appt-3",
      meetingType: "in_person",
      meetingAddress: FULL_BR018,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { preferred_language: "es" }
  );
  assert.match(en.text, /Suite 189/);
  assert.match(es.text, /Suite 189/);
});

test("6. Send Office Address / Interview Details use live org fullAddress (has suite)", () => {
  const office = getOrganizationSettings().office;
  const officeMsg = composeWhatsAppMessage(WHATSAPP_TEMPLATES.OFFICE_LOCATION, {
    language: "en",
    office
  });
  assert.match(officeMsg, /Suite 189/);
});

test("7. Calendar payload includes full address; Zoom does not get office", () => {
  const inPerson = buildCalendarEventPayload({
    meetingType: "in_person",
    meetingAddress: FULL_BR018,
    virtualMeetingUrl: null,
    startDateTime: "2026-08-10T15:00:00.000Z",
    endDateTime: "2026-08-10T15:30:00.000Z"
  });
  assert.equal(inPerson.location, FULL_BR018);

  const zoom = buildCalendarEventPayload({
    meetingType: "virtual",
    meetingAddress: null,
    virtualMeetingUrl: "https://us02web.zoom.us/j/1",
    startDateTime: "2026-08-10T15:00:00.000Z",
    endDateTime: "2026-08-10T15:30:00.000Z"
  });
  assert.equal(String(zoom.location).includes("79th"), false);
});

test("8. Meeting Management normalizeAddress does not strip suite", () => {
  const mm = normalizeMeetingManagement({
    officeAddress: FULL_BR018,
    meetingPreferences: [MEETING_PREFERENCES.INCLUDE_OFFICE_IN_CALENDAR]
  });
  assert.equal(mm.officeAddress, FULL_BR018);
  assert.equal(hasPreference(mm, MEETING_PREFERENCES.INCLUDE_OFFICE_IN_CALENDAR), true);
});

test("9. createAppointment no longer uses buggy address/postalCode join", () => {
  const service = read("../application/appointmentApplicationService.js");
  assert.doesNotMatch(
    service,
    /\[office\.address,\s*office\.city,\s*office\.state,\s*office\.postalCode\]/
  );
  assert.match(service, /resolveCanonicalOfficeAddress/);
});

test("10. audit tests themselves perform no production writes", () => {
  const self = read("./officeAddressSnapshotAudit.test.js");
  assert.doesNotMatch(self, /sendTextMessage\(/);
  assert.doesNotMatch(self, /supabase\./);
  assert.match(self, /no production writes/);
});
