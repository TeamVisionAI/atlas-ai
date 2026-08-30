/**
 * BR-176 — appointment notification wall-clock + history actor presentation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { formatAppointmentWhenShort } = require("../core/appointmentConfirmationCopy");
const { buildNotificationCopy } = require("../core/agentNotifications/copy");
const { EVENT_TYPES } = require("../core/agentNotifications/constants");
const {
  presentAppointmentHistory,
  presentHistoryActorLabel
} = require("../core/appointmentHistory");

const NY = "America/New_York";

test("short appointment when uses America/New_York and stays friendly", () => {
  assert.equal(
    formatAppointmentWhenShort(
      { startDateTime: "2026-08-30T00:30:00+00:00", timezone: NY },
      "en"
    ),
    "Aug 29, 8:30 PM"
  );
  assert.equal(
    formatAppointmentWhenShort(
      { startDateTime: "2026-09-15T15:00:00.000Z", timezone: NY },
      "en"
    ),
    "Sep 15, 11:00 AM"
  );
  assert.equal(
    formatAppointmentWhenShort(
      { startDateTime: "2026-01-15T15:00:00.000Z", timezone: NY },
      "en"
    ),
    "Jan 15, 10:00 AM"
  );
});

test("notification copy stores a friendly when, not raw ISO", () => {
  const copy = buildNotificationCopy({
    eventType: EVENT_TYPES.NEW_APPOINTMENT,
    appointment: {
      startDateTime: "2026-08-30T00:30:00+00:00",
      timezone: NY
    }
  });
  assert.match(copy.body, /Aug 29, 8:30 PM/);
  assert.doesNotMatch(copy.body, /2026-08-30T00:30:00/);
});

test("history presentation resolves org users and falls back without UUIDs", () => {
  const nameById = new Map([
    ["33ad243a-9d00-4a4d-810b-df2762c0f076", "Niovel Perez"]
  ]);
  const presented = presentAppointmentHistory(
    [
      { type: "created", actor: "33ad243a-9d00-4a4d-810b-df2762c0f076" },
      { type: "cancelled", actor: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { type: "completed", actor: "system" }
    ],
    nameById
  );

  assert.equal(presented[0].actorName, "Niovel Perez");
  assert.equal(presented[1].actorName, "Former teammate");
  assert.equal(presented[2].actorName, "Atlas");
  assert.equal(
    presentHistoryActorLabel("33ad243a-9d00-4a4d-810b-df2762c0f076", nameById),
    "Niovel Perez"
  );
  assert.doesNotMatch(presented[1].actorName, /aaaaaaaa-aaaa/);
});
