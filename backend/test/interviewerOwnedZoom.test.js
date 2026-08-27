/**
 * BR-162 — assigned interviewer is the Zoom owner.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  VIRTUAL_MEETING_URL_SOURCES,
  VIRTUAL_URL_STATUSES,
  resolveCanonicalVirtualMeetingUrl
} = require("../core/virtualMeetingUrlResolver");

const ORG = "00000000-0000-4000-8000-000000000001";
const LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const ANA = "ana-user";
const NIOVEL = "niovel-user";
const ADMIN = "admin-user";
const ANA_ZOOM = "https://us02web.zoom.us/j/111111111";
const NIOVEL_ZOOM = "https://us02web.zoom.us/j/222222222";
const ORG_ZOOM = "https://us02web.zoom.us/j/7862967254";
const ADMIN_ZOOM = "https://us02web.zoom.us/j/999999999";

function zoomByUser(map) {
  return {
    getAppointmentProfile: async (userId) => ({
      appointmentProfile: {
        virtualMeeting: { personalMeetingUrl: map[userId] || null }
      }
    }),
    getMeetingManagement: async (organizationId) => ({
      personalMeetingUrl: organizationId === LEGACY_ORG ? "https://zoom.us/j/legacy" : ORG_ZOOM
    })
  };
}

test("Ana booking sends Ana Zoom", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG,
      interviewerUserId: ANA,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    zoomByUser({ [ANA]: ANA_ZOOM, [NIOVEL]: NIOVEL_ZOOM, [ADMIN]: ADMIN_ZOOM })
  );
  assert.equal(result.url, ANA_ZOOM);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.USER_MEETING_SETTINGS);
});

test("Niovel overflow booking sends Niovel Zoom", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG,
      interviewerUserId: NIOVEL,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    zoomByUser({ [ANA]: ANA_ZOOM, [NIOVEL]: NIOVEL_ZOOM })
  );
  assert.equal(result.url, NIOVEL_ZOOM);
});

test("two simultaneous 5 PM appointments can carry different Zoom links", async () => {
  const ana = await resolveCanonicalVirtualMeetingUrl(
    { organizationId: ORG, interviewerUserId: ANA, meetingType: "virtual", meetingProvider: "zoom" },
    zoomByUser({ [ANA]: ANA_ZOOM, [NIOVEL]: NIOVEL_ZOOM })
  );
  const niovel = await resolveCanonicalVirtualMeetingUrl(
    { organizationId: ORG, interviewerUserId: NIOVEL, meetingType: "virtual", meetingProvider: "zoom" },
    zoomByUser({ [ANA]: ANA_ZOOM, [NIOVEL]: NIOVEL_ZOOM })
  );
  assert.equal(ana.url, ANA_ZOOM);
  assert.equal(niovel.url, NIOVEL_ZOOM);
  assert.notEqual(ana.url, niovel.url);
});

test("reminders preserve snapshotted Zoom per appointment", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG,
      interviewerUserId: NIOVEL,
      meetingType: "virtual",
      meetingProvider: "zoom",
      persistedAppointment: { virtualMeetingUrl: NIOVEL_ZOOM }
    },
    zoomByUser({ [ANA]: ANA_ZOOM, [NIOVEL]: "https://us02web.zoom.us/j/changed" })
  );
  assert.equal(result.url, NIOVEL_ZOOM);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.PERSISTED_APPOINTMENT);

  const reminderSource = fs.readFileSync(
    path.join(__dirname, "../services/appointmentReminderEngine.js"),
    "utf8"
  );
  assert.match(reminderSource, /appointment\.virtualMeetingUrl/);
});

test("reschedule does not swap Zoom to org or admin", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG,
      interviewerUserId: ANA,
      meetingType: "virtual",
      meetingProvider: "zoom",
      persistedAppointment: { virtualMeetingUrl: ANA_ZOOM },
      existingBooking: { meetingUrl: ORG_ZOOM }
    },
    zoomByUser({ [ANA]: ANA_ZOOM, [ADMIN]: ADMIN_ZOOM })
  );
  assert.equal(result.url, ANA_ZOOM);
  assert.notEqual(result.url, ORG_ZOOM);
  assert.notEqual(result.url, ADMIN_ZOOM);
});

test("Support Mode / admin identity does not affect Zoom resolution", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG,
      interviewerUserId: ANA,
      agentId: ADMIN,
      meetingType: "virtual",
      meetingProvider: "zoom",
      existingBooking: { meetingUrl: ADMIN_ZOOM }
    },
    zoomByUser({ [ANA]: ANA_ZOOM, [ADMIN]: ADMIN_ZOOM })
  );
  assert.equal(result.url, ANA_ZOOM);
  assert.notEqual(result.url, ADMIN_ZOOM);
});

test("assigned interviewer without personal Zoom fails closed instead of TV default", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG,
      interviewerUserId: ANA,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    zoomByUser({ [ANA]: null })
  );
  assert.equal(result.url, null);
  assert.equal(result.status, VIRTUAL_URL_STATUSES.PENDING);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE);
});

test("Team Legacy remains tenant/user scoped", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: LEGACY_ORG,
      interviewerUserId: "legacy-user",
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    zoomByUser({ "legacy-user": "https://zoom.us/j/legacy-user" })
  );
  assert.equal(result.url, "https://zoom.us/j/legacy-user");
  assert.notEqual(result.url, ORG_ZOOM);
});

test("booking path resolves interviewer Zoom before calendar echo", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(source, /interviewerUserId: interviewAssignment\.interviewerUserId/);
  assert.match(source, /INTERVIEWER_ZOOM_NOT_CONFIGURED/);
  assert.doesNotMatch(source, /input\.agentId \|\|\s*$/);
});
