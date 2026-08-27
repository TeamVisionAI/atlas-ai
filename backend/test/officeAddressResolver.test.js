/**
 * BR-077 — Canonical office address snapshot / hydration.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  OFFICE_ADDRESS_SOURCES,
  OFFICE_ADDRESS_STATUSES,
  isCompleteOfficeAddress,
  composeOfficeAddressFromOfficeModel,
  resolveCanonicalOfficeAddress,
  buildOfficeAddressDiagnostics
} = require("../core/officeAddressResolver");
const { OFFICE_ADDRESS, getCanonicalOfficeAddress } = require("../core/teamVisionWorkflowCopy");
const { buildPersistedAppointmentConfirmation } = require("../core/appointmentConfirmationCopy");

const ORG = "00000000-0000-4000-8000-000000000001";
const FULL = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const MM_ADDRESS = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const REQUEST = "100 Test St, Suite 5, Miami, FL 33130";

function mmResolver(officeAddress) {
  return async () => ({
    personalMeetingUrl: null,
    officeAddress: officeAddress || null,
    meetingPreferences: [],
    configured: Boolean(officeAddress)
  });
}

test("1. full office address includes suite", async () => {
  const result = await resolveCanonicalOfficeAddress(
    { organizationId: ORG, meetingType: "in_person" },
    { getMeetingManagement: mmResolver(null) }
  );
  assert.equal(result.address, FULL);
  assert.match(result.address, /Suite 189/);
  assert.equal(result.status, OFFICE_ADDRESS_STATUSES.CONFIGURED);
  assert.equal(result.source, OFFICE_ADDRESS_SOURCES.ORGANIZATION_PROFILE);
});

test("2. no address truncation / partial city-state rejected", () => {
  assert.equal(isCompleteOfficeAddress("Doral, FL"), false);
  assert.equal(isCompleteOfficeAddress(FULL), true);
  assert.equal(
    composeOfficeAddressFromOfficeModel({
      address: undefined,
      city: "Doral",
      state: "FL",
      postalCode: undefined,
      street: "2500 NW 79th Ave",
      suite: "Suite 189",
      zip: "33122",
      fullAddress: FULL
    }),
    FULL
  );
});

test("3. confirmation uses canonical full address (not truncated hardcode)", () => {
  const confirmation = buildPersistedAppointmentConfirmation(
    {
      id: "appt-1",
      organizationId: ORG,
      meetingType: "in_person",
      meetingAddress: null,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { preferred_language: "en" }
  );
  assert.match(confirmation.text, /Suite 189/);
  assert.equal(confirmation.text.includes("Miami, Florida"), false);
  assert.equal(OFFICE_ADDRESS, FULL);
  assert.equal(getCanonicalOfficeAddress(), FULL);
});

test("4. Meeting Management officeAddress wins over org profile", async () => {
  const custom = "9 Custom Ave, Suite 2, Doral, FL 33122";
  const result = await resolveCanonicalOfficeAddress(
    { organizationId: ORG, meetingType: "in_person" },
    { getMeetingManagement: mmResolver(custom) }
  );
  assert.equal(result.address, custom);
  assert.equal(result.source, OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT);
});

test("5. request address wins over Meeting Management when complete", async () => {
  const result = await resolveCanonicalOfficeAddress(
    {
      organizationId: ORG,
      meetingType: "in_person",
      requestAddress: REQUEST
    },
    { getMeetingManagement: mmResolver(MM_ADDRESS) }
  );
  assert.equal(result.address, REQUEST);
  assert.equal(result.source, OFFICE_ADDRESS_SOURCES.REQUEST);
});

test("6. persisted appointment address preserved", async () => {
  const persisted = "1 Persisted Rd, Suite 9, Doral, FL 33122";
  const result = await resolveCanonicalOfficeAddress(
    {
      organizationId: ORG,
      meetingType: "in_person",
      requestAddress: REQUEST,
      persistedAppointment: { meetingAddress: persisted }
    },
    { getMeetingManagement: mmResolver(MM_ADDRESS) }
  );
  assert.equal(result.address, persisted);
  assert.equal(result.source, OFFICE_ADDRESS_SOURCES.PERSISTED_APPOINTMENT);
});

test("7. Zoom appointment never receives office address", async () => {
  const result = await resolveCanonicalOfficeAddress(
    {
      organizationId: ORG,
      meetingType: "virtual",
      requestAddress: REQUEST
    },
    { getMeetingManagement: mmResolver(MM_ADDRESS) }
  );
  assert.equal(result.address, null);
  assert.equal(result.status, OFFICE_ADDRESS_STATUSES.NOT_APPLICABLE);
});

test("8. English and Spanish confirmation use same canonical snapshotted value", () => {
  const en = buildPersistedAppointmentConfirmation(
    {
      id: "appt-en",
      meetingType: "in_person",
      meetingAddress: FULL,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { preferred_language: "en" }
  );
  const es = buildPersistedAppointmentConfirmation(
    {
      id: "appt-es",
      meetingType: "in_person",
      meetingAddress: FULL,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { preferred_language: "es" }
  );
  assert.equal(en.text.includes(FULL), true);
  assert.equal(es.text.includes(FULL), true);
});

test("9. diagnostics never invent address and report suite presence", async () => {
  const result = await resolveCanonicalOfficeAddress(
    { organizationId: ORG, meetingType: "in_person" },
    { getMeetingManagement: mmResolver(null) }
  );
  const diagnostics = buildOfficeAddressDiagnostics(result);
  assert.equal(diagnostics.hasAddress, true);
  assert.equal(diagnostics.includesSuite, true);
  assert.equal(JSON.stringify(diagnostics).includes("79th"), false);
});

test("10. createAppointment wires BR-077 resolver (source contract)", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(service, /resolveCanonicalOfficeAddress/);
  assert.match(service, /BR-077/);
  assert.match(service, /officeAddressStatus/);
  assert.match(service, /composeOfficeAddressFromOfficeModel/);
  assert.doesNotMatch(
    service,
    /\[office\.address,\s*office\.city,\s*office\.state,\s*office\.postalCode\]/
  );
});

test("11. confirmation no longer imports truncated teamVision OFFICE_ADDRESS", () => {
  const copy = fs.readFileSync(
    path.join(__dirname, "../core/appointmentConfirmationCopy.js"),
    "utf8"
  );
  assert.doesNotMatch(copy, /teamVisionWorkflowCopy/);
  assert.match(copy, /getOfficeLocation/);
});

test("12. incomplete request does not suppress Meeting Management / org profile", async () => {
  const result = await resolveCanonicalOfficeAddress(
    {
      organizationId: ORG,
      meetingType: "in_person",
      requestAddress: "Doral, FL"
    },
    { getMeetingManagement: mmResolver(null) }
  );
  assert.equal(result.address, FULL);
  assert.equal(result.source, OFFICE_ADDRESS_SOURCES.ORGANIZATION_PROFILE);
});

test("13. non-seed tenant does not inherit Team Vision office", async () => {
  const result = await resolveCanonicalOfficeAddress(
    {
      organizationId: "af8fb707-f26c-4152-ad77-2d079d30bc8a",
      meetingType: "in_person"
    },
    { getMeetingManagement: mmResolver(null) }
  );
  assert.equal(result.address, null);
  assert.equal(result.status, OFFICE_ADDRESS_STATUSES.UNAVAILABLE);
  assert.doesNotMatch(String(result.address || ""), /79th/);

  const confirmation = buildPersistedAppointmentConfirmation(
    {
      id: "appt-tl",
      organizationId: "af8fb707-f26c-4152-ad77-2d079d30bc8a",
      meetingType: "in_person",
      meetingAddress: null,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { preferred_language: "en" }
  );
  assert.doesNotMatch(confirmation.text, /79th|Suite 189|Team Vision/i);
});
