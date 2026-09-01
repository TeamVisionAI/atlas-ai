/**
 * BR-206 — Manual Agenda outcome recovery + evidence attribution.
 * Synthetic fixtures only. No live tenant writes.
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  RECOVERY_ACTIONS,
  planAgendaOutcomeRecovery,
  validateProductionSplits,
  deriveAgendaOutcomeKpis,
  deriveProductionKpi
} = require("../core/agendaOutcomeEvidence");
const { createMemoryAgendaRecruitStore } = require("../core/agendaRecruits/memoryStore");
const {
  resolveAppointmentViewFilters,
  matchesListFilters
} = require("../core/appointmentListQuery");
const {
  setStoresForTests,
  recoverAgendaOutcome
} = require("../application/agendaOutcomeRecoveryApplicationService");
const { createMemoryProductionAttributionStore } = require("../core/clientProduction/attributionMemoryStore");

const ORG = "20000000-0000-4000-8000-000000000206";
const OWNER = "40000000-0000-4000-8000-000000000206";
const LEIDY_APPT = "9f9c7c5b-35f4-4ea9-8117-05630d46897e";
const LEIDY_CONTACT = "06a1cda4-156e-4f83-824e-33302e9fdf04";
const LEIDY_PROSPECT = "2fbb5bd6-61db-4807-9d6f-74dad6b30e7b";
const ALEJANDRO_APPT = "54603962-2156-472a-b8d9-2d997e1612c7";
const ALEJANDRO_CONTACT = "3a4467cf-127b-42c4-b046-9f280fccf61b";

function appointmentFixture(overrides = {}) {
  return {
    id: "appt-1",
    organizationId: ORG,
    prospectId: null,
    agendaContactId: "contact-1",
    agentId: OWNER,
    interviewerUserId: OWNER,
    purpose: "other",
    status: "scheduled",
    source: "agent_manual",
    startDateTime: "2026-08-31T16:30:00.000Z",
    outcome: null,
    history: [],
    metadata: {
      standaloneAgenda: true,
      agendaContactName: "Warm Market",
      agendaContactPhone: "9543095184",
      lifecycleState: "scheduled"
    },
    ...overrides
  };
}

function contactFixture(overrides = {}) {
  return {
    id: "contact-1",
    organizationId: ORG,
    ownerUserId: OWNER,
    name: "Warm Market",
    phone: "9543095184",
    promotedProspectId: null,
    promotedClientId: null,
    ...overrides
  };
}

function memoryMapStore(seed = [], idKey = "id") {
  const rows = new Map(seed.map((row) => [row[idKey], { ...row }]));
  return {
    async save(row) {
      const saved = { ...row, id: row.id || require("crypto").randomUUID() };
      rows.set(saved.id, saved);
      return { ...saved };
    },
    async findById(id, organizationId) {
      const row = rows.get(id);
      if (!row) return null;
      if (organizationId && row.organizationId !== organizationId) return null;
      return { ...row };
    },
    async findByAgendaContactId(agendaContactId, organizationId) {
      return (
        [...rows.values()].find(
          (row) =>
            row.agendaContactId === agendaContactId &&
            (!organizationId || row.organizationId === organizationId)
        ) || null
      );
    }
  };
}

function installRecoveryStores({
  appointments = [],
  contacts = [],
  clients = [],
  prospects = [],
  recruits = []
} = {}) {
  const appointmentStore = memoryMapStore(appointments);
  const contactStore = memoryMapStore(contacts);
  const clientStore = memoryMapStore(clients);
  const recruitStore = createMemoryAgendaRecruitStore(recruits);
  let prospectInserts = 0;

  setStoresForTests({
    appointments: appointmentStore,
    contacts: contactStore,
    clients: {
      ...clientStore,
      async findByAgendaContactId(id, organizationId) {
        return clientStore.findByAgendaContactId(id, organizationId);
      }
    },
    recruits: recruitStore,
    findProspect: async (phone) =>
      prospects.find((row) => !phone || String(row.phone).includes(String(phone).replace(/\D/g, "").slice(-10))) ||
      null,
    promoteToClient: async (appointmentId, _input, context) => {
      const appointment = await appointmentStore.findById(appointmentId, context.organizationId);
      const contact = await contactStore.findById(appointment.agendaContactId, context.organizationId);
      const existing = await clientStore.findByAgendaContactId(contact.id, context.organizationId);
      if (existing) {
        return { alreadyPromoted: true, created: false, clientId: existing.id, client: existing, appointment };
      }
      const client = await clientStore.save({
        organizationId: context.organizationId,
        agendaContactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        ownerUserId: contact.ownerUserId
      });
      const savedAppointment = await appointmentStore.save({
        ...appointment,
        metadata: {
          ...appointment.metadata,
          promotedToClient: true,
          promotedClientId: client.id,
          promotionPending: false
        }
      });
      return { alreadyPromoted: false, created: true, clientId: client.id, client, appointment: savedAppointment };
    }
  });

  return {
    appointmentStore,
    contactStore,
    clientStore,
    recruitStore,
    prospectInserts: () => prospectInserts
  };
}

test("docs: BR-206 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-206/);
  assert.match(rules, /atlas_agenda_recruits/);
});

test("A) manual agenda → client", () => {
  const plan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_CLIENT,
    appointment: appointmentFixture({
      id: LEIDY_APPT,
      agendaContactId: LEIDY_CONTACT,
      status: "completed",
      outcome: "client",
      metadata: {
        standaloneAgenda: true,
        promotionPending: true,
        agendaContactName: "Leidy Scull",
        agendaContactPhone: "9543095184"
      }
    }),
    contact: contactFixture({
      id: LEIDY_CONTACT,
      name: "Leidy Scull"
    }),
    existingProspect: {
      id: LEIDY_PROSPECT,
      name: "Leidy",
      phone: "+19543095184"
    }
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.wouldCreate.some((row) => row.entity === "atlas_agenda_clients"), true);
  assert.equal(plan.kpiEffects.clientsDelta, 1);
  assert.equal(plan.kpiEffects.recruitsDelta, 0);
  assert.equal(plan.kpiEffects.existingProspectUnchanged, true);
});

test("B) manual agenda → recruit without prospect", () => {
  const plan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_RECRUIT,
    appointment: appointmentFixture({
      id: ALEJANDRO_APPT,
      agendaContactId: ALEJANDRO_CONTACT,
      metadata: {
        standaloneAgenda: true,
        agendaContactName: "Aeljando",
        agendaContactPhone: null
      }
    }),
    contact: contactFixture({
      id: ALEJANDRO_CONTACT,
      name: "Aeljando",
      phone: null
    }),
    recruiter: {
      agendaContactId: LEIDY_CONTACT,
      displayName: "Leidy Scull"
    },
    displayName: "Alejandro"
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.wouldCreate.some((row) => row.entity === "atlas_agenda_recruits"), true);
  assert.equal(
    plan.wouldNotChange.some((row) => row.reason === "recruit_evidence_does_not_fabricate_a_prospect"),
    true
  );
});

test("C) manual agenda → recruit + client", () => {
  const plan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_RECRUIT_AND_CLIENT,
    appointment: appointmentFixture({ id: ALEJANDRO_APPT, agendaContactId: ALEJANDRO_CONTACT }),
    contact: contactFixture({ id: ALEJANDRO_CONTACT, name: "Aeljando", phone: null }),
    recruiter: { agendaContactId: LEIDY_CONTACT, displayName: "Leidy Scull" },
    displayName: "Alejandro"
  });
  assert.deepEqual(plan.resultingOutcomes.sort(), ["client", "recruited"]);
  assert.equal(plan.primaryOutcome, "completed");
  assert.equal(plan.kpiEffects.clientsDelta, 1);
  assert.equal(plan.kpiEffects.recruitsDelta, 1);
});

test("D) recruiter differs from appointment owner", () => {
  const plan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_RECRUIT,
    appointment: appointmentFixture(),
    contact: contactFixture(),
    recruiter: { agendaContactId: LEIDY_CONTACT, displayName: "Leidy Scull" }
  });
  assert.equal(plan.appointmentAttribution.ownerUserId, OWNER);
  assert.equal(plan.recruiterAttribution.displayName, "Leidy Scull");
  assert.notEqual(plan.recruiterAttribution.agendaContactId, OWNER);
  assert.equal(plan.kpiEffects.recruitCredit.notAppointmentOwner, true);
});

test("E) existing prospect is linked, not duplicated", () => {
  const plan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_CLIENT,
    appointment: appointmentFixture({ prospectId: null }),
    contact: contactFixture(),
    existingProspect: { id: LEIDY_PROSPECT, phone: "+19543095184" }
  });
  assert.equal(plan.wouldLink.some((row) => row.entity === "prospects" && row.id === LEIDY_PROSPECT), true);
  assert.equal(plan.wouldCreate.some((row) => row.entity === "prospects"), false);
});

test("F) recruit recovery without prospect does not fabricate prospect", async () => {
  installRecoveryStores({
    appointments: [
      appointmentFixture({
        id: ALEJANDRO_APPT,
        agendaContactId: ALEJANDRO_CONTACT,
        metadata: { standaloneAgenda: true, agendaContactName: "Aeljando" }
      })
    ],
    contacts: [contactFixture({ id: ALEJANDRO_CONTACT, name: "Aeljando", phone: null })]
  });
  const first = await recoverAgendaOutcome(
    ALEJANDRO_APPT,
    {
      action: RECOVERY_ACTIONS.RECORD_RECRUIT,
      dryRun: false,
      recruiter: { agendaContactId: LEIDY_CONTACT, displayName: "Leidy Scull" },
      displayName: "Alejandro"
    },
    { organizationId: ORG, userId: OWNER }
  );
  assert.equal(first.executed, true);
  assert.ok(first.recruit?.id);
  assert.equal(first.prospect, null);
});

test("G) dual outcome is idempotent", async () => {
  const stores = installRecoveryStores({
    appointments: [
      appointmentFixture({
        id: ALEJANDRO_APPT,
        agendaContactId: ALEJANDRO_CONTACT,
        metadata: { standaloneAgenda: true, agendaContactName: "Aeljando" }
      })
    ],
    contacts: [contactFixture({ id: ALEJANDRO_CONTACT, name: "Aeljando", phone: null })]
  });
  const payload = {
    action: RECOVERY_ACTIONS.RECORD_RECRUIT_AND_CLIENT,
    dryRun: false,
    recruiter: { agendaContactId: LEIDY_CONTACT, displayName: "Leidy Scull" },
    displayName: "Alejandro"
  };
  const first = await recoverAgendaOutcome(ALEJANDRO_APPT, payload, { organizationId: ORG, userId: OWNER });
  const second = await recoverAgendaOutcome(ALEJANDRO_APPT, payload, { organizationId: ORG, userId: OWNER });
  const recruits = await stores.recruitStore.listForOrganization(ORG);
  assert.equal(first.created.recruit, true);
  assert.equal(second.created.recruit, false);
  assert.equal(recruits.length, 1);
});

test("H) client KPI derives from client evidence", () => {
  const kpis = deriveAgendaOutcomeKpis({
    clients: [{ id: "c1" }, { id: "c2" }],
    recruits: [],
    appointments: [{ id: "a1" }]
  });
  assert.equal(kpis.clientCount, 2);
  assert.equal(kpis.recruitCount, 0);
});

test("I) recruit KPI derives from recruiter-attributed evidence", () => {
  const kpis = deriveAgendaOutcomeKpis({
    recruits: [
      { recruiterAgendaContactId: LEIDY_CONTACT, recruiterDisplayName: "Leidy Scull" },
      { recruiterUserId: OWNER, recruiterDisplayName: "Niovel Perez" }
    ]
  });
  assert.equal(kpis.recruitCount, 2);
  assert.equal(kpis.recruitsByRecruiter[LEIDY_CONTACT], 1);
  assert.equal(kpis.recruitsByRecruiter[OWNER], 1);
});

test("J) production split does not double count premium", () => {
  const invalid = validateProductionSplits({
    totalPremium: 1000,
    attributions: [
      { agentUserId: "n1", splitPercent: 60, creditedAmount: 600 },
      { agentUserId: "n2", splitPercent: 50, creditedAmount: 500 }
    ]
  });
  assert.equal(invalid.ok, false);

  const valid = validateProductionSplits({
    totalPremium: 1000,
    attributions: [
      { agentUserId: "n1", splitPercent: 60, creditedAmount: 600 },
      { agentUserId: "n2", splitPercent: 40, creditedAmount: 400 }
    ]
  });
  assert.equal(valid.ok, true);

  const kpi = deriveProductionKpi(
    [{ id: "p1", amount: 1000 }],
    [
      { agentUserId: "n1", creditedAmount: 600 },
      { agentUserId: "n2", creditedAmount: 400 }
    ]
  );
  assert.equal(kpi.totalPremium, 1000);
  assert.equal(kpi.policyCount, 1);
});

test("K) past manual agenda remains recoverable after local date passes", () => {
  const filters = resolveAppointmentViewFilters(
    "past_unresolved",
    new Date("2026-09-01T16:00:00.000-04:00"),
    { organizationId: ORG }
  );
  const past = appointmentFixture({
    startDateTime: "2026-09-01T00:00:00.000Z",
    metadata: { standaloneAgenda: true }
  });
  const todayItem = appointmentFixture({
    startDateTime: "2026-09-01T18:00:00.000Z",
    metadata: { standaloneAgenda: true }
  });
  assert.equal(matchesListFilters(past, filters, new Date("2026-09-01T16:00:00.000-04:00")), true);
  assert.equal(matchesListFilters(todayItem, filters, new Date("2026-09-01T16:00:00.000-04:00")), false);
});

test("L) BR-197 Today’s Agenda still excludes yesterday", () => {
  const filters = resolveAppointmentViewFilters(
    "today",
    new Date("2026-09-01T16:00:00.000-04:00"),
    { organizationId: ORG }
  );
  const yesterday = appointmentFixture({
    startDateTime: "2026-08-31T16:30:00.000Z",
    metadata: { standaloneAgenda: true }
  });
  assert.equal(matchesListFilters(yesterday, filters, new Date("2026-09-01T16:00:00.000-04:00")), false);
});

test("recruit without explicit recruiter is blocked", () => {
  const plan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_RECRUIT,
    appointment: appointmentFixture(),
    contact: contactFixture()
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.blocked[0].code, "RECRUITER_REQUIRED");
});

test("migration creates recruit evidence and production attribution tables", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/071_br206_agenda_outcome_evidence.sql"),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS atlas_agenda_recruits/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS atlas_client_production_attributions/i);
  assert.match(sql, /REVOKE ALL ON TABLE atlas_agenda_recruits FROM anon, authenticated/i);
});

void createMemoryProductionAttributionStore;
