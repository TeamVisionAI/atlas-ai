/**
 * Regression: Mission Control scheduling availability must not refetch in a loop.
 * Public-location fields must not appear in the fetch key.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_LOCATION_FIELDS_EXCLUDED_FROM_AVAILABILITY,
  buildSchedulingAvailabilityFetchKey,
  getSchedulingAvailabilityFetchCounters,
  isLivePollPausedForExpandedMissionAction,
  recordSchedulingAvailabilityFetch,
  resetSchedulingAvailabilityFetchCounters,
  resolveAvailabilityFetchReason,
  shouldFetchSchedulingAvailability
} from "./schedulingAvailabilityFetchGate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controllerSrc = fs.readFileSync(
  path.join(__dirname, "useSchedulingFormController.js"),
  "utf8"
);
const dashboardSrc = fs.readFileSync(
  path.join(__dirname, "../../pages/Dashboard.jsx"),
  "utf8"
);
const schedulingFormSrc = fs.readFileSync(path.join(__dirname, "SchedulingForm.jsx"), "utf8");
const appointmentServiceSrc = fs.readFileSync(
  path.join(__dirname, "../../services/appointmentService.js"),
  "utf8"
);

test("1 initial load: empty previous key → one logical fetch allowed", () => {
  resetSchedulingAvailabilityFetchCounters();
  const key = buildSchedulingAvailabilityFetchKey({
    interviewType: "public_location",
    interviewerUserId: "user-1"
  });

  assert.equal(shouldFetchSchedulingAvailability("", key), true);
  recordSchedulingAvailabilityFetch("initial", key);
  assert.equal(getSchedulingAvailabilityFetchCounters().logicalLoads, 1);
  assert.equal(getSchedulingAvailabilityFetchCounters().initialLoads, 1);

  assert.equal(shouldFetchSchedulingAvailability(key, key), false);
  assert.equal(getSchedulingAvailabilityFetchCounters().blockedIdentical, 1);
  assert.equal(getSchedulingAvailabilityFetchCounters().logicalLoads, 1);
});

test("2 selecting Public Location alone does not cause repeated identical fetches", () => {
  resetSchedulingAvailabilityFetchCounters();
  const key = buildSchedulingAvailabilityFetchKey({
    interviewType: "public_location",
    interviewerUserId: "user-1"
  });

  assert.equal(shouldFetchSchedulingAvailability("", key), true);
  recordSchedulingAvailabilityFetch("interview_type", key);

  for (let i = 0; i < 5; i += 1) {
    assert.equal(shouldFetchSchedulingAvailability(key, key), false);
  }

  assert.equal(getSchedulingAvailabilityFetchCounters().logicalLoads, 1);
  assert.equal(getSchedulingAvailabilityFetchCounters().blockedIdentical, 5);
});

test("3 typing location name/address/url does not change availability fetch key", () => {
  const base = {
    interviewType: "public_location",
    interviewerUserId: "user-1",
    meetingLocationName: "Starbucks",
    meetingLocationAddress: "1 Main St",
    meetingLocationUrl: "https://maps.example/1"
  };

  const before = buildSchedulingAvailabilityFetchKey(base);
  const afterName = buildSchedulingAvailabilityFetchKey({
    ...base,
    meetingLocationName: "Library"
  });
  const afterAddress = buildSchedulingAvailabilityFetchKey({
    ...base,
    meetingLocationAddress: "2 Oak Ave"
  });
  const afterUrl = buildSchedulingAvailabilityFetchKey({
    ...base,
    meetingLocationUrl: "https://maps.example/2"
  });

  assert.equal(before, afterName);
  assert.equal(before, afterAddress);
  assert.equal(before, afterUrl);

  for (const field of PUBLIC_LOCATION_FIELDS_EXCLUDED_FROM_AVAILABILITY) {
    assert.equal(before.includes(base[field]), false);
  }

  assert.match(controllerSrc, /buildSchedulingAvailabilityFetchKey/);
  assert.doesNotMatch(
    controllerSrc,
    /meetingLocationName|meetingLocationAddress|meetingLocationUrl/
  );
});

test("4 changing interviewer triggers exactly one new fetch reason", () => {
  resetSchedulingAvailabilityFetchCounters();
  const first = buildSchedulingAvailabilityFetchKey({
    interviewType: "office",
    interviewerUserId: "user-1"
  });
  const second = buildSchedulingAvailabilityFetchKey({
    interviewType: "office",
    interviewerUserId: "user-2"
  });

  assert.notEqual(first, second);
  assert.equal(resolveAvailabilityFetchReason(first, second), "interviewer");
  assert.equal(shouldFetchSchedulingAvailability(first, second), true);
  recordSchedulingAvailabilityFetch("interviewer", second);
  assert.equal(shouldFetchSchedulingAvailability(second, second), false);
  assert.equal(getSchedulingAvailabilityFetchCounters().logicalLoads, 1);

  assert.match(controllerSrc, /agentId:\s*interviewerUserId/);
  assert.match(controllerSrc, /form\.interviewerUserId/);
});

test("5 changing day/date uses expansion loader (not availability fetch key)", () => {
  const keyBefore = buildSchedulingAvailabilityFetchKey({
    interviewType: "zoom",
    interviewerUserId: "user-1"
  });
  const keyAfterDate = buildSchedulingAvailabilityFetchKey({
    interviewType: "zoom",
    interviewerUserId: "user-1",
    dateKey: "2026-08-22",
    timeKey: "10:00"
  });

  assert.equal(keyBefore, keyAfterDate);
  assert.match(controllerSrc, /loadDaySchedulingSlots/);
  assert.match(controllerSrc, /handleSelectDay/);
});

test("6 Office/Public/Zoom mode change triggers one refetch each", () => {
  resetSchedulingAvailabilityFetchCounters();
  const office = buildSchedulingAvailabilityFetchKey({
    interviewType: "office",
    interviewerUserId: "user-1"
  });
  const publicLoc = buildSchedulingAvailabilityFetchKey({
    interviewType: "public_location",
    interviewerUserId: "user-1"
  });
  const zoom = buildSchedulingAvailabilityFetchKey({
    interviewType: "zoom",
    interviewerUserId: "user-1"
  });

  assert.equal(resolveAvailabilityFetchReason("", office), "initial");
  assert.equal(resolveAvailabilityFetchReason(office, publicLoc), "interview_type");
  assert.equal(resolveAvailabilityFetchReason(publicLoc, zoom), "interview_type");

  assert.equal(shouldFetchSchedulingAvailability("", office), true);
  recordSchedulingAvailabilityFetch("initial", office);
  assert.equal(shouldFetchSchedulingAvailability(office, publicLoc), true);
  recordSchedulingAvailabilityFetch("interview_type", publicLoc);
  assert.equal(shouldFetchSchedulingAvailability(publicLoc, zoom), true);
  recordSchedulingAvailabilityFetch("interview_type", zoom);

  assert.equal(getSchedulingAvailabilityFetchCounters().logicalLoads, 3);
  assert.match(controllerSrc, /handleInterviewTypeChange/);
  assert.match(controllerSrc, /slotsLoadedForKeyRef\.current = ""/);
});

test("7 Support Mode TL remains tenant-scoped via shared apiFetch availability path", () => {
  assert.match(appointmentServiceSrc, /apiFetch\(`\/api\/appointments\/availability/);
  assert.match(controllerSrc, /fetchAppointmentAvailability/);
  // Cookie session carries Support Mode org; controller must not hardcode Team Vision org.
  assert.doesNotMatch(controllerSrc, /00000000-0000-4000-8000-000000000001/);
  assert.doesNotMatch(controllerSrc, /af8fb707-f26c-4152-ad77-2d079d30bc8a/);
});

test("8 Team Vision behavior unchanged: no TV-specific scheduling branch in controller", () => {
  assert.doesNotMatch(controllerSrc, /Team Vision|teamVision|TEAM_VISION/);
  assert.match(controllerSrc, /loadInitialSchedulingSlots/);
});

test("live poll pauses while scheduling (or any) mission action panel is expanded", () => {
  assert.equal(isLivePollPausedForExpandedMissionAction(null), false);
  assert.equal(isLivePollPausedForExpandedMissionAction(""), false);
  assert.equal(isLivePollPausedForExpandedMissionAction("schedule"), true);

  assert.match(dashboardSrc, /expandedMissionActionId/);
  assert.match(dashboardSrc, /MISSION_CONTROL_LIVE_POLL_MS/);
  assert.match(
    dashboardSrc,
    /Pause live workspace refresh while a Mission Action panel is open/
  );
});

test("slot grid stays visible while availability reloads (no loading flash loop)", () => {
  assert.match(schedulingFormSrc, /hideSlotGrid/);
  assert.match(schedulingFormSrc, /loadingSlots && slots\.length === 0/);
  assert.doesNotMatch(
    schedulingFormSrc,
    /!isLoading && !slotsError && groupedDays\.length/
  );
});
