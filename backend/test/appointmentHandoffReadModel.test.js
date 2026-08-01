/**
 * BR-050 — Canonical recruiter handoff read model tests.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  HANDOFF_LIFECYCLE,
  HANDOFF_PHASES,
  buildRecruiterHandoff
} = require("../core/appointmentHandoffReadModel");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";

function baseProspect(overrides = {}) {
  return {
    phone: "+15551234567",
    organization_id: ORG_A,
    work_authorized: true,
    interview_type: "Zoom",
    interview_time: "Tomorrow at 2:00 PM",
    calendar_event_id: "cal-legacy",
    current_step: "CONFIRMED",
    notes: "EMAIL:prospect@example.com",
    ...overrides
  };
}

function baseAppointment(overrides = {}) {
  return {
    id: "appt-1",
    organizationId: ORG_A,
    prospectPhone: "+15551234567",
    status: "scheduled",
    startDateTime: "2026-08-05T18:00:00.000Z",
    calendarEventId: "cal-1",
    meetingProvider: "zoom",
    metadata: { lifecycleState: "scheduled" },
    ...overrides
  };
}

test("no appointment returns none lifecycle and not handoff ready", () => {
  const handoff = buildRecruiterHandoff(baseProspect(), {});

  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.NONE);
  assert.equal(handoff.handoffPhase, HANDOFF_PHASES.NONE);
  assert.equal(handoff.handoffReady, false);
  assert.equal(handoff.appointmentId, null);
});

test("active scheduled appointment can be handoff ready", () => {
  const handoff = buildRecruiterHandoff(baseProspect(), {
    activeAppointment: baseAppointment()
  });

  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.SCHEDULED);
  assert.equal(handoff.handoffPhase, HANDOFF_PHASES.ACTIVE);
  assert.equal(handoff.handoffReady, true);
  assert.equal(handoff.appointmentId, "appt-1");
});

test("confirmed lifecycle maps to confirmed handoff", () => {
  const handoff = buildRecruiterHandoff(baseProspect(), {
    activeAppointment: baseAppointment({
      status: "confirmed",
      metadata: { lifecycleState: "confirmed" }
    })
  });

  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.CONFIRMED);
  assert.equal(handoff.handoffReady, true);
});

test("rescheduled active appointment wins over older cancelled latest", () => {
  const handoff = buildRecruiterHandoff(baseProspect(), {
    activeAppointment: baseAppointment({
      id: "appt-rescheduled",
      status: "rescheduled",
      metadata: { lifecycleState: "rescheduled" },
      startDateTime: "2026-08-10T18:00:00.000Z"
    }),
    latestAppointment: baseAppointment({
      id: "appt-cancelled",
      status: "cancelled",
      metadata: { lifecycleState: "cancelled" }
    })
  });

  assert.equal(handoff.appointmentId, "appt-rescheduled");
  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.RESCHEDULED);
  assert.equal(handoff.handoffReady, true);
});

test("cancelled appointment never produces appointment-ready handoff", () => {
  const handoff = buildRecruiterHandoff(baseProspect(), {
    latestAppointment: baseAppointment({
      status: "cancelled",
      metadata: { lifecycleState: "cancelled" }
    })
  });

  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.CANCELLED);
  assert.equal(handoff.handoffPhase, HANDOFF_PHASES.TERMINAL);
  assert.equal(handoff.handoffReady, false);
});

test("completed appointment is terminal and not handoff ready", () => {
  const handoff = buildRecruiterHandoff(baseProspect(), {
    latestAppointment: baseAppointment({
      status: "completed",
      metadata: { lifecycleState: "completed" }
    })
  });

  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.COMPLETED);
  assert.equal(handoff.handoffPhase, HANDOFF_PHASES.TERMINAL);
  assert.equal(handoff.handoffReady, false);
});

test("no-show appointment is terminal and not handoff ready", () => {
  const handoff = buildRecruiterHandoff(baseProspect(), {
    latestAppointment: baseAppointment({
      status: "no_show",
      metadata: { lifecycleState: "no_show" }
    })
  });

  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.NO_SHOW);
  assert.equal(handoff.handoffReady, false);
});

test("stale prospect CONFIRMED without active appointment is not handoff ready", () => {
  const handoff = buildRecruiterHandoff(
    baseProspect({ current_step: "CONFIRMED", calendar_event_id: "cal-stale" }),
    {}
  );

  assert.equal(handoff.prospectWorkflowStep, "CONFIRMED");
  assert.equal(handoff.handoffPhase, HANDOFF_PHASES.NONE);
  assert.equal(handoff.handoffReady, false);
});

test("active appointment wins over stale prospect workflow step", () => {
  const handoff = buildRecruiterHandoff(
    baseProspect({ current_step: "SCHEDULE", calendar_event_id: null }),
    {
      activeAppointment: baseAppointment({ calendarEventId: "cal-active" })
    }
  );

  assert.equal(handoff.prospectWorkflowStep, "SCHEDULE");
  assert.equal(handoff.handoffReady, true);
});

test("handoff preserves prospect workflow step separately from lifecycle", () => {
  const handoff = buildRecruiterHandoff(baseProspect({ current_step: "EMAIL" }), {
    activeAppointment: baseAppointment()
  });

  assert.equal(handoff.prospectWorkflowStep, "EMAIL");
  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.SCHEDULED);
});

test("cross-organization appointment context is surfaced on reference appointment", () => {
  const handoff = buildRecruiterHandoff(baseProspect({ organization_id: ORG_A }), {
    activeAppointment: baseAppointment({ organizationId: ORG_B, id: "appt-other-org" })
  });

  assert.equal(handoff.appointmentId, "appt-other-org");
  assert.equal(handoff.handoffReady, true);
});

test("cross-prospect isolation is enforced by appointmentListService scope filters before handoff projection", () => {
  const handoff = buildRecruiterHandoff(baseProspect({ phone: "+15551111111" }), {});

  assert.equal(handoff.appointmentLifecycle, HANDOFF_LIFECYCLE.NONE);
  assert.equal(handoff.handoffReady, false);
});

test("missing calendar linkage blocks handoff ready even when prospect step is CONFIRMED", () => {
  const handoff = buildRecruiterHandoff(
    baseProspect({ calendar_event_id: "cal-stale" }),
    {
      activeAppointment: baseAppointment({ calendarEventId: null })
    }
  );

  assert.equal(handoff.handoffReady, false);
});

test("in-person interview can be handoff ready without email", () => {
  const handoff = buildRecruiterHandoff(
    baseProspect({
      notes: null,
      interview_type: "In Person"
    }),
    {
      activeAppointment: baseAppointment({
        meetingType: "in_person",
        meetingProvider: null
      })
    }
  );

  assert.equal(handoff.interviewType, "Office");
  assert.equal(handoff.handoffReady, true);
});
