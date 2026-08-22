/**
 * SchedulingForm — Public Location field visibility + validation.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearPublicLocationFields,
  hasPublicLocationDetails,
  isSchedulingFormValidWithPublicLocation
} from "./schedulingPublicLocationForm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("1 selecting Public Location reveals fields in SchedulingForm", () => {
  const src = fs.readFileSync(path.join(__dirname, "SchedulingForm.jsx"), "utf8");
  assert.match(src, /form\.interviewType === "public_location"/);
  assert.match(src, /scheduling-public-location-name/);
  assert.match(src, /scheduling-public-location-address/);
  assert.match(src, /scheduling-public-location-url/);
});

test("2 Office hides public-location requirements", () => {
  assert.equal(
    isSchedulingFormValidWithPublicLocation({
      interviewType: "office",
      dateKey: "2026-08-21",
      timeKey: "10:00"
    }),
    true
  );
});

test("3 Zoom hides public-location requirements", () => {
  assert.equal(
    isSchedulingFormValidWithPublicLocation({
      interviewType: "zoom",
      dateKey: "2026-08-21",
      timeKey: "10:00"
    }),
    true
  );
});

test("4 Public Location requires name or address", () => {
  assert.equal(
    isSchedulingFormValidWithPublicLocation({
      interviewType: "public_location",
      dateKey: "2026-08-21",
      timeKey: "10:00"
    }),
    false
  );
  assert.equal(
    hasPublicLocationDetails({ meetingLocationName: "Starbucks Doral" }),
    true
  );
  assert.equal(
    isSchedulingFormValidWithPublicLocation({
      interviewType: "public_location",
      dateKey: "2026-08-21",
      timeKey: "10:00",
      meetingLocationAddress: "2500 NW 79th Ave"
    }),
    true
  );
});

test("9 switching Public→Office/Zoom clears stale public fields", () => {
  const cleared = clearPublicLocationFields({
    interviewType: "office",
    meetingLocationName: "Starbucks Doral",
    meetingLocationAddress: "123 Main",
    meetingLocationUrl: "https://maps.example/x",
    notes: "keep"
  });
  assert.equal(cleared.meetingLocationName, "");
  assert.equal(cleared.meetingLocationAddress, "");
  assert.equal(cleared.meetingLocationUrl, "");
  assert.equal(cleared.notes, "keep");

  const src = fs.readFileSync(path.join(__dirname, "SchedulingForm.jsx"), "utf8");
  assert.match(src, /nextType !== "public_location"/);
});
