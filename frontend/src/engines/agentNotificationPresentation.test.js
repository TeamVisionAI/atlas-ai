import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFriendlyAppointmentWhen,
  presentHistoryActorLabel,
  presentNotificationBody
} from "./agentNotificationPresentation.js";

const NY = "America/New_York";

test("America/New_York formats UTC midnight as the previous evening", () => {
  assert.equal(
    formatFriendlyAppointmentWhen("2026-08-30T00:30:00+00:00", NY),
    "Aug 29, 8:30 PM"
  );
});

test("future and past appointments stay friendly in America/New_York", () => {
  assert.equal(
    formatFriendlyAppointmentWhen("2026-09-15T15:00:00.000Z", NY),
    "Sep 15, 11:00 AM"
  );
  assert.equal(
    formatFriendlyAppointmentWhen("2026-01-15T15:00:00.000Z", NY),
    "Jan 15, 10:00 AM"
  );
});

test("notification body rewrites stored ISO without changing surrounding copy", () => {
  const body = presentNotificationBody(
    "An appointment was scheduled for 2026-08-30T00:30:00+00:00.",
    { timeZone: NY }
  );
  assert.equal(body, "An appointment was scheduled for Aug 29, 8:30 PM.");
  assert.doesNotMatch(body, /T00:30:00/);
});

test("history actor uses display name and hides missing UUIDs", () => {
  assert.equal(
    presentHistoryActorLabel("33ad243a-9d00-4a4d-810b-df2762c0f076", "Niovel Perez"),
    "Niovel Perez"
  );
  assert.equal(
    presentHistoryActorLabel("33ad243a-9d00-4a4d-810b-df2762c0f076", ""),
    "Former teammate"
  );
  assert.equal(presentHistoryActorLabel("system"), "Atlas");
  assert.doesNotMatch(
    presentHistoryActorLabel("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    /aaaaaaaa-aaaa/
  );
});
