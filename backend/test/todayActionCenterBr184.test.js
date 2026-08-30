/**
 * BR-184 — Today / Action Center.
 * Synthetic fixtures only. No live tenant data, WhatsApp, SMS, or email.
 */

process.env.NODE_ENV = "test";
process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT || "1";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const todayService = require("../application/todayActionCenterApplicationService");
const followUpApplicationService = require("../application/followUpApplicationService");
const agentNotificationService = require("../services/agentNotificationService");
const clientDocumentsApplicationService = require("../application/clientDocumentsApplicationService");
const { createMemoryFollowUpStore } = require("../core/followUps");
const { createMemoryNotificationStore, EVENT_TYPES } = require("../core/agentNotifications");
const { DOCUMENT_REQUEST_STATUSES } = require("../core/clientDocuments");
const { emptyToday } = require("../core/operationalControlPlane");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { TODAY_FILTERS, TODAY_PRIORITIES } = require("../core/today/todayConstants");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const PROSPECT_NA = "51000000-0000-4000-8000-000000000001";
const PROSPECT_HEALED = "51000000-0000-4000-8000-000000000002";
const PROSPECT_NEW = "51000000-0000-4000-8000-000000000004";
const CLIENT_ID = "32000000-0000-4000-8000-000000000001";
const APPT_TODAY = "61000000-0000-4000-8000-000000000001";
const APPT_TOMORROW = "61000000-0000-4000-8000-000000000002";
const REFERENCE = new Date("2026-08-30T16:00:00.000Z");

function auth(userId = USER_A, extras = {}) {
  return {
    userId,
    organizationId: extras.organizationId || ORG_A,
    role: extras.role || "agent",
    status: extras.status || "active",
    hierarchyMode: extras.hierarchyMode || HIERARCHY_MODES.SELF,
    hierarchyUserIds: extras.hierarchyUserIds || [userId],
    ...extras
  };
}

function prospect(overrides = {}) {
  return {
    id: PROSPECT_NEW,
    phone: "+15550001111",
    name: "New Lead",
    organization_id: ORG_A,
    owner_user_id: USER_A,
    current_step: "NEW",
    status: "NEW",
    attention_status: "new",
    acknowledged_at: null,
    needs_human_attention: false,
    ...overrides
  };
}

function appointment(overrides = {}) {
  return {
    id: APPT_TODAY,
    organizationId: ORG_A,
    agentId: USER_A,
    prospectId: PROSPECT_NEW,
    prospectPhone: "+15550001111",
    prospectName: "Alex Interview",
    purpose: "recruiting_interview",
    status: "scheduled",
    startDateTime: "2026-08-30T20:00:00.000Z",
    ...overrides
  };
}

async function loadToday(options = {}) {
  return todayService.getToday({
    organizationId: options.organizationId || ORG_A,
    authContext: options.authContext || auth(),
    scope: options.scope || "mine",
    filter: options.filter,
    reference: options.reference || REFERENCE,
    sources: options.sources
  });
}

test.beforeEach(() => {
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
  agentNotificationService.setStoreForTests(createMemoryNotificationStore());
  clientDocumentsApplicationService.setStoresForTests({
    requests: clientDocumentsApplicationService.createMemoryDocumentRequestStore(),
    documents: clientDocumentsApplicationService.createMemoryDocumentStore(),
    storage: clientDocumentsApplicationService.createMemoryObjectStorage(),
    findClient: async (id, organizationId) => {
      if (id !== CLIENT_ID || organizationId !== ORG_A) return null;
      return {
        id: CLIENT_ID,
        organizationId: ORG_A,
        ownerUserId: USER_A,
        name: "Alex Client"
      };
    },
    findServiceCase: async () => null,
    findProduction: async () => null
  });
  todayService.setSourcesForTests({
    loadProspects: async () => [],
    loadAppointments: async () => [],
    timezoneDeps: {
      getOrganizationSettings: () => ({ timezone: "America/New_York" }),
      getOrganizationProfileTimezone: () => "America/New_York"
    },
    listFollowUps: (...args) => followUpApplicationService.listFollowUps(...args),
    listNotifications: (...args) => agentNotificationService.listMyNotifications(...args),
    listDocumentRequests: (options) => clientDocumentsApplicationService.listDocumentRequests(options),
    listServiceCases: async () => ({ items: [] })
  });
});

