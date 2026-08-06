/**
 * BR-076 — Zoom virtual meeting URL snapshot / hydration.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  VIRTUAL_MEETING_URL_SOURCES,
  VIRTUAL_URL_STATUSES,
  isApprovedHttpsZoomUrl,
  resolveCanonicalVirtualMeetingUrl,
  buildVirtualMeetingUrlDiagnostics
} = require("../core/virtualMeetingUrlResolver");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const ZOOM_URL = "https://us02web.zoom.us/j/123456789";
const OTHER_ZOOM = "https://zoom.us/j/987654321";

function orgResolver(orgId, urlByOrg) {
  return async (organizationId) => ({
    personalMeetingUrl: urlByOrg[organizationId] || null,
    officeAddress: null,
    meetingPreferences: [],
    configured: Boolean(urlByOrg[organizationId])
  });
}

test("1. new Zoom appointment snapshots configured organization URL", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );

  assert.equal(result.url, ZOOM_URL);
  assert.equal(result.status, VIRTUAL_URL_STATUSES.CONFIGURED);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.ORGANIZATION_MEETING_SETTINGS);
});

test("2. new Zoom appointment with no configured URL remains pending", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    { getMeetingManagement: orgResolver(ORG_A, {}) }
  );

  assert.equal(result.url, null);
  assert.equal(result.status, VIRTUAL_URL_STATUSES.PENDING);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE);
});

test("3. in-person appointment never receives Zoom URL", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "in_person",
      meetingProvider: null
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );

  assert.equal(result.url, null);
  assert.equal(result.status, VIRTUAL_URL_STATUSES.NOT_APPLICABLE);
});

test("4. reschedule preserves existing persisted URL over org settings", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom",
      persistedAppointment: { virtualMeetingUrl: OTHER_ZOOM },
      existingBooking: { meetingUrl: ZOOM_URL }
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );

  assert.equal(result.url, OTHER_ZOOM);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.PERSISTED_APPOINTMENT);
});

test("5. reschedule fills missing URL when approved org config exists", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom",
      persistedAppointment: { virtualMeetingUrl: null }
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );

  assert.equal(result.url, ZOOM_URL);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.ORGANIZATION_MEETING_SETTINGS);
});

test("6. legacy repair incomplete existingBooking fills from org settings", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom",
      existingBooking: {
        success: true,
        startTimeISO: "2026-08-07T17:51:00.000Z",
        endTimeISO: "2026-08-07T18:21:00.000Z",
        googleCalendarEventId: "cal-1",
        googleCalendarSynced: false
      }
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );

  assert.equal(result.url, ZOOM_URL);
  assert.equal(result.status, VIRTUAL_URL_STATUSES.CONFIGURED);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.ORGANIZATION_MEETING_SETTINGS);
});

test("7. wrong organization URL cannot be used", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    {
      getMeetingManagement: orgResolver(ORG_A, {
        [ORG_B]: ZOOM_URL
      })
    }
  );

  assert.equal(result.url, null);
  assert.equal(result.status, VIRTUAL_URL_STATUSES.PENDING);
});

test("8. null settings / invalid candidates cannot erase a persisted URL", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom",
      persistedAppointment: { virtualMeetingUrl: ZOOM_URL },
      existingBooking: { meetingUrl: null, zoomLink: null, meetLink: null }
    },
    { getMeetingManagement: async () => ({ personalMeetingUrl: null }) }
  );

  assert.equal(result.url, ZOOM_URL);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.PERSISTED_APPOINTMENT);
});

test("9. existingBooking URL wins over organization settings", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom",
      existingBooking: { meetingUrl: OTHER_ZOOM }
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );

  assert.equal(result.url, OTHER_ZOOM);
  assert.equal(result.source, VIRTUAL_MEETING_URL_SOURCES.EXISTING_BOOKING);
});

test("10. rejects non-HTTPS and non-Zoom hosts", () => {
  assert.equal(isApprovedHttpsZoomUrl("http://zoom.us/j/1"), false);
  assert.equal(isApprovedHttpsZoomUrl("https://meet.google.com/abc"), false);
  assert.equal(isApprovedHttpsZoomUrl("https://evil.com/?u=zoom.us"), false);
  assert.equal(isApprovedHttpsZoomUrl("https://us02web.zoom.us/j/1"), true);
  assert.equal(isApprovedHttpsZoomUrl("https://zoom.gov/j/1"), true);
});

test("11. diagnostics never include raw meeting URL", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );
  const diagnostics = buildVirtualMeetingUrlDiagnostics(result);
  const serialized = JSON.stringify(diagnostics);

  assert.equal(serialized.includes("zoom.us"), false);
  assert.equal(serialized.includes(ZOOM_URL), false);
  assert.equal(diagnostics.hasUrl, true);
});

test("12. case-insensitive Zoom provider still resolves", async () => {
  const result = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: ORG_A,
      meetingType: "Virtual",
      meetingProvider: "Zoom"
    },
    { getMeetingManagement: orgResolver(ORG_A, { [ORG_A]: ZOOM_URL }) }
  );

  assert.equal(result.url, ZOOM_URL);
  assert.equal(result.status, VIRTUAL_URL_STATUSES.CONFIGURED);
});

test("13. createAppointment hydrates incomplete existingBooking (source contract)", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );

  assert.match(source, /resolveCanonicalVirtualMeetingUrl/);
  assert.match(source, /BR-076/);
  assert.doesNotMatch(
    source,
    /else if \(isVirtual && existingBooking\) \{\s*meetingUrl =\s*existingBooking\.meetingUrl/
  );
});

test("14. Meta Review allowlist unchanged by this fix", () => {
  const allowlist = path.join(__dirname, "../../frontend/src/config/metaReviewMode.js");
  assert.equal(fs.existsSync(allowlist), true);
  const source = fs.readFileSync(allowlist, "utf8");
  assert.doesNotMatch(source, /virtualMeetingUrlResolver|virtual_meeting_url/);
});

test("15. BR-075 outbound gate remains present", () => {
  const gate = path.join(__dirname, "../core/whatsappOutboundAuthorizationGate.js");
  assert.equal(fs.existsSync(gate), true);
  const source = fs.readFileSync(gate, "utf8");
  assert.match(source, /BR-075|customer.?care|session.?window/i);
});
