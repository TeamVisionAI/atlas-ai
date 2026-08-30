/**
 * BR-177 — Unified Agenda Actions & Promotion.
 * Synthetic fixtures only. No live tenant data, WhatsApp, or Calendar.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const {
  evaluateRecruitingInboxEligibility
} = require("../core/conversationsCenter/conversationsCenterInboxEligibility");

const ORG_A = "20000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000099";
const USER_A = "40000000-0000-4000-8000-000000000001";
const CONTACT_ID = "30000000-0000-4000-8000-000000000001";
const APPT_ID = "10000000-0000-4000-8000-000000000001";
const PROSPECT_ID = "50000000-0000-4000-8000-000000000001";
const CLIENT_ID = "60000000-0000-4000-8000-000000000001";

const agendaServicePath = require.resolve("../application/agendaApplicationService");
const appointmentServicePath = require.resolve("../application/appointmentApplicationService");
const contactRepoPath = require.resolve("../repositories/agendaContactRepository");
const clientRepoPath = require.resolve("../repositories/agendaClientRepository");
const appointmentRepoPath = require.resolve("../repositories/appointmentRepository");
const supabasePath = require.resolve("../services/supabaseService");
const atlasUserPath = require.resolve("../services/atlasUserService");
const routesPath = require.resolve("../routes/agenda.js");

const atlasUserService = require(atlasUserPath);
atlasUserService.findUserById = async (id) => ({
  id,
  first_name: "Ada",
  last_name: "Recruiter"
});
const migrationPath = path.join(
  __dirname,
  "../database/migrations/061_br177_agenda_actions_promotion.sql"
);

function standaloneAppointment(overrides = {}) {
  return {
    id: APPT_ID,
    organizationId: ORG_A,
    prospectId: null,
    prospectPhone: null,
    agendaContactId: CONTACT_ID,
    agentId: USER_A,
    interviewerUserId: USER_A,
    purpose: "training",
    status: "scheduled",
    source: "agent_manual",
    startDateTime: "2026-08-30T14:00:00.000Z",
    endDateTime: "2026-08-30T14:30:00.000Z",
    durationMinutes: 30,
    timezone: "America/New_York",
    meetingType: "virtual",
    outcome: null,
    outcomeNotes: null,
    history: [],
    metadata: {
      standaloneAgenda: true,
      noRecruitAi: true,
      agendaContactName: "Warm Market Person",
      agendaContactPhone: "+13055550123",
      agendaContactEmail: "warm@example.com",
      lifecycleState: "scheduled"
    },
    ...overrides
  };
}

function agendaContact(overrides = {}) {
  return {
    id: CONTACT_ID,
    organizationId: ORG_A,
    ownerUserId: USER_A,
    name: "Warm Market Person",
    phone: "+13055550123",
    email: "warm@example.com",
    preferredLanguage: "spanish",
    source: "WARM_MARKET",
    notes: "Met at church",
    status: "active",
    promotedProspectId: null,
    promotedClientId: null,
    metadata: {},
    ...overrides
  };
}

function loadAgendaService() {
  delete require.cache[agendaServicePath];
  return require(agendaServicePath);
}

test("BR-177 migration adds durable client foundation and contact fields", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS atlas_agenda_clients/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS preferred_language/i);
  assert.match(sql, /REVOKE ALL ON TABLE atlas_agenda_clients FROM anon, authenticated/i);
  assert.match(sql, /GRANT ALL ON TABLE atlas_agenda_clients TO service_role/i);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS prospects/i);
});

test("BR-177 APIs stay on Agenda + existing appointment routes", () => {
  const routes = fs.readFileSync(routesPath, "utf8");
  assert.match(routes, /\/contacts\/:id/);
  assert.match(routes, /promote-recruit/);
  assert.match(routes, /promote-client/);
  assert.match(routes, /operationalControlPlaneEmpty/);
  const appointments = fs.readFileSync(
    path.join(__dirname, "../routes/appointments.js"),
    "utf8"
  );
  assert.match(appointments, /\/:id\/reschedule/);
  assert.match(appointments, /\/:id\/cancel/);
  assert.match(appointments, /\/:id\/complete/);
});

test("BR-177 reschedule/cancel notify only from appointment application service", () => {
  const agendaSource = fs.readFileSync(agendaServicePath, "utf8");
  const appointmentSource = fs.readFileSync(appointmentServicePath, "utf8");
  assert.doesNotMatch(agendaSource, /notifyOperationalEvent|notifyAppointmentLifecycle/);
  assert.match(appointmentSource, /APPOINTMENT_RESCHEDULED/);
  assert.match(appointmentSource, /APPOINTMENT_CANCELLED/);
  assert.match(appointmentSource, /recordStandaloneOutcome/);
});

test("BR-177 does not change Recruit AI qualification or semantic apply", () => {
  const agendaSource = fs.readFileSync(agendaServicePath, "utf8");
  assert.doesNotMatch(agendaSource, /recruitAiV2|semanticConversationEngine|aiQuality/);
  const eligibility = evaluateRecruitingInboxEligibility({
    entry_method: "AGENDA_PROMOTION",
    source: "AGENDA"
  });
  assert.equal(eligibility.eligible, false);
});

test("BR-177 record outcome is appointment-owned, idempotent, and does not auto-promote", async () => {
  const contactRepo = require(contactRepoPath);
  const appointmentRepo = require(appointmentRepoPath);
  const originalFindAppointment = appointmentRepo.findById;
  const originalSaveAppointment = appointmentRepo.save;
  const originalFindContact = contactRepo.findById;

  const appointment = standaloneAppointment();
  const saved = [];
  appointmentRepo.findById = async (id, organizationId) =>
    id === APPT_ID && organizationId === ORG_A ? { ...appointment, ...saved.at(-1) } : null;
  appointmentRepo.save = async (row) => {
    saved.push(row);
    return row;
  };
  contactRepo.findById = async () => agendaContact();

  try {
    const { recordStandaloneOutcome } = loadAgendaService();
    const first = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "recruited", outcomeNotes: "Ready" },
      { organizationId: ORG_A, userId: USER_A }
    );
    assert.equal(first.outcome, "recruited");
    assert.equal(first.metadata.promotionPending, true);
    assert.equal(first.prospectId, null);
    const event = first.history.at(-1);
    assert.equal(event.type, "agenda_outcome_recorded");
    assert.equal(event.actor, USER_A);
    assert.ok(event.at);
    assert.doesNotMatch(String(event.actorName || ""), /^[0-9a-f-]{36}$/i);

    const second = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "recruited", outcomeNotes: "Ready" },
      { organizationId: ORG_A, userId: USER_A }
    );
    assert.equal(saved.length, 1);
    assert.equal(second.outcome, "recruited");
  } finally {
    appointmentRepo.findById = originalFindAppointment;
    appointmentRepo.save = originalSaveAppointment;
    contactRepo.findById = originalFindContact;
    delete require.cache[agendaServicePath];
  }
});

test("BR-177 cancelled outcome reuses cancel reminders and stays tenant-scoped", async () => {
  const agendaSource = fs.readFileSync(agendaServicePath, "utf8");
  const appointmentSource = fs.readFileSync(appointmentServicePath, "utf8");
  assert.match(agendaSource, /cancelAppointment/);
  assert.match(appointmentSource, /appointmentReminderEngine\.cancelReminders/);

  const appointmentRepo = require(appointmentRepoPath);
  const originalFindAppointment = appointmentRepo.findById;
  const originalSaveAppointment = appointmentRepo.save;
  const appointment = standaloneAppointment({
    status: "cancelled",
    reminderStatus: "cancelled",
    metadata: {
      ...standaloneAppointment().metadata,
      lifecycleState: "cancelled"
    }
  });
  const saved = [];
  appointmentRepo.findById = async (id, organizationId) =>
    id === APPT_ID && organizationId === ORG_A ? { ...appointment, ...saved.at(-1) } : null;
  appointmentRepo.save = async (row) => {
    saved.push(row);
    return row;
  };

  try {
    const { recordStandaloneOutcome } = loadAgendaService();
    const foreign = await appointmentRepo.findById(APPT_ID, ORG_B);
    assert.equal(foreign, null);

    const recorded = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "cancelled" },
      { organizationId: ORG_A, userId: USER_A }
    );
    assert.equal(recorded.outcome, "cancelled");
    assert.equal(recorded.id, APPT_ID);
    assert.equal(recorded.history.at(-1).type, "agenda_outcome_recorded");
  } finally {
    appointmentRepo.findById = originalFindAppointment;
    appointmentRepo.save = originalSaveAppointment;
    delete require.cache[agendaServicePath];
  }
});

test("BR-177 promote recruit is explicit, idempotent, and does not duplicate", async () => {
  const contactRepo = require(contactRepoPath);
  const appointmentRepo = require(appointmentRepoPath);
  const supabaseService = require(supabasePath);
  const originalFindAppointment = appointmentRepo.findById;
  const originalSaveAppointment = appointmentRepo.save;
  const originalFindContact = contactRepo.findById;
  const originalSaveContact = contactRepo.save;
  const originalFindByPhone = supabaseService.findProspectByNormalizedPhoneInOrganization;
  const originalFindInOrg = supabaseService.findProspectInOrganization;
  const originalFrom = supabaseService.supabase.from;

  let contact = agendaContact();
  const appointment = standaloneAppointment();
  const inserts = [];
  appointmentRepo.findById = async (id, organizationId) =>
    id === APPT_ID && organizationId === ORG_A ? appointment : null;
  appointmentRepo.save = async (row) => {
    Object.assign(appointment, row);
    return appointment;
  };
  contactRepo.findById = async (id, organizationId) =>
    id === CONTACT_ID && organizationId === ORG_A ? contact : null;
  contactRepo.save = async (row) => {
    contact = { ...contact, ...row };
    return contact;
  };
  supabaseService.findProspectByNormalizedPhoneInOrganization = async () => null;
  supabaseService.findProspectInOrganization = async () =>
    contact.promotedProspectId
      ? { id: PROSPECT_ID, name: contact.name, organization_id: ORG_A }
      : null;
  supabaseService.supabase.from = (table) => {
    assert.equal(table, "prospects");
    return {
      insert(row) {
        inserts.push(row);
        return {
          select() {
            return {
              async single() {
                return {
                  data: {
                    id: PROSPECT_ID,
                    ...row
                  },
                  error: null
                };
              }
            };
          }
        };
      }
    };
  };

  try {
    const { promoteToRecruit } = loadAgendaService();
    const first = await promoteToRecruit(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    assert.equal(first.created, true);
    assert.equal(first.prospectId, PROSPECT_ID);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].organization_id, ORG_A);
    assert.equal(inserts[0].owner_user_id, USER_A);
    assert.equal(inserts[0].entry_method, "AGENDA_PROMOTION");
    assert.equal(Object.hasOwn(inserts[0], "email"), false);
    assert.match(String(inserts[0].notes), /EMAIL:warm@example\.com/);
    assert.match(String(inserts[0].notes), /Met at church/);
    assert.equal(appointment.prospectId, PROSPECT_ID);
    assert.equal(appointment.id, APPT_ID);
    assert.equal(contact.promotedProspectId, PROSPECT_ID);

    const second = await promoteToRecruit(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    assert.equal(second.alreadyPromoted, true);
    assert.equal(inserts.length, 1);
  } finally {
    appointmentRepo.findById = originalFindAppointment;
    appointmentRepo.save = originalSaveAppointment;
    contactRepo.findById = originalFindContact;
    contactRepo.save = originalSaveContact;
    supabaseService.findProspectByNormalizedPhoneInOrganization = originalFindByPhone;
    supabaseService.findProspectInOrganization = originalFindInOrg;
    supabaseService.supabase.from = originalFrom;
    delete require.cache[agendaServicePath];
  }
});

test("BR-177 promote client uses agenda client foundation, not a recruiting prospect", async () => {
  const contactRepo = require(contactRepoPath);
  const clientRepo = require(clientRepoPath);
  const appointmentRepo = require(appointmentRepoPath);
  const originalFindAppointment = appointmentRepo.findById;
  const originalSaveAppointment = appointmentRepo.save;
  const originalFindContact = contactRepo.findById;
  const originalSaveContact = contactRepo.save;
  const originalFindClient = clientRepo.findById;
  const originalFindClientByContact = clientRepo.findByAgendaContactId;
  const originalSaveClient = clientRepo.save;

  let contact = agendaContact({ phone: null });
  const appointment = standaloneAppointment({
    metadata: { ...standaloneAppointment().metadata, agendaContactPhone: null }
  });
  const clients = [];
  appointmentRepo.findById = async (id, organizationId) =>
    id === APPT_ID && organizationId === ORG_A ? appointment : null;
  appointmentRepo.save = async (row) => {
    Object.assign(appointment, row);
    return appointment;
  };
  contactRepo.findById = async (id, organizationId) =>
    id === CONTACT_ID && organizationId === ORG_A ? contact : null;
  contactRepo.save = async (row) => {
    contact = { ...contact, ...row };
    return contact;
  };
  clientRepo.findByAgendaContactId = async () => clients[0] || null;
  clientRepo.findById = async (id, organizationId) =>
    clients.find((item) => item.id === id && item.organizationId === organizationId) || null;
  clientRepo.save = async (row) => {
    const saved = { id: CLIENT_ID, ...row };
    clients.push(saved);
    return saved;
  };

  try {
    const { promoteToClient, promoteToRecruit } = loadAgendaService();
    const result = await promoteToClient(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    assert.equal(result.created, true);
    assert.equal(result.clientId, CLIENT_ID);
    assert.equal(clients[0].organizationId, ORG_A);
    assert.equal(clients[0].ownerUserId, USER_A);
    assert.equal(appointment.prospectId, null);
    assert.equal(contact.promotedClientId, CLIENT_ID);

    await assert.rejects(
      () => promoteToRecruit(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A }),
      /Phone is required/
    );

    const second = await promoteToClient(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    assert.equal(second.alreadyPromoted, true);
    assert.equal(clients.length, 1);
  } finally {
    appointmentRepo.findById = originalFindAppointment;
    appointmentRepo.save = originalSaveAppointment;
    contactRepo.findById = originalFindContact;
    contactRepo.save = originalSaveContact;
    clientRepo.findById = originalFindClient;
    clientRepo.findByAgendaContactId = originalFindClientByContact;
    clientRepo.save = originalSaveClient;
    delete require.cache[agendaServicePath];
  }
});

test("BR-177 unpromoted Agenda contact stays out of prospect identity", () => {
  const appointment = standaloneAppointment();
  assert.equal(appointment.prospectId, null);
  assert.equal(appointment.prospectPhone, null);
  assert.equal(appointment.metadata.standaloneAgenda, true);
  assert.equal(appointment.metadata.noRecruitAi, true);
});

test("BR-177 get contact is organization-scoped", async () => {
  const contactRepo = require(contactRepoPath);
  const originalFindContact = contactRepo.findById;
  contactRepo.findById = async (id, organizationId) =>
    id === CONTACT_ID && organizationId === ORG_A ? agendaContact() : null;

  try {
    const { getAgendaContact } = loadAgendaService();
    const found = await getAgendaContact(CONTACT_ID, { organizationId: ORG_A, userId: USER_A });
    assert.equal(found.phone, "+13055550123");
    assert.equal(found.preferredLanguage, "spanish");
    await assert.rejects(
      () => getAgendaContact(CONTACT_ID, { organizationId: ORG_B, userId: USER_A }),
      /not found/i
    );
  } finally {
    contactRepo.findById = originalFindContact;
    delete require.cache[agendaServicePath];
  }
});

test("BR-177 promote recruit insert matches live prospects schema and keeps email in notes", async () => {
  // Live production prospects columns observed 2026-08-30 (no email column).
  const liveProspectColumns = new Set([
    "id",
    "phone",
    "name",
    "current_step",
    "status",
    "last_message",
    "created_at",
    "updated_at",
    "city",
    "state",
    "work_authorized",
    "occupation",
    "language",
    "appointment_type",
    "appointment_date",
    "notes",
    "interview_type",
    "interview_time",
    "calendar_event_id",
    "workflow_state",
    "first_name",
    "last_name",
    "normalized_phone",
    "communication_language",
    "entry_method",
    "source",
    "owner_user_id",
    "created_by_user_id",
    "prospect_number",
    "preferred_communication_channel",
    "organization_id",
    "assigned_division_id",
    "assigned_rvp_id",
    "preferred_language",
    "assignment_status",
    "assignment_source",
    "attention_status",
    "acknowledged_at",
    "acknowledged_by_user_id",
    "human_attention_reason",
    "new_lead_received_at",
    "escalation_level",
    "last_escalated_at",
    "whatsapp_sender_id",
    "whatsapp_username"
  ]);

  const contactRepo = require(contactRepoPath);
  const appointmentRepo = require(appointmentRepoPath);
  const supabaseService = require(supabasePath);
  const originalFindAppointment = appointmentRepo.findById;
  const originalSaveAppointment = appointmentRepo.save;
  const originalFindContact = contactRepo.findById;
  const originalSaveContact = contactRepo.save;
  const originalFindByPhone = supabaseService.findProspectByNormalizedPhoneInOrganization;
  const originalFindInOrg = supabaseService.findProspectInOrganization;
  const originalFrom = supabaseService.supabase.from;

  let contact = agendaContact({
    email: "warm@example.com",
    notes: "Met at church"
  });
  const appointment = standaloneAppointment();
  const inserts = [];
  appointmentRepo.findById = async (id, organizationId) =>
    id === APPT_ID && organizationId === ORG_A ? appointment : null;
  appointmentRepo.save = async (row) => {
    Object.assign(appointment, row);
    return appointment;
  };
  contactRepo.findById = async (id, organizationId) =>
    id === CONTACT_ID && organizationId === ORG_A ? contact : null;
  contactRepo.save = async (row) => {
    contact = { ...contact, ...row };
    return contact;
  };
  supabaseService.findProspectByNormalizedPhoneInOrganization = async () => null;
  supabaseService.findProspectInOrganization = async () =>
    contact.promotedProspectId ? { id: PROSPECT_ID, notes: inserts[0]?.notes } : null;
  supabaseService.supabase.from = (table) => {
    assert.equal(table, "prospects");
    return {
      insert(row) {
        if (Object.hasOwn(row, "email")) {
          return {
            select() {
              return {
                async single() {
                  return {
                    data: null,
                    error: {
                      code: "PGRST204",
                      message: "Could not find the 'email' column of 'prospects' in the schema cache"
                    }
                  };
                }
              };
            }
          };
        }
        inserts.push(row);
        return {
          select() {
            return {
              async single() {
                return { data: { id: PROSPECT_ID, ...row }, error: null };
              }
            };
          }
        };
      }
    };
  };

  try {
    const { promoteToRecruit, AGENDA_ENTRY_METHOD } = loadAgendaService();
    const first = await promoteToRecruit(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    assert.equal(first.created, true);
    assert.equal(inserts.length, 1);
    assert.equal(AGENDA_ENTRY_METHOD, "AGENDA_PROMOTION");
    assert.equal(inserts[0].entry_method, "AGENDA_PROMOTION");
    assert.equal(Object.hasOwn(inserts[0], "email"), false);
    for (const column of Object.keys(inserts[0])) {
      assert.ok(
        liveProspectColumns.has(column),
        `unexpected prospects column: ${column}`
      );
    }
    assert.match(String(inserts[0].notes), /EMAIL:warm@example\.com/);
    assert.doesNotMatch(JSON.stringify(inserts[0]), /PGRST204/);

    const second = await promoteToRecruit(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    assert.equal(second.alreadyPromoted, true);
    assert.equal(inserts.length, 1);
  } finally {
    appointmentRepo.findById = originalFindAppointment;
    appointmentRepo.save = originalSaveAppointment;
    contactRepo.findById = originalFindContact;
    contactRepo.save = originalSaveContact;
    supabaseService.findProspectByNormalizedPhoneInOrganization = originalFindByPhone;
    supabaseService.findProspectInOrganization = originalFindInOrg;
    supabaseService.supabase.from = originalFrom;
    delete require.cache[agendaServicePath];
  }
});

test("BR-177 UI reuses appointment dialogs and shows Agenda contact phone", () => {
  const actions = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/appointments/AppointmentCardActions.jsx"),
    "utf8"
  );
  const details = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/appointments/AppointmentDetailsPanel.jsx"),
    "utf8"
  );
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/AppointmentsPage.jsx"),
    "utf8"
  );
  const presentation = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/engines/appointmentCardPresentation.js"),
    "utf8"
  );
  assert.match(actions, /agendaRecordOutcome/);
  assert.match(actions, /agendaPromoteRecruit/);
  assert.match(details, /agendaContactPhone/);
  assert.match(page, /PromoteAgendaContactDialog/);
  assert.match(page, /appointmentId/);
  assert.match(page, /ControlPlaneEmptyState/);
  assert.match(presentation, /agendaContactPhone/);
  assert.match(
    fs.readFileSync(
      path.join(__dirname, "../../frontend/src/components/appointments/RescheduleAppointmentDialog.jsx"),
      "utf8"
    ),
    /fetchAppointmentAvailability/
  );
});