test.afterEach(() => {
  followUpApplicationService.setStoreForTests(null);
  agentNotificationService.setStoreForTests(null);
  clientDocumentsApplicationService.setStoresForTests({});
  todayService.setSourcesForTests(null);
});

test("appointment today appears and tomorrow does not", async () => {
  todayService.setSourcesForTests({
    loadAppointments: async () => [
      appointment(),
      appointment({
        id: APPT_TOMORROW,
        startDateTime: "2026-08-31T16:00:00.000Z",
        prospectName: "Tomorrow Interview"
      })
    ]
  });
  const payload = await loadToday();
  assert.equal(payload.counts.appointmentsToday, 1);
  assert.equal(payload.items[0].kind, "appointment");
  assert.equal(payload.items[0].entityId, APPT_TODAY);
  assert.equal(payload.items[0].personName, "Alex Interview");
  assert.equal(payload.items[0].openPath, `/app/appointments?appointmentId=${APPT_TODAY}`);
  assert.doesNotMatch(payload.items[0].whenLabel, /[0-9a-f-]{36}/i);
  assert.equal(
    payload.items.some((item) => item.entityId === APPT_TOMORROW),
    false
  );
});

test("overdue and due-today follow-ups appear; upcoming future follow-up does not", async () => {
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: PROSPECT_NEW,
      subjectLabel: "Due Today Prospect",
      dueDate: "2026-08-30",
      title: "Call today",
      reference: REFERENCE
    },
    auth()
  );
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: "51000000-0000-4000-8000-000000000099",
      subjectLabel: "Overdue Prospect",
      dueDate: "2026-08-28",
      title: "Missed call",
      reference: REFERENCE
    },
    auth()
  );
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: "51000000-0000-4000-8000-000000000077",
      subjectLabel: "Next week",
      dueDate: "2026-09-04",
      title: "Future call",
      reference: REFERENCE
    },
    auth()
  );

  const payload = await loadToday();
  const followUps = payload.items.filter((item) => item.kind === "follow_up");
  assert.deepEqual(followUps.map((item) => item.status).sort(), ["due-today", "overdue"]);
  assert.equal(payload.counts.overdue, 1);
  assert.equal(payload.counts.dueToday, 1);
  assert.equal(followUps[0].priority, TODAY_PRIORITIES.OVERDUE);
  assert.equal(
    payload.items.some((item) => item.title === "Future call"),
    false
  );
});

test("undated follow-up is not falsely overdue", async () => {
  todayService.setSourcesForTests({
    listFollowUps: async () => ({
      items: [
        {
          id: "legacy:+15550001999:none",
          source: "legacy",
          status: "needs-date",
          dueDate: null,
          dueAt: null,
          name: "Undated Follow-up",
          title: "Needs More Time",
          entityType: "prospect",
          entityId: PROSPECT_NEW,
          ownerUserId: USER_A
        }
      ]
    })
  });
  const payload = await loadToday();
  assert.equal(payload.items.length, 0);
  assert.equal(payload.counts.overdue, 0);
  assert.equal(payload.caughtUp, true);
});

test("real Needs Attention appears and healed BR-080 stale case does not", async () => {
  todayService.setSourcesForTests({
    loadProspects: async () => [
      prospect({
        id: PROSPECT_NA,
        name: "Takeover Case",
        phone: "+15550001001",
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        needs_human_attention: true
      }),
      prospect({
        id: PROSPECT_HEALED,
        name: "Healed SLA",
        phone: "+15550001002",
        attention_status: "waiting_for_prospect",
        human_attention_reason: "unacknowledged_sla_15m",
        needs_human_attention: true
      })
    ]
  });
  const payload = await loadToday();
  assert.equal(payload.counts.needsAttention, 1);
  assert.equal(payload.items[0].entityId, PROSPECT_NA);
  assert.equal(
    payload.items.some((item) => item.entityId === PROSPECT_HEALED),
    false
  );
});

