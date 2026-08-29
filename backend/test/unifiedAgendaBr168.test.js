const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  rowToAppointment,
  appointmentToRow
} = require("../core/appointmentReadModel");
const {
  APPOINTMENT_PURPOSES
} = require("../core/configuration/appointmentDomain");

const migrationPath = path.join(
  __dirname,
  "../database/migrations/057_unified_agenda_contacts.sql"
);

function standaloneAppointment(overrides = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    organizationId: "20000000-0000-4000-8000-000000000001",
    prospectId: null,
    prospectPhone: null,
    agendaContactId: "30000000-0000-4000-8000-000000000001",
    agentId: "40000000-0000-4000-8000-000000000001",
    purpose: APPOINTMENT_PURPOSES.TRAINING,
    status: "scheduled",
    source: "agent_manual",
    startDateTime: "2026-08-29T14:00:00.000Z",
    endDateTime: "2026-08-29T14:30:00.000Z",
    durationMinutes: 30,
    timezone: "America/New_York",
    meetingType: "virtual",
    metadata: {
      standaloneAgenda: true,
      noRecruitAi: true,
      agendaContactName: "Warm Market Person",
      agendaContactPhone: "+13055550123",
      lifecycleState: "scheduled"
    },
    ...overrides
  };
}

test("BR-168 standalone appointment persists Agenda identity without prospect identity", () => {
  const row = appointmentToRow(standaloneAppointment());

  assert.equal(row.agenda_contact_id, "30000000-0000-4000-8000-000000000001");
  assert.equal(row.prospect_id, null);
  assert.equal(row.prospect_phone, null);
  assert.equal(row.metadata.standaloneAgenda, true);
  assert.equal(row.metadata.noRecruitAi, true);
  assert.equal(row.metadata.agendaContactPhone, "+13055550123");
});

test("BR-168 persisted standalone appointment hydrates Agenda link and nullable prospect phone", () => {
  const appointment = rowToAppointment({
    id: "10000000-0000-4000-8000-000000000001",
    organization_id: "20000000-0000-4000-8000-000000000001",
    prospect_id: null,
    prospect_phone: null,
    agenda_contact_id: "30000000-0000-4000-8000-000000000001",
    agent_id: "40000000-0000-4000-8000-000000000001",
    purpose: "training",
    status: "scheduled",
    source: "agent_manual",
    start_date_time: "2026-08-29T14:00:00.000Z",
    end_date_time: "2026-08-29T14:30:00.000Z",
    duration_minutes: 30,
    timezone: "America/New_York",
    meeting_type: "virtual",
    metadata: { standaloneAgenda: true, noRecruitAi: true }
  });

  assert.equal(appointment.agendaContactId, "30000000-0000-4000-8000-000000000001");
  assert.equal(appointment.prospectId, null);
  assert.equal(appointment.prospectPhone, null);
  assert.equal(appointment.metadata.standaloneAgenda, true);
});

test("BR-168 migration creates backend-only Agenda contacts and removes prospect-phone requirement", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS atlas_agenda_contacts/i);
  assert.match(sql, /owner_user_id UUID NOT NULL/i);
  assert.match(sql, /ALTER TABLE atlas_agenda_contacts ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE atlas_agenda_contacts FROM anon, authenticated/i);
  assert.match(sql, /GRANT ALL ON TABLE atlas_agenda_contacts TO service_role/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS agenda_contact_id UUID/i);
  assert.match(sql, /ALTER COLUMN prospect_phone DROP NOT NULL/i);
});

test("BR-168 uses existing non-recruiting appointment purposes", () => {
  assert.equal(APPOINTMENT_PURPOSES.TRAINING, "training");
  assert.equal(APPOINTMENT_PURPOSES.CLIENT_SERVICE, "client_service");
  assert.equal(APPOINTMENT_PURPOSES.OTHER, "other");
  assert.notEqual(APPOINTMENT_PURPOSES.TRAINING, APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW);
});
