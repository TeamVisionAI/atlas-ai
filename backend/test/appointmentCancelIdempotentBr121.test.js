/**
 * BR-121 — Idempotent Calendar cancellation + domain rollback continuation.
 * Fixture/replay only — does not mutate production Anthony appointment.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isMissingGoogleEventError,
  isAlreadyAbsentGoogleEventError
} = require("../core/googleCalendarAbsence");
const { cancelAppointment: cancelDomain } = require("../modules/appointments/application/appointmentDomainService");
const appointmentGoogleSyncEngine = require("../core/appointmentGoogleSyncEngine");

const ANTHONY_FIXTURE = Object.freeze({
  appointmentId: "12624b16-493b-4856-9747-fbb61bf48487",
  calendarEventId: "mnr3ja8858lghh14tugv4da2nk",
  organizationId: "00000000-0000-4000-8000-000000000001",
  prospectPhone: "+17867527481",
  startDateTime: "2026-08-11T00:00:00.000Z",
  endDateTime: "2026-08-11T00:30:00.000Z",
  timezone: "America/New_York",
  calendarStatus: "cancelled",
  atlasStatus: "scheduled"
});

function googleError({ status, message, reason }) {
  const error = new Error(message || "Google Calendar error");
  if (status != null) {
    error.code = status;
    error.status = status;
    error.response = { status, data: { error: { message, errors: reason ? [{ reason }] : [] } } };
  }
  if (reason) {
    error.errors = [{ reason }];
  }
  return error;
}

test("BR-121 classification: 404 / 410 / resource deleted are already absent", () => {
  assert.equal(isMissingGoogleEventError(googleError({ status: 404, message: "Not Found" })), true);
  assert.equal(isMissingGoogleEventError(googleError({ status: 410, message: "Gone" })), true);
  assert.equal(
    isAlreadyAbsentGoogleEventError(
      googleError({ status: 410, message: "Resource has been deleted" })
    ),
    true
  );
  assert.equal(
    isMissingGoogleEventError(googleError({ reason: "notFound", message: "Not Found" })),
    true
  );
  assert.equal(
    isMissingGoogleEventError(new Error("Resource has been deleted")),
    true
  );
});

test("BR-121 classification: unrelated Calendar failures are NOT already absent", () => {
  assert.equal(
    isMissingGoogleEventError(googleError({ status: 401, message: "Invalid Credentials" })),
    false
  );
  assert.equal(
    isMissingGoogleEventError(googleError({ status: 500, message: "Backend Error" })),
    false
  );
  assert.equal(
    isMissingGoogleEventError(googleError({ status: 403, message: "Insufficient Permissions" })),
    false
  );
});

test("BR-121 re-exports classifier from appointmentGoogleSyncEngine", () => {
  assert.equal(typeof appointmentGoogleSyncEngine.isMissingGoogleEventError, "function");
  assert.equal(typeof appointmentGoogleSyncEngine.isAlreadyAbsentGoogleEventError, "function");
  assert.equal(
    appointmentGoogleSyncEngine.isMissingGoogleEventError(
      googleError({ status: 410, message: "Resource has been deleted" })
    ),
    true
  );
});

test("BR-121: Anthony fixture — Calendar already cancelled does not block domain cancel", async () => {
  assert.equal(ANTHONY_FIXTURE.calendarStatus, "cancelled");
  assert.equal(ANTHONY_FIXTURE.atlasStatus, "scheduled");

  const alreadyCancelledDeleteError = googleError({
    status: 410,
    message: "Resource has been deleted"
  });
  assert.equal(isAlreadyAbsentGoogleEventError(alreadyCancelledDeleteError), true);

  const scheduled = {
    id: ANTHONY_FIXTURE.appointmentId,
    organizationId: ANTHONY_FIXTURE.organizationId,
    prospectId: "a257b152-43ea-401f-8de3-783b997013ff",
    prospectPhone: ANTHONY_FIXTURE.prospectPhone,
    agentId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    purpose: "recruiting_interview",
    status: "scheduled",
    startDateTime: ANTHONY_FIXTURE.startDateTime,
    endDateTime: ANTHONY_FIXTURE.endDateTime,
    timezone: ANTHONY_FIXTURE.timezone,
    calendarEventId: ANTHONY_FIXTURE.calendarEventId,
    ownerRepId: "4TJLK",
    history: [],
    metadata: { ownerRepId: "4TJLK" }
  };

  // Domain cancel must succeed independently of Calendar delete outcome (fixture / replay).
  const cancelled = await cancelDomain(scheduled, {
    actor: "br121-fixture",
    reason: "schedule_workflow_rollback"
  });

  assert.equal(cancelled.status, "cancelled");
  assert.notEqual(cancelled.status, "scheduled");
});

test("BR-121 schedulingService.cancelAppointment: 404/410 soft-succeed without throw", async () => {
  const gcalPath = require.resolve("../services/googleCalendarIntegrationService");
  const schedulingPath = require.resolve("../services/schedulingService");
  const originalGcal = require(gcalPath);

  const calls = [];

  require.cache[gcalPath].exports = {
    ...originalGcal,
    deleteCalendarEvent: async (_org, eventId) => {
      calls.push(eventId);
      const error = googleError({ status: 410, message: "Resource has been deleted" });
      if (isAlreadyAbsentGoogleEventError(error)) {
        return { deleted: true, alreadyAbsent: true, absenceReason: error.message };
      }
      throw error;
    }
  };

  delete require.cache[schedulingPath];
  const { cancelAppointment } = require(schedulingPath);

  const result = await cancelAppointment({
    appointmentType: "interview",
    startTimeISO: ANTHONY_FIXTURE.startDateTime,
    googleCalendarEventId: ANTHONY_FIXTURE.calendarEventId,
    organizationId: ANTHONY_FIXTURE.organizationId
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.calendarAlreadyAbsent, true);
  assert.equal(result.calendarError, null);
  assert.equal(calls.length, 1);

  require.cache[gcalPath].exports = originalGcal;
  delete require.cache[schedulingPath];
  require(schedulingPath);
});

test("BR-121 schedulingService.cancelAppointment: unexpected Calendar error does not throw", async () => {
  const gcalPath = require.resolve("../services/googleCalendarIntegrationService");
  const schedulingPath = require.resolve("../services/schedulingService");
  const originalGcal = require(gcalPath);

  require.cache[gcalPath].exports = {
    ...originalGcal,
    deleteCalendarEvent: async () => {
      throw googleError({ status: 500, message: "Backend Error" });
    }
  };

  delete require.cache[schedulingPath];
  const { cancelAppointment } = require(schedulingPath);

  const result = await cancelAppointment({
    appointmentType: "interview",
    startTimeISO: ANTHONY_FIXTURE.startDateTime,
    googleCalendarEventId: "evt-unexpected",
    organizationId: ANTHONY_FIXTURE.organizationId
  });

  assert.equal(result.cancelled, true);
  assert.match(String(result.calendarError), /Backend Error/);

  require.cache[gcalPath].exports = originalGcal;
  delete require.cache[schedulingPath];
  require(schedulingPath);
});

test("BR-121 appointmentApplicationService.cancelAppointment continues domain cancel after 410", async () => {
  const repoPath = require.resolve("../repositories/appointmentRepository");
  const schedulingPath = require.resolve("../services/schedulingService");
  const supabasePath = require.resolve("../services/supabaseService");
  const appPath = require.resolve("../application/appointmentApplicationService");
  const reminderPath = require.resolve("../services/appointmentReminderEngine");

  const appointmentRepository = require(repoPath);
  const schedulingService = require(schedulingPath);
  const supabaseService = require(supabasePath);
  const reminderEngine = require(reminderPath);

  const originalFindById = appointmentRepository.findById;
  const originalSave = appointmentRepository.save;
  const originalCancelCapacity = schedulingService.cancelAppointment;
  const originalUpdateProspect = supabaseService.updateProspect;
  const originalCancelReminders = reminderEngine.cancelReminders;

  let saved = null;
  let deleteAttempts = 0;

  appointmentRepository.findById = async () => ({
    id: ANTHONY_FIXTURE.appointmentId,
    organizationId: ANTHONY_FIXTURE.organizationId,
    prospectId: "a257b152-43ea-401f-8de3-783b997013ff",
    prospectPhone: ANTHONY_FIXTURE.prospectPhone,
    agentId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    purpose: "recruiting_interview",
    status: "scheduled",
    startDateTime: ANTHONY_FIXTURE.startDateTime,
    endDateTime: ANTHONY_FIXTURE.endDateTime,
    timezone: ANTHONY_FIXTURE.timezone,
    calendarEventId: ANTHONY_FIXTURE.calendarEventId,
    ownerRepId: "4TJLK",
    history: [],
    metadata: { ownerRepId: "4TJLK", prospectName: "Anthony Perez" }
  });

  appointmentRepository.save = async (row) => {
    saved = row;
    return row;
  };

  schedulingService.cancelAppointment = async () => {
    deleteAttempts += 1;
    return {
      cancelled: true,
      calendarDeleted: true,
      calendarAlreadyAbsent: true,
      calendarError: null
    };
  };

  supabaseService.updateProspect = async () => ({});
  reminderEngine.cancelReminders = () => {};

  delete require.cache[appPath];
  const service = require(appPath);

  const result = await service.cancelAppointment(
    ANTHONY_FIXTURE.appointmentId,
    { reason: "schedule_workflow_rollback" },
    {
      organizationId: ANTHONY_FIXTURE.organizationId,
      agentId: "33ad243a-9d00-4a4d-810b-df2762c0f076"
    }
  );

  assert.equal(deleteAttempts, 1);
  assert.equal(saved.status, "cancelled");
  assert.equal(saved.calendarEventId, null);
  assert.equal(result.status, "cancelled");
  assert.notEqual(result.status, "scheduled");

  appointmentRepository.findById = originalFindById;
  appointmentRepository.save = originalSave;
  schedulingService.cancelAppointment = originalCancelCapacity;
  supabaseService.updateProspect = originalUpdateProspect;
  reminderEngine.cancelReminders = originalCancelReminders;
  delete require.cache[appPath];
  require(appPath);
});

test("BR-121 double-delete rollback is idempotent; domain cancel still completes", async () => {
  const gcalPath = require.resolve("../services/googleCalendarIntegrationService");
  const schedulingPath = require.resolve("../services/schedulingService");
  const originalGcal = require(gcalPath);

  let deleteCalls = 0;
  require.cache[gcalPath].exports = {
    ...originalGcal,
    deleteCalendarEvent: async (_org, eventId) => {
      deleteCalls += 1;
      if (deleteCalls === 1) {
        return { deleted: true, alreadyAbsent: false };
      }
      // Second cleanup after first rollback already cancelled the event.
      return {
        deleted: true,
        alreadyAbsent: true,
        absenceReason: "Resource has been deleted"
      };
    }
  };

  delete require.cache[schedulingPath];
  const { cancelAppointment } = require(schedulingPath);

  const first = await cancelAppointment({
    appointmentType: "interview",
    startTimeISO: ANTHONY_FIXTURE.startDateTime,
    googleCalendarEventId: ANTHONY_FIXTURE.calendarEventId,
    organizationId: ANTHONY_FIXTURE.organizationId
  });
  const second = await cancelAppointment({
    appointmentType: "interview",
    startTimeISO: ANTHONY_FIXTURE.startDateTime,
    googleCalendarEventId: ANTHONY_FIXTURE.calendarEventId,
    organizationId: ANTHONY_FIXTURE.organizationId
  });

  assert.equal(first.cancelled, true);
  assert.equal(second.cancelled, true);
  assert.equal(second.calendarAlreadyAbsent, true);
  assert.equal(deleteCalls, 2);

  const cancelled = await cancelDomain(
    {
      id: ANTHONY_FIXTURE.appointmentId,
      organizationId: ANTHONY_FIXTURE.organizationId,
      prospectId: "a257b152-43ea-401f-8de3-783b997013ff",
      prospectPhone: ANTHONY_FIXTURE.prospectPhone,
      agentId: "agent-1",
      purpose: "recruiting_interview",
      status: "scheduled",
      startDateTime: ANTHONY_FIXTURE.startDateTime,
      endDateTime: ANTHONY_FIXTURE.endDateTime,
      ownerRepId: "4TJLK",
      history: [],
      metadata: { ownerRepId: "4TJLK" }
    },
    { actor: "rollback", reason: "schedule_workflow_rollback" }
  );

  assert.equal(cancelled.status, "cancelled");

  require.cache[gcalPath].exports = originalGcal;
  delete require.cache[schedulingPath];
  require(schedulingPath);
});

test("BR-121 sync recreate path still treats 404 as missing (BR-050 preserved)", async () => {
  let created = 0;
  const result = await appointmentGoogleSyncEngine.syncAppointmentGoogleCalendar(
    {
      id: "appt-sync",
      organizationId: ANTHONY_FIXTURE.organizationId,
      prospectPhone: "+15550001111",
      startDateTime: "2026-08-07T17:51:00.000Z",
      endDateTime: "2026-08-07T18:21:00.000Z",
      timezone: "America/New_York",
      calendarEventId: "stale-event",
      metadata: { prospectName: "Sync" }
    },
    {
      deps: {
        getIntegrationStatus: async () => ({ connected: true, reconnectRequired: false }),
        updateCalendarEvent: async () => {
          throw googleError({ status: 404, message: "Not Found" });
        },
        createCalendarEvent: async () => {
          created += 1;
          return { id: "recreated" };
        }
      }
    }
  );

  assert.equal(created, 1);
  assert.equal(result.action, "created");
  assert.equal(result.calendarEventId, "recreated");
});

test("BR-121 normal cancel path still returns cancelled without calendarError", async () => {
  const gcalPath = require.resolve("../services/googleCalendarIntegrationService");
  const schedulingPath = require.resolve("../services/schedulingService");
  const originalGcal = require(gcalPath);

  require.cache[gcalPath].exports = {
    ...originalGcal,
    deleteCalendarEvent: async () => ({ deleted: true, alreadyAbsent: false })
  };

  delete require.cache[schedulingPath];
  const { cancelAppointment } = require(schedulingPath);

  const result = await cancelAppointment({
    appointmentType: "interview",
    startTimeISO: ANTHONY_FIXTURE.startDateTime,
    googleCalendarEventId: "live-event",
    organizationId: ANTHONY_FIXTURE.organizationId
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.calendarDeleted, true);
  assert.equal(result.calendarAlreadyAbsent, false);
  assert.equal(result.calendarError, null);

  require.cache[gcalPath].exports = originalGcal;
  delete require.cache[schedulingPath];
  require(schedulingPath);
});