test("overdue and due-today document requests appear; Needs Date / upcoming / fulfilled do not", async () => {
  await clientDocumentsApplicationService.createDocumentRequest(
    { organizationId: ORG_A, clientId: CLIENT_ID, title: "Overdue request", dueDate: "2026-08-20", reference: REFERENCE },
    auth()
  );
  await clientDocumentsApplicationService.createDocumentRequest(
    { organizationId: ORG_A, clientId: CLIENT_ID, title: "Due today request", dueDate: "2026-08-30", reference: REFERENCE },
    auth()
  );
  await clientDocumentsApplicationService.createDocumentRequest(
    { organizationId: ORG_A, clientId: CLIENT_ID, title: "Needs date request", reference: REFERENCE },
    auth()
  );
  await clientDocumentsApplicationService.createDocumentRequest(
    { organizationId: ORG_A, clientId: CLIENT_ID, title: "Upcoming request", dueDate: "2026-09-12", reference: REFERENCE },
    auth()
  );
  const fulfilled = await clientDocumentsApplicationService.createDocumentRequest(
    { organizationId: ORG_A, clientId: CLIENT_ID, title: "Fulfilled request", dueDate: "2026-08-20", reference: REFERENCE },
    auth()
  );
  await clientDocumentsApplicationService.updateRequestStatus(
    fulfilled.id,
    { organizationId: ORG_A, status: DOCUMENT_REQUEST_STATUSES.COMPLETED },
    auth()
  );

  const payload = await loadToday();
  const docs = payload.items.filter((item) => item.kind === "document_request");
  assert.deepEqual(docs.map((item) => item.title).sort(), ["Due today request", "Overdue request"]);
  assert.equal(docs.every((item) => item.openPath === `/app/clients/${CLIENT_ID}`), true);
  assert.equal(
    payload.items.some((item) => /Needs date|Upcoming|Fulfilled/.test(item.title)),
    false
  );
});

test("canonical obligation is not duplicated by a notification", async () => {
  const created = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: PROSPECT_NEW,
      subjectLabel: "Due Today Prospect",
      dueDate: "2026-08-30",
      title: "Call today",
      reference: REFERENCE
    },
    auth()
  );
  await agentNotificationService.notifyOperationalEvent({
    eventType: EVENT_TYPES.FOLLOW_UP_DUE,
    organizationId: ORG_A,
    recipientUserId: USER_A,
    ownerUserId: USER_A,
    entityType: "follow_up",
    entityId: created.followUp.id,
    title: "Follow-up due",
    actionUrl: "/app/follow-ups"
  });
  const payload = await loadToday();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].kind, "follow_up");
  assert.equal(payload.sections.notifications.length, 0);
});

test("distinct HUMAN_TAKEOVER_REQUESTED appears when the conversation is not already on Today", async () => {
  await agentNotificationService.notifyOperationalEvent({
    eventType: EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED,
    organizationId: ORG_A,
    recipientUserId: USER_A,
    ownerUserId: USER_A,
    entityType: "prospect",
    entityId: PROSPECT_NA,
    title: "Takeover needed",
    actionUrl: `/app/conversations?prospectId=${PROSPECT_NA}`
  });
  const payload = await loadToday();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].kind, "human_takeover");
  assert.equal(payload.counts.needsAttention, 1);
});

test("My scope isolates owners; Team scope requires hierarchy", async () => {
  todayService.setSourcesForTests({
    loadProspects: async () => [
      prospect({
        id: PROSPECT_NA,
        name: "Peer NA",
        owner_user_id: USER_B,
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        needs_human_attention: true
      })
    ],
    loadAppointments: async () => [appointment({ agentId: USER_B })]
  });
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: PROSPECT_NA,
      ownerUserId: USER_B,
      subjectLabel: "Peer Follow-up",
      dueDate: "2026-08-30",
      title: "Peer call",
      reference: REFERENCE
    },
    auth(USER_B)
  );

  const mine = await loadToday({ authContext: auth(USER_A), scope: "team" });
  assert.equal(mine.scope, "mine");
  assert.equal(mine.teamAvailable, false);
  assert.equal(mine.items.length, 0);

  const team = await loadToday({
    authContext: auth(USER_A, {
      role: "administrator",
      hierarchyMode: HIERARCHY_MODES.ORGANIZATION,
      hierarchyUserIds: [USER_A, USER_B]
    }),
    scope: "team"
  });
  assert.equal(team.scope, "team");
  assert.equal(team.teamAvailable, true);
  assert.ok(team.items.length >= 2);
});

