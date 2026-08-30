/**
 * BR-179 — Client Workspace V1.
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

const clientWorkspaceApplicationService = require("../application/clientWorkspaceApplicationService");
const followUpApplicationService = require("../application/followUpApplicationService");
const { createMemoryFollowUpStore } = require("../core/followUps");
const { emptyClients, emptyClientDetail, emptyDashboard } = require("../core/operationalControlPlane");
const { CLIENT_STATUSES } = require("../core/clients");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const CONTACT_ID = "31000000-0000-4000-8000-000000000001";
const CLIENT_ID = "32000000-0000-4000-8000-000000000001";
const APPT_ID = "61000000-0000-4000-8000-000000000001";

function auth(userId = USER_A, extras = {}) {
  return { userId, role: extras.role || "agent", ...extras };
}

function clientSeed(overrides = {}) {
  return {
    id: CLIENT_ID,
    organizationId: ORG_A,
    ownerUserId: USER_A,
    agendaContactId: CONTACT_ID,
    name: "Alex Client",
    phone: "+15550001111",
    email: "alex@example.com",
    preferredLanguage: "en",
    source: "agenda",
    notes: "Promoted from Agenda",
    status: CLIENT_STATUSES.ACTIVE,
    createdBy: USER_A,
    createdAt: "2026-08-30T15:00:00.000Z",
    updatedAt: "2026-08-30T15:00:00.000Z",
    history: [
      {
        type: "promoted",
        actor: USER_A,
        at: "2026-08-30T15:00:00.000Z",
        summary: "Promoted to Client"
      }
    ],
    ...overrides
  };
}

test.beforeEach(() => {
  const clients = clientWorkspaceApplicationService.createMemoryClientStore([clientSeed()]);
  clientWorkspaceApplicationService.setStoresForTests({
    clients,
    appointmentSearch: async () => ({
      items: [
        {
          id: APPT_ID,
          agendaContactId: CONTACT_ID,
          startDateTime: "2026-09-04T15:00:00.000Z",
          status: "scheduled",
          purpose: "client_service",
          history: [
            {
              type: "agenda_promoted_client",
              actor: USER_A,
              at: "2026-08-30T15:00:00.000Z",
              summary: "Agenda contact promoted to Client"
            }
          ]
        }
      ],
      total: 1
    }),
    contactFind: async (id, organizationId) =>
      id === CONTACT_ID && organizationId === ORG_A
        ? { id: CONTACT_ID, name: "Alex Client", phone: "+15550001111", email: "alex@example.com" }
        : null
  });
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
});

test.afterEach(() => {
  clientWorkspaceApplicationService.setStoresForTests({});
  followUpApplicationService.setStoreForTests(null);
});

test("promoted client appears in My Clients and search matches name/phone/email", async () => {
  const listed = await clientWorkspaceApplicationService.listClients({
    organizationId: ORG_A,
    authContext: auth(),
    search: "alex@example.com"
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].id, CLIENT_ID);
  assert.equal(listed.items[0].source, "client");
  assert.equal(listed.scope, "mine");
  assert.equal(listed.items[0].nextAppointment.id, APPT_ID);

  const missed = await clientWorkspaceApplicationService.listClients({
    organizationId: ORG_A,
    authContext: auth(),
    search: "recruit"
  });
  assert.equal(missed.items.length, 0);
});

test("another user cannot access a client unless hierarchy permits", async () => {
  await assert.rejects(
    () =>
      clientWorkspaceApplicationService.getClient(CLIENT_ID, {
        organizationId: ORG_A,
        authContext: auth(USER_B)
      }),
    /not found/i
  );
});

test("wrong organization ID fails closed as 404", async () => {
  await assert.rejects(
    () =>
      clientWorkspaceApplicationService.getClient(CLIENT_ID, {
        organizationId: ORG_B,
        authContext: auth()
      }),
    /not found/i
  );
});

test("client profile shows linked appointment, history names, and no raw UUID actors", async () => {
  const names = new Map([[USER_A, "Alex Owner"]]);
  const detail = await clientWorkspaceApplicationService.getClient(CLIENT_ID, {
    organizationId: ORG_A,
    authContext: auth(),
    nameById: names
  });
  assert.equal(detail.client.name, "Alex Client");
  assert.equal(detail.contact.id, CONTACT_ID);
  assert.equal(detail.appointments.length, 1);
  assert.equal(detail.client.ownerName, "Alex Owner");
  assert.equal(detail.client.createdByName, "Alex Owner");
  assert.equal(detail.client.history[0].actorName, "Alex Owner");
  assert.equal(detail.appointments[0].history[0].actorName, "Alex Owner");
  const serialized = JSON.stringify(detail.client.history);
  assert.doesNotMatch(detail.client.ownerName, /[0-9a-f]{8}-[0-9a-f]{4}/i);
  assert.doesNotMatch(serialized, /"actorName":"41000000-0000-4000-8000-000000000001"/);
});

test("BR-178 client follow-up stays client-side and appears in the owner queue", async () => {
  const created = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "client",
      entityId: CLIENT_ID,
      subjectLabel: "Alex Client",
      subjectPhone: "+15550001111",
      ownerUserId: USER_A,
      dueDate: "2026-08-30",
      notes: "Service check-in"
    },
    auth()
  );
  assert.equal(created.created, true);
  assert.equal(created.followUp.entityType, "client");
  assert.equal(created.followUp.entityId, CLIENT_ID);

  const queue = await followUpApplicationService.listFollowUps({
    organizationId: ORG_A,
    authContext: auth(),
    includeLegacy: false,
    reference: new Date("2026-08-30T16:00:00.000Z")
  });
  assert.equal(queue.items.some((item) => item.entityId === CLIENT_ID && item.entityType === "client"), true);

  const detail = await clientWorkspaceApplicationService.getClient(CLIENT_ID, {
    organizationId: ORG_A,
    authContext: auth(),
    reference: new Date("2026-08-30T16:00:00.000Z")
  });
  assert.equal(detail.followUps.length, 1);
  assert.equal(detail.followUps[0].entityType, "client");
  assert.equal(detail.client.nextFollowUp.id, created.followUp.id);
});

test("notes and status changes are actor/timestamp history, not automatic", async () => {
  const noted = await clientWorkspaceApplicationService.addNote(
    CLIENT_ID,
    { organizationId: ORG_A, body: "Call after FNA packet is ready." },
    auth()
  );
  assert.equal(noted.history.at(-1).type, "note_added");
  assert.equal(noted.history.at(-1).body, "Call after FNA packet is ready.");
  assert.equal(noted.status, CLIENT_STATUSES.ACTIVE);

  const updated = await clientWorkspaceApplicationService.updateStatus(
    CLIENT_ID,
    { organizationId: ORG_A, status: CLIENT_STATUSES.FOLLOW_UP },
    auth()
  );
  assert.equal(updated.status, CLIENT_STATUSES.FOLLOW_UP);
  assert.equal(updated.history.at(-1).type, "status_changed");
});

test("control-plane empty payload has no tenant clients", () => {
  const empty = emptyClients();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.items.length, 0);
  assert.equal(emptyClientDetail().client, null);
  assert.equal(emptyDashboard().myClientsCount, 0);
});

test("BR-179 routes, promotion, and recruiting stay isolated", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/clients.js"), "utf8");
  const service = fs.readFileSync(path.join(__dirname, "../application/clientWorkspaceApplicationService.js"), "utf8");
  const agenda = fs.readFileSync(path.join(__dirname, "../application/agendaApplicationService.js"), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/ClientsPage.jsx"), "utf8");
  const followUpsPage = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/FollowUpsPage.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(__dirname, "../../frontend/src/config/workspaceExperience.js"), "utf8");
  const prospectCenter = fs.readFileSync(path.join(__dirname, "../core/prospectCenterReadModel.js"), "utf8");
  const recruitDecision = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"), "utf8");
  const interpreter = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/interpreter.js"), "utf8");
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/063_br179_client_workspace.sql"),
    "utf8"
  );

  assert.match(routes, /operationalControlPlaneEmpty\(emptyClients\)/);
  assert.match(routes, /operationalControlPlaneEmpty\(emptyClientDetail\)/);
  assert.match(service, /atlas_agenda_clients is the client SoT/);
  assert.doesNotMatch(service, /loadProductionProspects|\/api\/prospects|recruitAiV2/);
  assert.match(agenda, /workspacePath: `\/app\/clients\/\$\{client\.id\}`/);
  assert.doesNotMatch(agenda, /createProspect|insertProspect/);
  assert.match(page, /entityType: "client"/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|\/api\/prospects/);
  assert.match(followUpsPage, /appPath\(`clients\/\$\{item\.entityId\}`\)/);
  assert.match(nav, /path: appPath\("clients"\)/);
  assert.doesNotMatch(prospectCenter, /atlas_agenda_clients|clientWorkspaceApplicationService/);
  assert.doesNotMatch(recruitDecision, /clientWorkspaceApplicationService|atlas_agenda_clients/);
  assert.doesNotMatch(interpreter, /clientWorkspaceApplicationService|atlas_agenda_clients/);
  assert.match(migration, /ALTER TABLE atlas_agenda_clients/);
  assert.doesNotMatch(migration, /CREATE TABLE/);
});

test("BR-177 promote client remains one row per Agenda contact and links to the workspace", async () => {
  const contactRepoPath = path.join(__dirname, "../repositories/agendaContactRepository.js");
  const clientRepoPath = path.join(__dirname, "../repositories/agendaClientRepository.js");
  const appointmentRepoPath = path.join(__dirname, "../repositories/appointmentRepository.js");
  const agendaServicePath = path.join(__dirname, "../application/agendaApplicationService.js");
  const contactRepo = require(contactRepoPath);
  const clientRepo = require(clientRepoPath);
  const appointmentRepo = require(appointmentRepoPath);
  const originals = {
    findAppointment: appointmentRepo.findById,
    saveAppointment: appointmentRepo.save,
    findContact: contactRepo.findById,
    saveContact: contactRepo.save,
    findClient: clientRepo.findById,
    findClientByContact: clientRepo.findByAgendaContactId,
    saveClient: clientRepo.save
  };

  let contact = {
    id: CONTACT_ID,
    organizationId: ORG_A,
    ownerUserId: USER_A,
    name: "Alex Client",
    phone: "+15550001111",
    email: "alex@example.com",
    preferredLanguage: "en",
    source: "agenda",
    notes: null,
    promotedClientId: null,
    promotedProspectId: null,
    status: "active"
  };
  const appointment = {
    id: APPT_ID,
    organizationId: ORG_A,
    prospectId: null,
    prospectPhone: null,
    agendaContactId: CONTACT_ID,
    metadata: { standaloneAgenda: true, noRecruitAi: true, agendaContactPhone: "+15550001111" },
    history: []
  };
  const clients = [];
  appointmentRepo.findById = async (id, organizationId) =>
    id === APPT_ID && organizationId === ORG_A ? appointment : null;
  appointmentRepo.save = async (row) => Object.assign(appointment, row);
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
    delete require.cache[agendaServicePath];
    const { promoteToClient } = require(agendaServicePath);
    const first = await promoteToClient(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    const second = await promoteToClient(APPT_ID, {}, { organizationId: ORG_A, userId: USER_A });
    assert.equal(first.created, true);
    assert.equal(first.workspacePath, `/app/clients/${CLIENT_ID}`);
    assert.equal(first.client.status, "ACTIVE");
    assert.equal(clients.length, 1);
    assert.equal(appointment.prospectId, null);
    assert.equal(second.alreadyPromoted, true);
    assert.equal(second.clientId, CLIENT_ID);
    assert.equal(clients.length, 1);
  } finally {
    appointmentRepo.findById = originals.findAppointment;
    appointmentRepo.save = originals.saveAppointment;
    contactRepo.findById = originals.findContact;
    contactRepo.save = originals.saveContact;
    clientRepo.findById = originals.findClient;
    clientRepo.findByAgendaContactId = originals.findClientByContact;
    clientRepo.save = originals.saveClient;
    delete require.cache[agendaServicePath];
  }
});
