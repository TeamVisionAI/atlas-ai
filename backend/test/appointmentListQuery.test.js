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
  parseInterviewDatetime
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
});
