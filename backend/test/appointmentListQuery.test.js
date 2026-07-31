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
  ACTIVE_UPCOMING_STATUSES
} = require("../core/appointmentListQuery");

describe("appointmentListQuery", () => {
  it("upcoming view includes active in-progress and human assist statuses", () => {
    const filters = resolveAppointmentViewFilters("upcoming");
    assert.ok(filters.status.includes("in_progress"));
    assert.ok(filters.status.includes("human_assist_required"));
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

  it("today view includes only active appointment statuses", () => {
    const reference = new Date("2026-07-30T12:00:00");
    const todayFilters = {
      organizationId: "org-1",
      agentId: "agent-1",
      ...resolveAppointmentViewFilters("today", reference)
    };

    assert.deepEqual(todayFilters.status, ACTIVE_UPCOMING_STATUSES);

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