test("wrong-org entities fail closed on Today", async () => {
  todayService.setSourcesForTests({
    loadProspects: async () => [
      prospect({
        organization_id: ORG_B,
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        needs_human_attention: true
      })
    ],
    loadAppointments: async () => [appointment({ organizationId: ORG_B })]
  });
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_B,
      entityType: "prospect",
      entityId: PROSPECT_NEW,
      subjectLabel: "Other org",
      dueDate: "2026-08-30",
      reference: REFERENCE
    },
    auth(USER_A, { organizationId: ORG_B })
  );
  const payload = await loadToday();
  assert.equal(payload.caughtUp, true);
  assert.equal(payload.items.length, 0);
});

test("Super Admin control-plane Today is empty", () => {
  const empty = emptyToday();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.caughtUp, true);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.organizationId, null);
});

test("Support Mode stays tenant-bound", async () => {
  todayService.setSourcesForTests({
    loadProspects: async () => [
      prospect({
        organization_id: ORG_A,
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        needs_human_attention: true,
        name: "Tenant A"
      }),
      prospect({
        id: PROSPECT_HEALED,
        organization_id: ORG_B,
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        needs_human_attention: true,
        name: "Tenant B"
      })
    ]
  });
  const bound = await loadToday({
    organizationId: ORG_A,
    authContext: auth(USER_A, {
      role: "administrator",
      hierarchyMode: HIERARCHY_MODES.ORGANIZATION
    }),
    scope: "team"
  });
  assert.equal(bound.counts.needsAttention, 1);
  assert.equal(bound.items[0].personName, "Tenant A");
});

test("completing a follow-up refreshes Today items and counts", async () => {
  const created = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: PROSPECT_NEW,
      subjectLabel: "Complete me",
      dueDate: "2026-08-30",
      title: "Due now",
      reference: REFERENCE
    },
    auth()
  );
  const before = await loadToday();
  assert.equal(before.counts.dueToday, 1);
  await followUpApplicationService.completeFollowUp(
    created.followUp.id,
    { organizationId: ORG_A, completionNote: "Done" },
    auth()
  );
  const after = await loadToday();
  assert.equal(after.items.length, 0);
  assert.equal(after.caughtUp, true);
});

test("filters return the matching subset without changing unfiltered counts", async () => {
  todayService.setSourcesForTests({
    loadAppointments: async () => [appointment()]
  });
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: PROSPECT_NEW,
      subjectLabel: "Overdue Prospect",
      dueDate: "2026-08-28",
      title: "Missed call",
      reference: REFERENCE
    },
    auth()
  );
  const all = await loadToday({ filter: TODAY_FILTERS.ALL });
  const overdue = await loadToday({ filter: TODAY_FILTERS.OVERDUE });
  const appointments = await loadToday({ filter: TODAY_FILTERS.APPOINTMENTS });
  assert.equal(all.counts.overdue, 1);
  assert.equal(all.counts.appointmentsToday, 1);
  assert.equal(overdue.counts.overdue, 1);
  assert.equal(overdue.items.every((item) => item.priority === "overdue"), true);
  assert.equal(appointments.items.every((item) => item.kind === "appointment"), true);
});

test("BR-184 stays aggregation-only and does not poll the Today page", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "../application/todayActionCenterApplicationService.js"),
    "utf8"
  );
  const page = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/TodayPage.jsx"), "utf8");
  const recruitDecision = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"), "utf8");
  assert.match(service, /Read model only/);
  assert.match(service, /includeLegacy:\s*true/);
  assert.doesNotMatch(service, /due_date\s+IS\s+NULL|ALTER TABLE atlas_follow_ups/i);
  assert.doesNotMatch(page, /setInterval/);
  assert.match(page, /visibilitychange/);
  assert.doesNotMatch(recruitDecision, /todayActionCenterApplicationService/);
});
