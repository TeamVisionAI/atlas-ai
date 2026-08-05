/**
 * Hotfix — reschedule must keep prospect, atlas_appointments, and Google in sync.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  syncAppointmentGoogleCalendar,
  SYNC_STATUSES
} = require("../core/appointmentGoogleSyncEngine");
const { buildProspectCenterItem } = require("../core/prospectCenterReadModel");
const { MILESTONES } = require("../core/workflowConstants");

function baseAppointment(overrides = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440099",
    organizationId: "00000000-0000-4000-8000-000000000001",
    prospectPhone: "+15550001111",
    startDateTime: "2026-08-07T17:51:00.000Z",
    endDateTime: "2026-08-07T18:21:00.000Z",
    timezone: "America/New_York",
    metadata: { prospectName: "Ofelia Mutis" },
    calendarEventId: null,
    ...overrides
  };
}

test("1. reschedule sync creates Google event when no prior event id exists", async () => {
  let created = 0;
  let updated = 0;

  const result = await syncAppointmentGoogleCalendar(baseAppointment(), {
    deps: {
      getIntegrationStatus: async () => ({ connected: true, reconnectRequired: false }),
      updateCalendarEvent: async () => {
        updated += 1;
        return { id: "should-not-update" };
      },
      createCalendarEvent: async (_org, event) => {
        created += 1;
        assert.equal(event.startTimeISO, "2026-08-07T17:51:00.000Z");
        return { id: "new-event-1" };
      }
    }
  });

  assert.equal(created, 1);
  assert.equal(updated, 0);
  assert.equal(result.action, "created");
  assert.equal(result.calendarEventId, "new-event-1");
  assert.equal(result.calendarSyncStatus, SYNC_STATUSES.SYNCED);
});

test("2. Google event is updated when a prior event id exists", async () => {
  let created = 0;
  let updated = 0;

  const result = await syncAppointmentGoogleCalendar(
    baseAppointment({ calendarEventId: "existing-event" }),
    {
      deps: {
        getIntegrationStatus: async () => ({ connected: true, reconnectRequired: false }),
        updateCalendarEvent: async (_org, eventId, event) => {
          updated += 1;
          assert.equal(eventId, "existing-event");
          assert.equal(event.startTimeISO, "2026-08-07T17:51:00.000Z");
          return { id: eventId };
        },
        createCalendarEvent: async () => {
          created += 1;
          return { id: "dup" };
        }
      }
    }
  );

  assert.equal(updated, 1);
  assert.equal(created, 0);
  assert.equal(result.action, "updated");
  assert.equal(result.createdDuplicatePrevented, true);
  assert.equal(result.calendarEventId, "existing-event");
});

test("3. reconnect with missing/stale event id creates once (no silent skip)", async () => {
  let created = 0;

  const result = await syncAppointmentGoogleCalendar(
    baseAppointment({ calendarEventId: "stale-after-reconnect" }),
    {
      deps: {
        getIntegrationStatus: async () => ({ connected: true, reconnectRequired: false }),
        updateCalendarEvent: async () => {
          const error = new Error("Not Found");
          error.code = 404;
          throw error;
        },
        createCalendarEvent: async () => {
          created += 1;
          return { id: "recreated-event" };
        }
      }
    }
  );

  assert.equal(created, 1);
  assert.equal(result.action, "created");
  assert.equal(result.calendarEventId, "recreated-event");
});

test("4. no duplicate Google event when update succeeds", async () => {
  let createCalls = 0;
  await syncAppointmentGoogleCalendar(baseAppointment({ calendarEventId: "ev-1" }), {
    deps: {
      getIntegrationStatus: async () => ({ connected: true, reconnectRequired: false }),
      updateCalendarEvent: async () => ({ id: "ev-1" }),
      createCalendarEvent: async () => {
        createCalls += 1;
        return { id: "dup" };
      }
    }
  });
  assert.equal(createCalls, 0);
});

test("5. timezone/date payload preserves intended ISO start", async () => {
  let seenStart = null;
  await syncAppointmentGoogleCalendar(baseAppointment(), {
    deps: {
      getIntegrationStatus: async () => ({ connected: true, reconnectRequired: false }),
      createCalendarEvent: async (_org, event) => {
        seenStart = event.startTimeISO;
        assert.equal(event.timezone, "America/New_York");
        return { id: "ev" };
      }
    }
  });
  assert.equal(seenStart, "2026-08-07T17:51:00.000Z");
});

test("6. Google failure records retryable sync state", async () => {
  const result = await syncAppointmentGoogleCalendar(baseAppointment(), {
    deps: {
      getIntegrationStatus: async () => ({ connected: true, reconnectRequired: false }),
      createCalendarEvent: async () => {
        throw new Error("upstream unavailable");
      }
    }
  });

  assert.equal(result.calendarSyncStatus, SYNC_STATUSES.RETRY_REQUIRED);
  assert.match(result.calendarSyncError, /upstream unavailable/i);
  assert.equal(result.action, "failed");
});

test("7. Prospect Center does not show Interview scheduled without canonical appointment", () => {
  const item = buildProspectCenterItem(
    {
      phone: "+15550001111",
      name: "Ofelia Mutis",
      prospect_number: "TV-000011",
      interview_time: "2026-08-07T17:51:00.000Z",
      current_step: "CONFIRMED"
    },
    {
      phone: "+15550001111",
      name: "Ofelia Mutis",
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      currentStep: "CONFIRMED"
    },
    { phonesWithAppointments: new Set() }
  );

  assert.notEqual(item.canonicalMilestone, MILESTONES.INTERVIEW_SCHEDULED);
  assert.equal(item.interviewAt, null);
  assert.equal(item.appointmentMissing, true);
});

test("8. Prospect Center keeps Interview scheduled when appointment exists", () => {
  const item = buildProspectCenterItem(
    {
      phone: "+15550001111",
      interview_time: "2026-08-07T17:51:00.000Z",
      current_step: "CONFIRMED"
    },
    {
      phone: "+15550001111",
      name: "Ofelia Mutis",
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      currentStep: "CONFIRMED"
    },
    { phonesWithAppointments: new Set(["+15550001111"]) }
  );

  assert.equal(item.canonicalMilestone, MILESTONES.INTERVIEW_SCHEDULED);
  assert.equal(item.interviewAt, "2026-08-07T17:51:00.000Z");
  assert.equal(item.appointmentMissing, false);
});

test("9. persistRescheduledAppointment wires Google sync engine (source contract)", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(source, /syncAppointmentGoogleCalendar/);
  assert.match(source, /reconcileAppointmentGoogleCalendar/);
  assert.doesNotMatch(
    source,
    /updateCalendarEvent\([\s\S]*?\.catch\(\(\) => \{\}\)/
  );
});

test("10. Meta Review allowlist unchanged by this hotfix", () => {
  const changed = require("node:child_process")
    .execSync("git diff --name-only", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  for (const file of [
    "frontend/src/config/workspaceExperience.js",
    "frontend/src/config/metaReviewMode.js",
    "frontend/src/i18n/LanguageContext.jsx"
  ]) {
    assert.equal(changed.includes(file), false, file);
  }
});
