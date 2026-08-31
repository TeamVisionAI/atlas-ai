/**
 * BR-194 — Agenda CLIENT conversion with premium and canonical production KPIs.
 * Synthetic fixtures only. No live tenant data, WhatsApp, SMS, or email.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const clientProductionApplicationService = require("../application/clientProductionApplicationService");
const {
  createMemoryProductionStore,
  PRODUCTION_KPI_SCOPES,
  PRODUCTION_SOURCES
} = require("../core/clientProduction");
const { summarizeRecords, resolveKpiOwnerFilter } = require("../core/clientProduction/productionKpiEngine");

const ORG_A = "20000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000099";
const USER_A = "40000000-0000-4000-8000-000000000001";
const USER_B = "40000000-0000-4000-8000-000000000002";
const CONTACT_ID = "30000000-0000-4000-8000-000000000001";
const APPT_ID = "10000000-0000-4000-8000-000000000001";
const CLIENT_ID = "60000000-0000-4000-8000-000000000001";

const agendaServicePath = require.resolve("../application/agendaApplicationService");
const contactRepoPath = require.resolve("../repositories/agendaContactRepository");
const clientRepoPath = require.resolve("../repositories/agendaClientRepository");
const appointmentRepoPath = require.resolve("../repositories/appointmentRepository");

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
    startDateTime: "2026-08-31T14:00:00.000Z",
    endDateTime: "2026-08-31T14:30:00.000Z",
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

function installAgendaRepos({ appointment = standaloneAppointment(), contact = agendaContact() } = {}) {
  const appointmentRepo = require(appointmentRepoPath);
  const contactRepo = require(contactRepoPath);
  const clientRepo = require(clientRepoPath);
  const originals = {
    findAppointment: appointmentRepo.findById,
    saveAppointment: appointmentRepo.save,
    findContact: contactRepo.findById,
    saveContact: contactRepo.save,
    findClient: clientRepo.findById,
    findClientByContact: clientRepo.findByAgendaContactId,
    saveClient: clientRepo.save
  };
  let currentAppointment = { ...appointment };
  let currentContact = { ...contact };
  let currentClient = null;
  const clients = [];

  appointmentRepo.findById = async (id, organizationId) =>
    id === currentAppointment.id && organizationId === currentAppointment.organizationId
      ? { ...currentAppointment }
      : null;
  appointmentRepo.save = async (row) => {
    currentAppointment = { ...row };
    return currentAppointment;
  };
  contactRepo.findById = async (id) => (id === currentContact.id ? { ...currentContact } : null);
  contactRepo.save = async (row) => {
    currentContact = { ...row };
    return currentContact;
  };
  clientRepo.findById = async (id, organizationId) => {
    if (!currentClient || currentClient.id !== id) return null;
    if (organizationId && currentClient.organizationId !== organizationId) return null;
    return { ...currentClient };
  };
  clientRepo.findByAgendaContactId = async (id, organizationId) => {
    if (!currentClient || currentClient.agendaContactId !== id) return null;
    if (organizationId && currentClient.organizationId !== organizationId) return null;
    return { ...currentClient };
  };
  clientRepo.save = async (row) => {
    currentClient = {
      id: row.id || CLIENT_ID,
      ...row
    };
    clients.push(currentClient);
    return currentClient;
  };

  return {
    currentAppointment: () => currentAppointment,
    currentContact: () => currentContact,
    currentClient: () => currentClient,
    restore() {
      appointmentRepo.findById = originals.findAppointment;
      appointmentRepo.save = originals.saveAppointment;
      contactRepo.findById = originals.findContact;
      contactRepo.save = originals.saveContact;
      clientRepo.findById = originals.findClient;
      clientRepo.findByAgendaContactId = originals.findClientByContact;
      clientRepo.save = originals.saveClient;
    }
  };
}

function loadAgendaService() {
  delete require.cache[agendaServicePath];
  return require(agendaServicePath);
}

test.beforeEach(() => {
  clientProductionApplicationService.setStoresForTests({
    production: createMemoryProductionStore(),
    findClient: async (id, organizationId) => {
      if (!id || organizationId !== ORG_A) return null;
      return {
        id,
        organizationId: ORG_A,
        ownerUserId: USER_A,
        name: "Warm Market Person"
      };
    }
  });
});

test.afterEach(() => {
  clientProductionApplicationService.setStoresForTests({});
});

test("CLIENT outcome records explicit incomplete conversion and does not create production", async () => {
  const harness = installAgendaRepos();
  try {
    const { recordStandaloneOutcome } = loadAgendaService();
    const recorded = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "client" },
      { organizationId: ORG_A, userId: USER_A }
    );
    assert.equal(recorded.outcome, "client");
    assert.equal(recorded.metadata.promotionPending, false);
    assert.equal(recorded.metadata.clientConversionStatus, "incomplete");
    assert.equal(recorded.metadata.clientConversionIncomplete, true);
    assert.equal(recorded.metadata.promotedToClient, undefined);
    const listed = await clientProductionApplicationService.listProduction({
      organizationId: ORG_A,
      authContext: { userId: USER_A, role: "agent" }
    });
    assert.equal(listed.items.length, 0);
  } finally {
    harness.restore();
    delete require.cache[agendaServicePath];
  }
});

test("RECRUITED still uses promotionPending and does not create production", async () => {
  const harness = installAgendaRepos();
  try {
    const { recordStandaloneOutcome } = loadAgendaService();
    const recorded = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "recruited" },
      { organizationId: ORG_A, userId: USER_A }
    );
    assert.equal(recorded.metadata.promotionPending, true);
    assert.notEqual(recorded.metadata.clientConversionStatus, "incomplete");
    const listed = await clientProductionApplicationService.listProduction({
      organizationId: ORG_A,
      authContext: { userId: USER_A, role: "agent" }
    });
    assert.equal(listed.items.length, 0);
  } finally {
    harness.restore();
    delete require.cache[agendaServicePath];
  }
});

test("premium completion promotes client, writes canonical production, and opens workspace", async () => {
  const harness = installAgendaRepos();
  try {
    const { recordStandaloneOutcome, completeAgendaClientConversion } = loadAgendaService();
    await recordStandaloneOutcome(APPT_ID, { outcome: "client" }, { organizationId: ORG_A, userId: USER_A });
    const result = await completeAgendaClientConversion(
      APPT_ID,
      { amount: 1200, currency: "USD", activityType: "LIFE", carrier: "Example" },
      { organizationId: ORG_A, userId: USER_A, role: "agent" }
    );
    assert.ok(result.clientId);
    assert.equal(result.workspacePath, `/app/clients/${result.clientId}`);
    assert.equal(result.production.amount, 1200);
    assert.equal(result.production.currency, "USD");
    assert.equal(result.production.source, PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION);
    assert.equal(result.production.appointmentId, APPT_ID);
    assert.equal(result.appointment.metadata.clientConversionStatus, "complete");
    assert.equal(result.appointment.metadata.clientConversionIncomplete, false);
    assert.equal(result.appointment.metadata.promotedToClient, true);

    const listed = await clientProductionApplicationService.listProduction({
      organizationId: ORG_A,
      authContext: { userId: USER_A, role: "agent" }
    });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.kpis.clientCount, 1);
    assert.equal(listed.kpis.personalProduction, 1200);
    assert.equal(listed.kpis.averagePremium, 1200);
    assert.equal(listed.kpis.appointmentToClientConversions, 1);
  } finally {
    harness.restore();
    delete require.cache[agendaServicePath];
  }
});

test("duplicate submit is idempotent and editing premium updates the same record", async () => {
  const harness = installAgendaRepos();
  try {
    const { completeAgendaClientConversion } = loadAgendaService();
    const first = await completeAgendaClientConversion(
      APPT_ID,
      { amount: 800, currency: "USD" },
      { organizationId: ORG_A, userId: USER_A, role: "agent" }
    );
    const second = await completeAgendaClientConversion(
      APPT_ID,
      { amount: 950, currency: "USD" },
      { organizationId: ORG_A, userId: USER_A, role: "agent" }
    );
    assert.equal(second.production.id, first.production.id);
    assert.equal(second.production.amount, 950);
    const listed = await clientProductionApplicationService.listProduction({
      organizationId: ORG_A,
      authContext: { userId: USER_A, role: "agent" }
    });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.kpis.clientCount, 1);
    assert.equal(listed.kpis.personalProduction, 950);
  } finally {
    harness.restore();
    delete require.cache[agendaServicePath];
  }
});

test("cancelled premium modal leaves incomplete state that can be completed later", async () => {
  const harness = installAgendaRepos();
  try {
    const { recordStandaloneOutcome, completeAgendaClientConversion } = loadAgendaService();
    const recorded = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "client" },
      { organizationId: ORG_A, userId: USER_A }
    );
    assert.equal(recorded.metadata.clientConversionIncomplete, true);
    const later = await completeAgendaClientConversion(
      APPT_ID,
      { amount: 0, currency: "USD" },
      { organizationId: ORG_A, userId: USER_A, role: "agent" }
    );
    assert.equal(later.production.amount, 0);
    assert.equal(later.appointment.metadata.clientConversionStatus, "complete");
  } finally {
    harness.restore();
    delete require.cache[agendaServicePath];
  }
});

test("non-client outcomes do not create production", async () => {
  const harness = installAgendaRepos();
  try {
    const { recordStandaloneOutcome } = loadAgendaService();
    await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "follow_up" },
      { organizationId: ORG_A, userId: USER_A }
    );
    const listed = await clientProductionApplicationService.listProduction({
      organizationId: ORG_A,
      authContext: { userId: USER_A, role: "agent" }
    });
    assert.equal(listed.items.length, 0);
  } finally {
    harness.restore();
    delete require.cache[agendaServicePath];
  }
});

test("Team Vision production cannot affect or be read by another tenant", async () => {
  const production = createMemoryProductionStore();
  clientProductionApplicationService.setStoresForTests({
    production,
    findClient: async (id, organizationId) => {
      if (id === CLIENT_ID && organizationId === ORG_A) {
        return { id: CLIENT_ID, organizationId: ORG_A, ownerUserId: USER_A, name: "TV Client" };
      }
      return null;
    }
  });
  await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: "LIFE",
      status: "SUBMITTED",
      amount: 5000,
      source: PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION,
      appointmentId: APPT_ID
    },
    { userId: USER_A, role: "rvp", hierarchyMode: "organization" }
  );
  const other = await clientProductionApplicationService.listProduction({
    organizationId: ORG_B,
    authContext: { userId: USER_B, role: "rvp", hierarchyMode: "organization" }
  });
  assert.equal(other.items.length, 0);
  assert.equal(other.kpis.personalProduction, 0);
  const tenantKpis = await clientProductionApplicationService.summarizeProductionKpis({
    organizationId: ORG_B,
    authContext: { userId: USER_B, role: "rvp", hierarchyMode: "organization" },
    scope: PRODUCTION_KPI_SCOPES.ORGANIZATION
  });
  assert.equal(tenantKpis.personalProduction, 0);
  assert.equal(tenantKpis.clientCount, 0);
});

test("hierarchy rollups stay organization-scoped and platform requires permission", () => {
  const team = resolveKpiOwnerFilter({
    authContext: {
      userId: USER_A,
      role: "division_leader",
      hierarchyUserIds: [USER_A, USER_B]
    },
    scope: PRODUCTION_KPI_SCOPES.DIVISION
  });
  assert.equal(team.organizationScoped, true);
  assert.deepEqual(team.ownerUserIds, [USER_A, USER_B]);

  assert.throws(
    () =>
      resolveKpiOwnerFilter({
        authContext: { userId: USER_A, role: "agent" },
        scope: PRODUCTION_KPI_SCOPES.ORGANIZATION
      }),
    (error) => error.publicCode === "PRODUCTION_ROLLUP_FORBIDDEN"
  );

  assert.throws(
    () =>
      resolveKpiOwnerFilter({
        authContext: { userId: USER_A, role: "rvp", saasRole: "RVP" },
        scope: PRODUCTION_KPI_SCOPES.PLATFORM
      }),
    (error) => error.publicCode === "PLATFORM_PRODUCTION_FORBIDDEN"
  );

  const platform = resolveKpiOwnerFilter({
    authContext: { userId: USER_A, saasRole: "SUPER_ADMIN" },
    scope: PRODUCTION_KPI_SCOPES.PLATFORM
  });
  assert.equal(platform.organizationScoped, false);
});

test("platform KPI does not leak tenant rows to a non-platform role", async () => {
  const production = createMemoryProductionStore([
    {
      id: "prod-a",
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      ownerUserId: USER_A,
      activityType: "LIFE",
      status: "SUBMITTED",
      amount: 1111,
      source: PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION
    },
    {
      id: "prod-b",
      organizationId: ORG_B,
      clientId: "other-client",
      ownerUserId: USER_B,
      activityType: "LIFE",
      status: "SUBMITTED",
      amount: 2222,
      source: PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION
    }
  ]);
  clientProductionApplicationService.setStoresForTests({
    production,
    findClient: async () => null
  });
  await assert.rejects(
    () =>
      clientProductionApplicationService.summarizeProductionKpis({
        organizationId: ORG_A,
        authContext: { userId: USER_A, role: "rvp", saasRole: "RVP" },
        scope: "platform"
      }),
    (error) => error.publicCode === "PLATFORM_PRODUCTION_FORBIDDEN"
  );
  const orgA = await clientProductionApplicationService.summarizeProductionKpis({
    organizationId: ORG_A,
    authContext: { userId: USER_A, role: "rvp", hierarchyMode: "organization" },
    scope: "organization"
  });
  assert.equal(orgA.personalProduction, 1111);
  assert.equal(orgA.clientCount, 1);

  const platform = await clientProductionApplicationService.summarizeProductionKpis({
    authContext: { userId: USER_A, saasRole: "SUPER_ADMIN" },
    scope: "platform"
  });
  assert.equal(platform.recordCount, 2);
  assert.equal(platform.organizations.length, 2);
});

test("KPI summary uses one canonical record set", () => {
  const summary = summarizeRecords([
    {
      organizationId: ORG_A,
      clientId: "c1",
      status: "SUBMITTED",
      amount: 100,
      source: PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION,
      appointmentId: "a1"
    },
    {
      organizationId: ORG_A,
      clientId: "c1",
      status: "DRAFT",
      amount: 999
    },
    {
      organizationId: ORG_A,
      clientId: "c2",
      status: "PAID",
      amount: 300,
      source: PRODUCTION_SOURCES.MANUAL
    }
  ]);
  assert.equal(summary.clientCount, 2);
  assert.equal(summary.personalProduction, 400);
  assert.equal(summary.averagePremium, 200);
  assert.equal(summary.appointmentToClientConversions, 1);
});

test("migration adds appointment-linked production without replacing BR-181", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/070_br194_agenda_client_production.sql"),
    "utf8"
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS appointment_id/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS currency/);
  assert.match(sql, /AGENDA_CLIENT_CONVERSION/);
  assert.match(sql, /uq_atlas_client_production_org_appointment/);
  const agendaUi = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/AppointmentsPage.jsx"),
    "utf8"
  );
  const cardActions = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/appointments/AppointmentCardActions.jsx"),
    "utf8"
  );
  assert.match(agendaUi, /ClientConversionPremiumDialog/);
  assert.match(agendaUi, /agendaClientConversionIncomplete/);
  assert.match(cardActions, /agendaResumeClientSetup/);
});
