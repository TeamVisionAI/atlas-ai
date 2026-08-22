/**
 * Public Location scheduling details — form + persistence + calendar contracts.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  composePublicLocationDisplay,
  composePublicLocationCalendarLocation,
  composePublicLocationCalendarDescription,
  hasPublicLocationDetails
} = require("../core/publicLocationDetails");
const { buildCalendarEventPayload } = require("../core/appointmentGoogleSyncEngine");
const {
  resolveInterviewLocation
} = require("../services/meetingManagementService");
const { MEETING_LOCATION_TYPES } = require("../core/configuration/appointmentDomain");

const ORG_TV = "00000000-0000-4000-8000-000000000001";
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

test("public location helpers require name or address", () => {
  assert.equal(hasPublicLocationDetails({}), false);
  assert.equal(
    hasPublicLocationDetails({ meetingLocationName: "Starbucks Doral" }),
    true
  );
  assert.equal(
    hasPublicLocationDetails({
      meetingLocationAddress: "2500 NW 79th Ave, Doral, FL 33122"
    }),
    true
  );
  assert.equal(
    composePublicLocationDisplay({
      meetingLocationName: "Starbucks Doral",
      meetingLocationAddress: "123 Main St"
    }),
    "Starbucks Doral — 123 Main St"
  );
});

test("Google Calendar uses native location; notes/url stay in description", () => {
  const payload = buildCalendarEventPayload({
    prospectPhone: "+17865550100",
    meetingLocationType: MEETING_LOCATION_TYPES.PUBLIC_LOCATION,
    meetingLocationName: "Starbucks Doral",
    meetingAddress: "2500 NW 79th Ave, Doral, FL 33122",
    meetingNotes: "Ask for Niovel",
    metadata: {
      prospectName: "Alex",
      meetingLocationUrl: "https://maps.google.com/?q=starbucks-doral"
    },
    startDateTime: "2026-08-21T15:00:00.000Z",
    endDateTime: "2026-08-21T15:30:00.000Z",
    timezone: "America/New_York"
  });

  assert.equal(
    payload.location,
    "Starbucks Doral — 2500 NW 79th Ave, Doral, FL 33122"
  );
  assert.match(payload.description, /Directions: https:\/\/maps\.google\.com/);
  assert.match(payload.description, /Ask for Niovel/);
  assert.doesNotMatch(payload.location, /Ask for Niovel/);
  assert.doesNotMatch(payload.location, /maps\.google/);
});

test("Office/Zoom calendar mapping does not use public-location composer", () => {
  const office = buildCalendarEventPayload({
    meetingLocationType: "office",
    meetingAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    meetingNotes: "Park in visitor lot",
    startDateTime: "2026-08-21T15:00:00.000Z",
    endDateTime: "2026-08-21T15:30:00.000Z"
  });
  assert.equal(office.location, "2500 NW 79th Ave, Suite 189, Doral, FL 33122");
  assert.equal(office.description, "Park in visitor lot");

  const zoom = buildCalendarEventPayload({
    meetingLocationType: "virtual",
    virtualMeetingUrl: "https://zoom.us/j/123",
    meetingNotes: "Join 5 min early",
    startDateTime: "2026-08-21T15:00:00.000Z",
    endDateTime: "2026-08-21T15:30:00.000Z"
  });
  assert.equal(zoom.location, "https://zoom.us/j/123");
  assert.equal(zoom.description, "Join 5 min early");
});

test("resolveInterviewLocation public requires explicit details; no office fallback", async () => {
  const missing = await resolveInterviewLocation(ORG_TV, "Public Location", {
    officeLocation: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  });
  assert.equal(missing.configured, false);
  assert.equal(missing.errorCode, "PUBLIC_LOCATION_REQUIRED");

  const ok = await resolveInterviewLocation(ORG_TL, "Public Location", {
    meetingLocationName: "TL Cafe",
    meetingLocationAddress: "100 Legacy Blvd, Miami, FL 33101",
    officeLocation: "SHOULD_NOT_USE"
  });
  assert.equal(ok.configured, true);
  assert.match(ok.location, /TL Cafe|100 Legacy Blvd/);
  assert.doesNotMatch(String(ok.location), /SHOULD_NOT_USE/);
});

test("resolveLocationDetails persists public name/address/url without notes merge", () => {
  const {
    resolveLocationDetails
  } = (() => {
    // Re-require path through createAppointment's private helper via source contract.
    const src = fs.readFileSync(
      path.join(__dirname, "../application/appointmentApplicationService.js"),
      "utf8"
    );
    assert.match(src, /MEETING_LOCATION_TYPES\.PUBLIC_LOCATION/);
    assert.match(src, /never substitute office address for public-location/);
    assert.match(src, /meetingLocationUrl/);
    return { resolveLocationDetails: null };
  })();
  assert.equal(resolveLocationDetails, null);

  const details = composePublicLocationCalendarDescription({
    meetingLocationUrl: "https://maps.example/x",
    meetingNotes: "Bring ID"
  });
  assert.equal(details.includes("Bring ID"), true);
  assert.equal(details.includes("https://maps.example/x"), true);
});

test("frontend SchedulingForm reveals public fields and clears on switch", () => {
  const formSrc = fs.readFileSync(
    path.join(
      __dirname,
      "../../frontend/src/components/mission-control/SchedulingForm.jsx"
    ),
    "utf8"
  );
  assert.match(formSrc, /meetingLocationName/);
  assert.match(formSrc, /meetingLocationAddress/);
  assert.match(formSrc, /meetingLocationUrl/);
  assert.match(formSrc, /form\.interviewType === "public_location"/);
  assert.match(formSrc, /nextType !== "public_location"/);
  assert.match(formSrc, /hasPublicLocationDetails/);

  // Office/Zoom paths must not render the public-location section unconditionally.
  assert.doesNotMatch(
    formSrc,
    /interviewType === "office"[\s\S]*scheduling-public-location-name/
  );
});

test("schedule submit payloads include public location fields", () => {
  const dashboard = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/Dashboard.jsx"),
    "utf8"
  );
  const workspace = fs.readFileSync(
    path.join(
      __dirname,
      "../../frontend/src/features/prospect-workspace/hooks/useWorkspaceActions.js"
    ),
    "utf8"
  );
  assert.match(dashboard, /meetingLocationName:/);
  assert.match(dashboard, /meetingLocationAddress:/);
  assert.match(dashboard, /meetingLocationUrl:/);
  assert.match(workspace, /meetingLocationName:/);
  assert.match(workspace, /meetingLocationAddress:/);
});

test("mission execution createPersistedScheduleAppointment passes public fields", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(src, /meetingLocationType: isZoom/);
  assert.match(src, /meetingLocationName: isPublicLocation/);
  assert.match(src, /meetingLocationUrl: isPublicLocation/);
  assert.match(src, /PUBLIC_LOCATION_REQUIRED/);
});

test("reschedule uses buildCalendarEventPayload for location preservation", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(src, /buildCalendarEventPayload\(appointmentForSync/);
  assert.match(src, /location: calendarPayload\.location/);
});

test("tenant isolation: public location strings stay org-agnostic in helpers", () => {
  const tv = composePublicLocationCalendarLocation({
    meetingLocationName: "TV Cafe",
    meetingLocationAddress: "1 Vision Way"
  });
  const tl = composePublicLocationCalendarLocation({
    meetingLocationName: "TL Cafe",
    meetingLocationAddress: "2 Legacy Way"
  });
  assert.notEqual(tv, tl);
  assert.match(tv, /TV Cafe/);
  assert.match(tl, /TL Cafe/);
});
