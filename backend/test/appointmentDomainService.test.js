const test = require("node:test");
const assert = require("node:assert/strict");
const {
  APPOINTMENT_LIFECYCLE_STATES,
  canTransitionLifecycle,
  resolveLifecycleState
} = require("../modules/appointments/domain/constants");
const {
  buildAppointmentOwnership,
  assertOwnershipFields
} = require("../modules/appointments/domain/AppointmentOwnership");
const {
  scheduleAppointment,
  confirmAppointment,
  rescheduleAppointment,
  completeAppointment,
  markNoShow,
  cancelAppointment,
  recruitFromAppointment,
  createClientFromAppointment,
  applyLifecycleTransition
} = require("../modules/appointments/application/appointmentDomainService");
const { LIFECYCLE_EVENT_MAP } = require("../modules/appointments/application/appointmentEventAdapter");
const { APPOINTMENT_EVENTS } = require("../modules/business-events/domain/EventTypes");

function baseAppointment(overrides = {}) {
  return {
    id: "appt-1",
    organizationId: "org-1",
    prospectId: "prospect-1",
    prospectPhone: "+15555550100",
    agentId: "agent-1",
    purpose: "recruiting_interview",
    status: "scheduled",
    startDateTime: "2026-08-01T15:00:00.000Z",
    endDateTime: "2026-08-01T15:30:00.000Z",
    ownerRepId: "4TJLK",
    history: [],
    metadata: { ownerRepId: "4TJLK" },
    ...overrides
  };
}

test("appointment lifecycle defines required Sprint 12.2 states", () => {
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.SCHEDULED, "scheduled");
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.CONFIRMED, "confirmed");
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.RESCHEDULED, "rescheduled");
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.COMPLETED, "completed");
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.NO_SHOW, "no_show");
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.CANCELLED, "cancelled");
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.RECRUITED, "recruited");
  assert.equal(APPOINTMENT_LIFECYCLE_STATES.BECAME_CLIENT, "became_client");
});

test("ownership contract requires prospect, organization, type, and scheduled time", () => {
  const ownership = assertOwnershipFields({
    prospectPhone: "+15555550100",
    organizationId: "org-1",
    appointmentType: "recruiting_interview",
    scheduledTime: "2026-08-01T15:00:00.000Z",
    ownerRepId: "4XHKH"
  });

  assert.equal(ownership.ownerRepId, "4XHKH");
  assert.equal(ownership.currentState, APPOINTMENT_LIFECYCLE_STATES.SCHEDULED);
});

test("scheduleAppointment initializes scheduled lifecycle state", () => {
  const result = scheduleAppointment(
    baseAppointment({ status: undefined, history: [] }),
    { actor: "agent-1" }
  );

  assert.equal(result.appointment.status, "scheduled");
  assert.equal(result.transition.currentState, APPOINTMENT_LIFECYCLE_STATES.SCHEDULED);
  assert.equal(result.appointment.metadata.lifecycleState, APPOINTMENT_LIFECYCLE_STATES.SCHEDULED);
});

test("confirmAppointment transitions scheduled to confirmed", async () => {
  const updated = await confirmAppointment(baseAppointment(), { actor: "agent-1" });

  assert.equal(updated.status, "confirmed");
  assert.equal(resolveLifecycleState(updated), APPOINTMENT_LIFECYCLE_STATES.CONFIRMED);
});

test("rescheduleAppointment transitions to rescheduled and increments count", async () => {
  const updated = await rescheduleAppointment(baseAppointment({ status: "confirmed" }), {
    actor: "agent-1",
    scheduledTime: "2026-08-02T15:00:00.000Z",
    endDateTime: "2026-08-02T15:30:00.000Z"
  });

  assert.equal(updated.status, "rescheduled");
  assert.equal(updated.rescheduleCount, 1);
  assert.equal(updated.startDateTime, "2026-08-02T15:00:00.000Z");
});

