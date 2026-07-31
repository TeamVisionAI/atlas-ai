/**
 * Sprint 12.5.6 — Atomic scheduling, legacy repair, BR-039.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  buildScheduleExecutionResponse,
  rollbackScheduleBooking,
  rollbackPersistedAppointment
} = require("../application/missionExecutionApplicationService");
const {
  hasScheduledInterviewMetadata,
  isLegacyRepairCandidate,
  repairLegacyInterviewForProspect
} = require("../application/legacyInterviewRepairService");
const { appointmentToRow } = require("../core/appointmentReadModel");
const {
  resolvePersistedAppointmentId,
  isPersistedAppointment,
  isProspectDerivedAppointmentId
} = require("../core/appointmentListQuery");
const { buildInterviewBlock } = require("../core/prospectWorkspaceReadModel");

const MIGRATION_FILE = path.join(
  __dirname,
  "../database/migrations/019_atlas_appointments_baseline_repair.sql"
);

const SARAH_ORG = "00000000-0000-4000-8000-000000000001";
const SARAH_PHONE = "+17862509432";
const SARAH_CALENDAR_EVENT = "r8sf42vmjfpvaeg6isq04gfbmo";
const SARAH_START = "2026-07-31T21:00:00.000Z";

function buildSarahProspect(overrides = {}) {
  return {
    phone: SARAH_PHONE,
    name: "Sarah FB",
    organization_id: SARAH_ORG,
    current_step: "CONFIRMED",
    interview_time: SARAH_START,
    appointment_date: SARAH_START,
    calendar_event_id: SARAH_CALENDAR_EVENT,
    interview_type: "Zoom",
    owner_user_id: "00000000-0000-4000-8000-000000000002",
    notes: "EMAIL:salgadosarah24@gmail.com",
    ...overrides
  };
}

describe("Sprint 12.5.6 — schedule response invariant", () => {
  it("cannot return success without appointmentId", () => {
    assert.throws(
      () =>
        buildScheduleExecutionResponse({
          bookingResult: { googleCalendarEventId: "cal-1" },
          meetingUrl: null,
          appointmentRecord: null,
          advanceResult: {}
        }),
      /appointmentId is required/
    );
  });

  it("successful schedule response keeps appointmentId === appointment.id", () => {
    const response = buildScheduleExecutionResponse({
      bookingResult: { googleCalendarEventId: "cal-1", meetingUrl: "https://zoom.us/j/1" },
      meetingUrl: "https://zoom.us/j/1",
      appointmentRecord: { id: "11111111-1111-4111-8111-111111111111" },
      advanceResult: { workflow: {} }
    });

    assert.equal(response.success, true);
    assert.equal(response.appointmentId, response.appointment.id);
    assert.notEqual(response.appointmentId, response.calendarEventId);
  });
});

describe("Sprint 12.5.6 — missing agentId guard", () => {
  it("fails before calendar booking when agentId is missing", async () => {
    const schedulingService = require("../services/schedulingService");
    const meetingManagementService = require("../services/meetingManagementService");
    const supabaseService = require("../services/supabaseService");
    const missionExecutionPath = require.resolve("../application/missionExecutionApplicationService");

    const originalSchedule = schedulingService.scheduleAppointment;
    const originalLocation = meetingManagementService.resolveInterviewLocation;
    const originalFindProspect = supabaseService.findProspectInOrganization;
    let calendarCalled = false;

    schedulingService.scheduleAppointment = async () => {
      calendarCalled = true;
      throw new Error("calendar should not be called without agentId");
    };
    meetingManagementService.resolveInterviewLocation = async () => ({
      configured: true,
      location: "Office",
      meetingUrl: "https://zoom.us/j/test"
    });
    supabaseService.findProspectInOrganization = async () => buildSarahProspect();

    delete require.cache[missionExecutionPath];
    const { executeScheduleInterview: executeWithoutAgent } = require("../application/missionExecutionApplicationService");

    try {
      const result = await executeWithoutAgent(
        SARAH_PHONE,
        {
          dateKey: "2026-07-31",
          timeKey: "17:00",
          interviewType: "Zoom"
        },
        { organizationId: SARAH_ORG }
      );

      assert.equal(result.success, false);
      assert.equal(result.error, "APPOINTMENT_PERSISTENCE_FAILED");
      assert.equal(calendarCalled, false);
    } finally {
      schedulingService.scheduleAppointment = originalSchedule;
      meetingManagementService.resolveInterviewLocation = originalLocation;
      supabaseService.findProspectInOrganization = originalFindProspect;
      delete require.cache[missionExecutionPath];
      require("../application/missionExecutionApplicationService");
    }
  });
});

describe("Sprint 12.5.6 — rollback helpers", () => {
  it("exports rollback helpers for partial failure cleanup", () => {
    assert.equal(typeof rollbackScheduleBooking, "function");
    assert.equal(typeof rollbackPersistedAppointment, "function");
  });
});

describe("Sprint 12.5.6 — legacy repair eligibility", () => {
  it("identifies a legacy scheduled prospect", () => {
    assert.equal(hasScheduledInterviewMetadata(buildSarahProspect()), true);
  });

  it("skips prospects without scheduled metadata", () => {
    assert.equal(
      hasScheduledInterviewMetadata(buildSarahProspect({ interview_time: null, appointment_date: null })),
      false
    );
  });
});

describe("Sprint 12.5.6 — legacy repair execution", () => {
  it("dry-run reports would_repair without persisting", async () => {
    const appointmentListService = require("../services/appointmentListService");
    const originalFindActive = appointmentListService.findPersistedAppointmentForProspect;
    const originalList = appointmentListService.listPersistedAppointments;

    appointmentListService.findPersistedAppointmentForProspect = async () => null;
    appointmentListService.listPersistedAppointments = async () => ({ items: [], total: 0 });

    try {
      const outcome = await repairLegacyInterviewForProspect(buildSarahProspect(), {
        organizationId: SARAH_ORG,
        dryRun: true
      });

      assert.equal(outcome.status, "dry_run");
      assert.equal(outcome.reason, "would_repair");
      assert.equal(outcome.summary.calendarEventId, SARAH_CALENDAR_EVENT);
    } finally {
      appointmentListService.findPersistedAppointmentForProspect = originalFindActive;
      appointmentListService.listPersistedAppointments = originalList;
    }
  });

  it("creates exactly one persisted appointment and reuses calendarEventId", async () => {
    const appointmentListService = require("../services/appointmentListService");
    const appointmentApplicationService = require("../application/appointmentApplicationService");
    const appointmentRepository = require("../repositories/appointmentRepository");

    let createCount = 0;
    const createdId = "22222222-2222-4222-8222-222222222222";

    const originalFindActive = appointmentListService.findPersistedAppointmentForProspect;
    const originalList = appointmentListService.listPersistedAppointments;
    const originalCreate = appointmentApplicationService.createAppointment;
    const originalFindById = appointmentRepository.findById;

    appointmentListService.findPersistedAppointmentForProspect = async () => null;
    appointmentListService.listPersistedAppointments = async () => ({ items: [], total: 0 });
    appointmentApplicationService.createAppointment = async (input) => {
      createCount += 1;
      assert.equal(input.existingBooking.googleCalendarEventId, SARAH_CALENDAR_EVENT);
      assert.equal(input.skipWorkflowSideEffects, true);
      assert.equal(input.skipReminders, true);
      assert.equal(input.skipProspectUpdate, true);
      return {
        id: createdId,
        calendarEventId: SARAH_CALENDAR_EVENT,
        prospectPhone: SARAH_PHONE
      };
    };
    appointmentRepository.findById = async () => ({
      id: createdId,
      calendarEventId: SARAH_CALENDAR_EVENT,
      prospectPhone: SARAH_PHONE
    });

    try {
      const outcome = await repairLegacyInterviewForProspect(buildSarahProspect(), {
        organizationId: SARAH_ORG,
        dryRun: false
      });

      assert.equal(createCount, 1);
      assert.equal(outcome.status, "repaired");
      assert.equal(outcome.appointmentId, createdId);
      assert.equal(outcome.summary.calendarEventId, SARAH_CALENDAR_EVENT);
    } finally {
      appointmentListService.findPersistedAppointmentForProspect = originalFindActive;
      appointmentListService.listPersistedAppointments = originalList;
      appointmentApplicationService.createAppointment = originalCreate;
      appointmentRepository.findById = originalFindById;
    }
  });

  it("is idempotent when persisted appointment already exists", async () => {
    const appointmentListService = require("../services/appointmentListService");
    const existingId = "33333333-3333-4333-8333-333333333333";

    const originalFindActive = appointmentListService.findPersistedAppointmentForProspect;
    appointmentListService.findPersistedAppointmentForProspect = async () => ({
      id: existingId,
      prospectPhone: SARAH_PHONE,
      startDateTime: SARAH_START
    });

    try {
      const eligibility = await isLegacyRepairCandidate(buildSarahProspect(), SARAH_ORG);
      assert.equal(eligibility.candidate, false);
      assert.equal(eligibility.appointmentId, existingId);
    } finally {
      appointmentListService.findPersistedAppointmentForProspect = originalFindActive;
    }
  });
});

describe("Sprint 12.5.6 — operational identity surfaces", () => {
  it("Mission Control and Prospect Workspace expose the same persisted UUID", () => {
    const activeAppointment = {
      id: "44444444-4444-4444-8444-444444444444",
      startDateTime: SARAH_START,
      calendarEventId: SARAH_CALENDAR_EVENT,
      meetingType: "virtual"
    };
    const prospect = buildSarahProspect();

    const missionControlInterview = buildInterviewBlock(
      prospect,
      { outcome: null },
      { active: false },
      activeAppointment
    );
    const workspaceInterview = buildInterviewBlock(
      prospect,
      { outcome: null },
      { active: false },
      activeAppointment
    );

    assert.equal(missionControlInterview.appointmentId, activeAppointment.id);
    assert.equal(workspaceInterview.appointmentId, activeAppointment.id);
    assert.equal(missionControlInterview.appointmentId, workspaceInterview.appointmentId);
    assert.equal(missionControlInterview.calendarEventId, SARAH_CALENDAR_EVENT);
  });

  it("synthetic ids never reach operational APIs", () => {
    const syntheticId = `prospect-derived:${SARAH_PHONE}:1785531600000`;

    assert.equal(isProspectDerivedAppointmentId(syntheticId), true);
    assert.equal(
      resolvePersistedAppointmentId({
        id: syntheticId,
        prospectPhone: SARAH_PHONE,
        startDateTime: SARAH_START
      }),
      null
    );
    assert.equal(isPersistedAppointment({ id: syntheticId }), false);
  });
});

describe("Sprint 12.5.6 — Supabase schema mapping", () => {
  it("appointmentToRow fields are provisioned by migration 019", () => {
    const row = appointmentToRow({
      id: "55555555-5555-4555-8555-555555555555",
      organizationId: SARAH_ORG,
      prospectPhone: SARAH_PHONE,
      agentId: "00000000-0000-4000-8000-000000000002",
      purpose: "recruiting_interview",
      status: "confirmed",
      source: "mission_control",
      startDateTime: SARAH_START,
      endDateTime: "2026-07-31T21:30:00.000Z",
      durationMinutes: 30,
      timezone: "America/New_York",
      meetingType: "virtual",
      meetingProvider: "zoom",
      meetingLocationType: "virtual",
      meetingLocationName: null,
      meetingAddress: null,
      meetingNotes: null,
      virtualMeetingUrl: "https://zoom.us/j/test",
      calendarEventId: SARAH_CALENDAR_EVENT,
      calendarProvider: "google_calendar",
      confirmationStatus: "pending",
      emailInvitationStatus: "pending",
      reminderStatus: "pending",
      humanAssistRequired: false,
      humanAssistReason: null,
      rescheduleCount: 0,
      cancellationReason: null,
      outcome: null,
      outcomeNotes: null,
      ownerRepId: "4TJLK",
      history: [],
      metadata: { legacyRepair: true },
      createdBy: "00000000-0000-4000-8000-000000000002",
      createdAt: SARAH_START,
      updatedAt: SARAH_START
    });

    const sql = fs.readFileSync(MIGRATION_FILE, "utf8");

    Object.keys(row).forEach((column) => {
      assert.match(sql, new RegExp(column, "i"), `migration missing column ${column}`);
    });
  });
});
