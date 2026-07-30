const test = require("node:test");
const assert = require("node:assert/strict");
const { coerceAppointmentItems } = require("../core/appointmentCollection");
const {
  rowToAppointment,
  appointmentToRow,
  resolveOwnerRepIdFromRow,
  resolveOwnerRepIdFromAppointment
} = require("../core/appointmentReadModel");

test("coerceAppointmentItems returns arrays unchanged", () => {
  const rows = [{ id: "a1" }, { id: "a2" }];
  assert.deepEqual(coerceAppointmentItems(rows), rows);
});

test("coerceAppointmentItems extracts items from paginated search results", () => {
  const rows = [{ id: "a1" }];
  assert.deepEqual(coerceAppointmentItems({ items: rows, total: 1 }), rows);
});

test("coerceAppointmentItems supports alternate collection keys", () => {
  assert.deepEqual(coerceAppointmentItems({ list: [{ id: "l1" }] }), [{ id: "l1" }]);
  assert.deepEqual(coerceAppointmentItems({ upcoming: [{ id: "u1" }] }), [{ id: "u1" }]);
});

test("coerceAppointmentItems degrades malformed results to an empty array", () => {
  assert.deepEqual(coerceAppointmentItems(null), []);
  assert.deepEqual(coerceAppointmentItems(undefined), []);
  assert.deepEqual(coerceAppointmentItems({}), []);
  assert.deepEqual(coerceAppointmentItems({ items: null }), []);
});

test("rowToAppointment prefers owner_rep_id column over metadata", () => {
  const appointment = rowToAppointment({
    id: "appt-1",
    organization_id: "org-1",
    prospect_phone: "+15555550100",
    agent_id: "agent-1",
    purpose: "recruiting_interview",
    status: "scheduled",
    source: "atlas_ai",
    start_date_time: "2026-08-01T15:00:00.000Z",
    end_date_time: "2026-08-01T15:30:00.000Z",
    duration_minutes: 30,
    timezone: "America/New_York",
    meeting_type: "virtual",
    confirmation_status: "pending",
    email_invitation_status: "pending",
    reminder_status: "pending",
    human_assist_required: false,
    reschedule_count: 0,
    owner_rep_id: "4TJLK",
    metadata: { ownerRepId: "4XHKH" },
    history: [],
    created_at: "2026-08-01T14:00:00.000Z",
    updated_at: "2026-08-01T14:00:00.000Z"
  });

  assert.equal(appointment.ownerRepId, "4TJLK");
});

test("rowToAppointment falls back to metadata ownerRepId when column is absent", () => {
  const appointment = rowToAppointment({
    id: "appt-legacy",
    organization_id: "org-1",
    prospect_phone: "+15555550100",
    agent_id: "agent-1",
    purpose: "recruiting_interview",
    status: "scheduled",
    source: "atlas_ai",
    start_date_time: "2026-08-01T15:00:00.000Z",
    end_date_time: "2026-08-01T15:30:00.000Z",
    duration_minutes: 30,
    timezone: "America/New_York",
    meeting_type: "virtual",
    confirmation_status: "pending",
    email_invitation_status: "pending",
    reminder_status: "pending",
    human_assist_required: false,
    reschedule_count: 0,
    metadata: { ownerRepId: "4XHKH" },
    history: [],
    created_at: "2026-08-01T14:00:00.000Z",
    updated_at: "2026-08-01T14:00:00.000Z"
  });

  assert.equal(appointment.ownerRepId, "4XHKH");
});

test("appointmentToRow dual-writes owner_rep_id column and metadata ownerRepId", () => {
  const row = appointmentToRow({
    id: "appt-1",
    organizationId: "org-1",
    prospectPhone: "+15555550100",
    agentId: "agent-1",
    purpose: "recruiting_interview",
    status: "scheduled",
    source: "atlas_ai",
    startDateTime: "2026-08-01T15:00:00.000Z",
    endDateTime: "2026-08-01T15:30:00.000Z",
    durationMinutes: 30,
    timezone: "America/New_York",
    meetingType: "virtual",
    confirmationStatus: "pending",
    emailInvitationStatus: "pending",
    reminderStatus: "pending",
    humanAssistRequired: false,
    rescheduleCount: 0,
    ownerRepId: "4TJLK",
    metadata: { prospectName: "Alex" },
    history: [],
    createdAt: "2026-08-01T14:00:00.000Z",
    updatedAt: "2026-08-01T14:00:00.000Z"
  });

  assert.equal(row.owner_rep_id, "4TJLK");
  assert.equal(row.metadata.ownerRepId, "4TJLK");
  assert.equal(row.metadata.prospectName, "Alex");
});

test("resolveOwnerRepId helpers prefer column and top-level appointment fields", () => {
  assert.equal(
    resolveOwnerRepIdFromRow({ owner_rep_id: "4TJLK", metadata: { ownerRepId: "4XHKH" } }),
    "4TJLK"
  );
  assert.equal(
    resolveOwnerRepIdFromAppointment({ ownerRepId: "4TJLK", metadata: { ownerRepId: "4XHKH" } }),
    "4TJLK"
  );
  assert.equal(resolveOwnerRepIdFromRow({ metadata: { owner_rep_id: "4ABCD" } }), "4ABCD");
});
