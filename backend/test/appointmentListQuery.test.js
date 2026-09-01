/**
 * Appointment list query consistency tests.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveAppointmentViewFilters,
  buildProspectDerivedAppointment,
  matchesListFilters,
  isTomorrow,
  parseInterviewDatetime,
  parseProspectDerivedAppointmentId,
  isPersistedAppointment,
  resolvePersistedAppointmentId,
  selectActivePersistedAppointmentForProspect,
  isActiveAppointmentForList,
  isCompletedAppointmentForList,
  mergeUnifiedAppointmentList,
  ACTIVE_UPCOMING_STATUSES,
  SCHEDULED_VIEW_STATUSES
} = require("../core/appointmentListQuery");

describe("appointmentListQuery", () => {
  it("upcoming view includes scheduled lifecycle statuses but not pending or human assist", () => {
    const filters = resolveAppointmentViewFilters("upcoming");
    assert.deepEqual(filters.status, SCHEDULED_VIEW_STATUSES);
    assert.ok(filters.status.includes("in_progress"));
    assert.ok(filters.status.includes("rescheduled"));
    assert.equal(filters.status.includes("pending_confirmation"), false);
    assert.equal(filters.status.includes("human_assist_required"), false);
    assert.ok(filters.from);
    assert.equal(filters.to, undefined);
  });

  it("derives tomorrow interview from prospect appointment_date", () => {
    const reference = new Date("2026-07-23T15:00:00");
    const tomorrow = new Date("2026-07-24T14:00:00");

    const prospect = {
      phone: "+15551234567",
      name: "Alex Prospect",
      owner_user_id: "agent-1",
      appointment_date: tomorrow.toISOString(),
      interview_time: tomorrow.toISOString(),
      current_step: "CONFIRMED",
      interview_type: "Zoom"
    };

    const derived = buildProspectDerivedAppointment(prospect, "org-1", reference);
    assert.ok(derived);
    assert.equal(derived.prospectPhone, prospect.phone);
    assert.equal(derived.status, "confirmed");

    const upcomingFilters = {
      organizationId: "org-1",
      agentId: "agent-1",
      ...resolveAppointmentViewFilters("upcoming", reference)
    };

    assert.equal(matchesListFilters(derived, upcomingFilters, reference), true);
    assert.equal(isTomorrow(parseInterviewDatetime(prospect), reference), true);
  });

  it("excludes past interviews from upcoming view", () => {
    const reference = new Date("2026-07-23T15:00:00");
    const yesterday = new Date("2026-07-22T10:00:00");

    const prospect = {
      phone: "+15559876543",
      owner_user_id: "agent-1",
      appointment_date: yesterday.toISOString(),
      current_step: "CONFIRMED"
    };

    const derived = buildProspectDerivedAppointment(prospect, "org-1", reference);
    const upcomingFilters = {
      organizationId: "org-1",
      agentId: "agent-1",
      ...resolveAppointmentViewFilters("upcoming", reference)
    };

    assert.equal(matchesListFilters(derived, upcomingFilters, reference), false);
  });

  it("includes unassigned prospect interviews for requesting agent", () => {
    const reference = new Date("2026-07-23T15:00:00");
    const tomorrow = new Date("2026-07-24T14:00:00");

    const prospect = {
      phone: "+15550001111",
      name: "Unassigned Prospect",
      appointment_date: tomorrow.toISOString(),
      current_step: "CONFIRMED",
      interview_type: "Zoom"
    };

    const derived = buildProspectDerivedAppointment(prospect, "org-1", reference);
    const upcomingFilters = {
      organizationId: "org-1",
      agentId: "agent-1",
      ...resolveAppointmentViewFilters("upcoming", reference)
    };

    assert.equal(derived.agentId, null);
    assert.equal(matchesListFilters(derived, upcomingFilters, reference), true);
  });

  it("detects missing atlas_appointments table probe errors", () => {
    const { isMissingTableError } = require("../core/supabaseTableErrors");

    assert.equal(
      isMissingTableError({
        message: "Could not find the table 'public.atlas_appointments' in the schema cache"
      }),
      true
    );
    assert.equal(isMissingTableError({ code: "PGRST116" }), true);
    assert.equal(isMissingTableError({ message: "connection timeout" }), false);
  });

  it("parses prospect-derived appointment ids", () => {
    const parsed = parseProspectDerivedAppointmentId(
      "prospect-derived:+13216891236:1785439800000"
    );

    assert.deepEqual(parsed, {
      phone: "+13216891236",
      timestampMs: 1785439800000
    });
    assert.equal(parseProspectDerivedAppointmentId("appt-1"), null);
  });

  it("isPersistedAppointment rejects prospect-derived ids", () => {
    assert.equal(
      isPersistedAppointment({
        id: "prospect-derived:+15551234567:1785439800000",
        status: "scheduled"
      }),
      false
    );
    assert.equal(
      isPersistedAppointment({
        id: "appt-123",
        status: "scheduled"
      }),
      true
    );
    assert.equal(
      resolvePersistedAppointmentId({
        id: "prospect-derived:+15551234567:1785439800000"
      }),
      null
    );
    assert.equal(
      resolvePersistedAppointmentId({
        id: "appt-789"
      }),
      "appt-789"
    );
    assert.equal(resolvePersistedAppointmentId(null), null);
    assert.equal(resolvePersistedAppointmentId(undefined), null);
  });

  it("isPersistedAppointment accepts UUID appointments regardless of derivedFromProspect metadata", () => {
    assert.equal(
      isPersistedAppointment({
        id: "e93a937b-5e9e-4349-ae3b-25ab962b0e96",
        status: "completed",
        metadata: { derivedFromProspect: true }
      }),
      true
    );
    assert.equal(
      isPersistedAppointment({
        id: "e93a937b-5e9e-4349-ae3b-25ab962b0e96",
        derivedFromProspect: true,
        status: "completed"
      }),
      true
    );
    assert.equal(
      resolvePersistedAppointmentId({
        id: "e93a937b-5e9e-4349-ae3b-25ab962b0e96",
        metadata: { derivedFromProspect: true }
      }),
      "e93a937b-5e9e-4349-ae3b-25ab962b0e96"
    );
  });

  it("selectActivePersistedAppointmentForProspect uses list-active rules", () => {
    const now = Date.now();
    const selected = selectActivePersistedAppointmentForProspect([
      {
        id: "appt-upcoming",
        status: "confirmed",
        startDateTime: new Date(now + 60 * 60_000).toISOString()
      }
    ]);

    assert.equal(selected.id, "appt-upcoming");
  });

  it("selectActivePersistedAppointmentForProspect prefers latest rescheduled upcoming appointment", () => {
    const now = Date.now();

    const selected = selectActivePersistedAppointmentForProspect([
      {
        id: "appt-old",
        status: "scheduled",
        startDateTime: new Date(now + 60 * 60_000).toISOString(),
        updatedAt: "2026-08-01T11:00:00.000Z"
      },
      {
        id: "appt-rescheduled",
        status: "rescheduled",
        metadata: { lifecycleState: "rescheduled" },
        startDateTime: new Date(now + 4 * 60 * 60_000).toISOString(),
        updatedAt: "2026-08-01T16:00:00.000Z"
      }
    ]);

    assert.equal(selected.id, "appt-rescheduled");
  });

  it("today view includes only scheduled lifecycle statuses", () => {
    const reference = new Date("2026-07-30T12:00:00");
    const todayFilters = {
      organizationId: "org-1",
      agentId: "agent-1",
      ...resolveAppointmentViewFilters("today", reference)
    };

    assert.deepEqual(todayFilters.status, SCHEDULED_VIEW_STATUSES);

    const activeAppointment = {
      organizationId: "org-1",
      agentId: "agent-1",
      status: "scheduled",
      startDateTime: "2026-07-30T15:00:00.000Z"
    };

    assert.equal(matchesListFilters(activeAppointment, todayFilters, reference), true);
    assert.equal(isActiveAppointmentForList(activeAppointment), true);
    assert.equal(
      matchesListFilters(
        {
          ...activeAppointment,
          status: "completed",
          metadata: { lifecycleState: "completed" }
        },
        todayFilters,
        reference
      ),
      false
    );
    assert.equal(
      isActiveAppointmentForList({
        ...activeAppointment,
        status: "completed",
        metadata: { lifecycleState: "recruited" }
      }),
      false
    );
  });

  it("FOLLOW_UP_NEEDED outcome is completed, not today's unresolved list", () => {
    const reference = new Date("2026-07-30T12:00:00");
    const todayFilters = {
      organizationId: "org-1",
      agentId: "agent-1",
      ...resolveAppointmentViewFilters("today", reference)
    };
    const completedFilters = {
      organizationId: "org-1",
      ...resolveAppointmentViewFilters("completed")
    };
    const followUp = {
      organizationId: "org-1",
      agentId: "agent-1",
      status: "scheduled",
      outcome: "follow_up",
      startDateTime: "2026-07-30T15:00:00.000Z",
      metadata: { lifecycleState: "scheduled", standaloneAgenda: true }
    };

    assert.equal(matchesListFilters(followUp, todayFilters, reference), false);
    assert.equal(isActiveAppointmentForList(followUp), false);
    assert.equal(matchesListFilters(followUp, completedFilters), true);
    assert.equal(isCompletedAppointmentForList(followUp), true);
  });

  it("completed view includes recruited and became_client lifecycle outcomes", () => {
    const completedFilters = {
      organizationId: "org-1",
      ...resolveAppointmentViewFilters("completed")
    };

    const recruited = {
      organizationId: "org-1",
      status: "completed",
      outcome: "recruited",
      metadata: { lifecycleState: "recruited" },
      startDateTime: "2026-07-30T15:00:00.000Z"
    };

    assert.equal(matchesListFilters(recruited, completedFilters), true);
    assert.equal(isCompletedAppointmentForList(recruited), true);
  });

  it("view tabs exclude appointments from other lifecycle states", () => {
    const reference = new Date("2026-07-30T12:00:00");
    const base = {
      organizationId: "org-1",
      agentId: "agent-1",
      startDateTime: "2026-07-30T15:00:00.000Z"
    };

    const todayFilters = {
      ...resolveAppointmentViewFilters("today", reference),
      organizationId: "org-1",
      agentId: "agent-1"
    };
    const pendingFilters = {
      ...resolveAppointmentViewFilters("pending_confirmation"),
      organizationId: "org-1",
      agentId: "agent-1"
    };
    const completedFilters = {
      ...resolveAppointmentViewFilters("completed"),
      organizationId: "org-1",
      agentId: "agent-1"
    };
    const cancelledFilters = {
      ...resolveAppointmentViewFilters("cancelled"),
      organizationId: "org-1",
      agentId: "agent-1"
    };

    const pending = { ...base, status: "pending_confirmation" };
    const completed = {
      ...base,
      status: "completed",
      metadata: { lifecycleState: "completed" }
    };
    const cancelled = {
      ...base,
      status: "cancelled",
      metadata: { lifecycleState: "cancelled" }
    };

    assert.equal(matchesListFilters(pending, todayFilters, reference), false);
    assert.equal(matchesListFilters(pending, pendingFilters, reference), true);
    assert.equal(matchesListFilters(completed, todayFilters, reference), false);
    assert.equal(matchesListFilters(completed, completedFilters, reference), true);
    assert.equal(matchesListFilters(completed, cancelledFilters, reference), false);
    assert.equal(matchesListFilters(cancelled, cancelledFilters, reference), true);
    assert.equal(matchesListFilters(cancelled, completedFilters, reference), false);
  });

  it("suppresses stale prospect-derived rows when a persisted appointment exists", () => {
    const derived = {
      id: "prospect-derived:+15551234567:1785439800000",
      prospectPhone: "+15551234567",
      startDateTime: "2026-07-30T15:00:00.000Z",
      status: "scheduled"
    };
    const persistedCompleted = {
      id: "appt-1",
      prospectPhone: "+15551234567",
      startDateTime: "2026-07-30T15:00:00.000Z",
      status: "completed",
      metadata: { lifecycleState: "completed" }
    };

    const merged = mergeUnifiedAppointmentList(
      [],
      [derived],
      new Set([`${persistedCompleted.prospectPhone}:${persistedCompleted.startDateTime}`])
    );

    assert.equal(merged.length, 0);
  });
});