test("complete, no-show, cancel, recruit, and client transitions map correctly", async () => {
  const confirmed = baseAppointment({ status: "confirmed" });

  const completed = await completeAppointment(confirmed, { actor: "agent-1" });
  assert.equal(completed.status, "completed");

  const noShow = await markNoShow(confirmed, { actor: "agent-1" });
  assert.equal(noShow.status, "no_show");
  assert.equal(noShow.outcome, "no_show");

  const cancelled = await cancelAppointment(confirmed, { actor: "agent-1", reason: "conflict" });
  assert.equal(cancelled.status, "cancelled");

  const recruited = await recruitFromAppointment(confirmed, { actor: "agent-1" });
  assert.equal(recruited.outcome, "recruited");
  assert.equal(resolveLifecycleState(recruited), APPOINTMENT_LIFECYCLE_STATES.RECRUITED);

  const client = await createClientFromAppointment(confirmed, { actor: "agent-1" });
  assert.equal(client.outcome, "client");
  assert.equal(resolveLifecycleState(client), APPOINTMENT_LIFECYCLE_STATES.BECAME_CLIENT);
});

test("invalid lifecycle transitions are rejected", () => {
  assert.throws(
    () =>
      applyLifecycleTransition(
        baseAppointment({ status: "cancelled", metadata: { lifecycleState: "cancelled" } }),
        APPOINTMENT_LIFECYCLE_STATES.CONFIRMED,
        { actor: "agent-1" }
      ),
    (error) => error.code === "TERMINAL_STATE"
  );

  assert.equal(canTransitionLifecycle("cancelled", "completed"), false);
  assert.equal(canTransitionLifecycle("completed", "confirmed"), false);
});

test("every lifecycle transition has a business event mapping", () => {
  assert.equal(LIFECYCLE_EVENT_MAP[APPOINTMENT_LIFECYCLE_STATES.CONFIRMED], APPOINTMENT_EVENTS.APPOINTMENT_CONFIRMED);
  assert.equal(LIFECYCLE_EVENT_MAP[APPOINTMENT_LIFECYCLE_STATES.NO_SHOW], APPOINTMENT_EVENTS.APPOINTMENT_NO_SHOW);
  assert.equal(LIFECYCLE_EVENT_MAP[APPOINTMENT_LIFECYCLE_STATES.RECRUITED], APPOINTMENT_EVENTS.APPOINTMENT_RECRUITED);
  assert.equal(
    LIFECYCLE_EVENT_MAP[APPOINTMENT_LIFECYCLE_STATES.BECAME_CLIENT],
    APPOINTMENT_EVENTS.APPOINTMENT_BECAME_CLIENT
  );
});

test("buildAppointmentOwnership exposes required ownership fields", () => {
  const ownership = buildAppointmentOwnership(baseAppointment());

  assert.equal(ownership.prospectPhone, "+15555550100");
  assert.equal(ownership.ownerRepId, "4TJLK");
  assert.equal(ownership.organizationId, "org-1");
  assert.equal(ownership.appointmentType, "recruiting_interview");
  assert.equal(ownership.scheduledTime, "2026-08-01T15:00:00.000Z");
  assert.equal(ownership.currentState, APPOINTMENT_LIFECYCLE_STATES.SCHEDULED);
});

test("completeAppointment transitions scheduled appointments with follow_up outcome", async () => {
  const updated = await completeAppointment(baseAppointment({ status: "scheduled" }), {
    actor: "agent-1",
    outcome: "follow_up"
  });

  assert.equal(updated.status, "completed");
  assert.equal(updated.outcome, "follow_up");
  assert.equal(resolveLifecycleState(updated), APPOINTMENT_LIFECYCLE_STATES.COMPLETED);
});

test("completeAppointment transitions rescheduled appointments", async () => {
  const updated = await completeAppointment(baseAppointment({ status: "rescheduled" }), {
    actor: "agent-1",
    outcome: "follow_up"
  });

  assert.equal(updated.status, "completed");
  assert.equal(resolveLifecycleState(updated), APPOINTMENT_LIFECYCLE_STATES.COMPLETED);
});

test("buildAppointmentOwnership falls back to metadata when column field is absent", () => {
  const ownership = buildAppointmentOwnership({
    ...baseAppointment(),
    ownerRepId: null,
    metadata: { ownerRepId: "4XHKH" }
  });

  assert.equal(ownership.ownerRepId, "4XHKH");
});
