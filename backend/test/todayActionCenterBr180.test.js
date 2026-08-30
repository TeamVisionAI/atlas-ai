/**
 * BR-180 — Today / Action Center.
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
const { actorContext } = require("../routes/today");
const followUpApplicationService = require("../application/followUpApplicationService");
const agentNotificationService = require("../services/agentNotificationService");
const { createMemoryFollowUpStore } = require("../core/followUps");
const { createMemoryNotificationStore, EVENT_TYPES } = require("../core/agentNotifications");
const { emptyToday } = require("../core/operationalControlPlane");
const {
  isHealedBr080Stale,
  isRealNeedsAttention,
  isActionableNewLead,
  isTodayProspectCandidate,
  hasTodayAttentionSignal
} = require("../core/today/todayPresentation");
const { isOperationalProspectRecord } = require("../core/prospectPromotionEligibility");
const { FOLLOW_UP_VIEW_STATUSES } = require("../core/followUps");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const PROSPECT_NA = "51000000-0000-4000-8000-000000000001";
const PROSPECT_HEALED = "51000000-0000-4000-8000-000000000002";
const PROSPECT_ANSWERED = "51000000-0000-4000-8000-000000000003";
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

/** Persisted CRM shape without BR-159 promotion / lifecycle evidence. */
function persistedAttentionProspect(overrides = {}) {
  return prospect({
    source: "manual",
    entry_method: "manual",
    current_step: "NEW",
    status: "NEW",
    workflow_state: null,
    ...overrides
  });
}

function br178LegacyNeedsDate(overrides = {}) {
  return {
    id: "legacy:+15550001999:none",
    source: "legacy",
    status: FOLLOW_UP_VIEW_STATUSES.NEEDS_DATE,
    dueDate: null,
    dueTime: null,
    followUpDate: null,
    followUpTime: null,
    followUpAtMs: null,
    name: "Undated Follow-up",
    title: "Needs More Time",
    followUpReason: "Needs More Time",
    entityType: "prospect",
    entityId: PROSPECT_ANSWERED,
    phone: "+15550001999",
    ownerUserId: USER_A,
    representativeId: USER_A,
    canManage: false,
    canSetDate: true,
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

function useRealFollowUps() {
  todayService.setSourcesForTests({
    listFollowUps: (...args) => followUpApplicationService.listFollowUps(...args)
  });
}

function useRealNotifications() {
  todayService.setSourcesForTests({
    listNotifications: (...args) => agentNotificationService.listMyNotifications(...args)
  });
}

async function loadToday(options = {}) {
  return todayService.getToday({
    organizationId: options.organizationId || ORG_A,
    authContext: options.authContext || auth(),
    scope: options.scope || "mine",
    reference: options.reference || REFERENCE,
    sources: options.sources
  });
}

test.beforeEach(() => {
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
  agentNotificationService.setStoreForTests(createMemoryNotificationStore());
  todayService.setSourcesForTests({
    loadProspects: async () => [],
    loadAppointments: async () => [],
    timezoneDeps: {
      getOrganizationSettings: () => ({ timezone: "America/New_York" }),
      getOrganizationProfileTimezone: () => "America/New_York"
    },
    listFollowUps: async () => ({
      items: [],
      scope: "mine",
      teamAvailable: false
    }),
    listNotifications: async () => []
  });
});

test.afterEach(() => {
  followUpApplicationService.setStoreForTests(null);
  agentNotificationService.setStoreForTests(null);
  todayService.setSourcesForTests(null);
});

test("empty Today is caught up and counts are zero", async () => {
  const payload = await loadToday();
  assert.equal(payload.caughtUp, true);
  assert.equal(payload.counts.needsAttention, 0);
  assert.equal(payload.counts.appointmentsToday, 0);
  assert.equal(payload.counts.followUpsDueOverdue, 0);
  assert.equal(payload.counts.newActionable, 0);
  assert.equal(payload.sections.needsAttention.length, 0);
  assert.equal(payload.today, "2026-08-30");
  assert.equal(payload.timeZone, "America/New_York");
});

test("real Needs Attention appears and healed BR-080 stale case does not", async () => {
  const real = prospect({
    id: PROSPECT_NA,
    name: "Takeover Case",
    phone: "+15550001001",
    attention_status: "human_required",
    human_attention_reason: "provider_send_failed",
    needs_human_attention: true
  });
  const healed = prospect({
    id: PROSPECT_HEALED,
    name: "Healed SLA",
    phone: "+15550001002",
    attention_status: "waiting_for_prospect",
    human_attention_reason: "unacknowledged_sla_15m",
    needs_human_attention: true
  });

  assert.equal(isRealNeedsAttention(real), true);
  assert.equal(isHealedBr080Stale(healed), true);
  assert.equal(isRealNeedsAttention(healed), false);

  todayService.setSourcesForTests({
    loadProspects: async () => [real, healed],
    loadAppointments: async () => []
  });

  const payload = await loadToday();
  assert.equal(payload.counts.needsAttention, 1);
  assert.equal(payload.sections.needsAttention[0].entityId, PROSPECT_NA);
  assert.match(payload.sections.needsAttention[0].href, /prospect-workspace/);
  assert.equal(
    payload.sections.needsAttention.some((item) => item.entityId === PROSPECT_HEALED),
    false
  );
});

test("persisted owned human_required appears even without BR-159 pipeline evidence", async () => {
  const persistedNa = persistedAttentionProspect({
    id: PROSPECT_NA,
    name: "Persisted Takeover",
    phone: "+15550001011",
    attention_status: "human_required",
    human_attention_reason: "provider_send_failed",
    needs_human_attention: true
  });
  const noSignal = persistedAttentionProspect({
    id: "51000000-0000-4000-8000-000000000088",
    name: "No Attention Signal",
    phone: "+15550001018",
    attention_status: null,
    new_lead_received_at: null,
    needs_human_attention: false
  });

  assert.equal(isOperationalProspectRecord(persistedNa), false);
  assert.equal(hasTodayAttentionSignal(persistedNa), true);
  assert.equal(isTodayProspectCandidate(persistedNa), true);
  assert.equal(isTodayProspectCandidate(noSignal), false);
  assert.equal(isRealNeedsAttention(persistedNa), true);

  todayService.setSourcesForTests({
    loadProspects: async () => [persistedNa, noSignal],
    loadAppointments: async () => []
  });

  const payload = await loadToday();
  assert.equal(payload.counts.needsAttention, 1);
  assert.equal(payload.sections.needsAttention[0].entityId, PROSPECT_NA);
  assert.equal(
    payload.sections.newLeads.some((item) => item.entityId === noSignal.id),
    false
  );
});

test("unowned persisted attention prospect is excluded from My Today", async () => {
  todayService.setSourcesForTests({
    loadProspects: async () => [
      persistedAttentionProspect({
        id: PROSPECT_NA,
        name: "Unowned NA",
        phone: "+15550001012",
        owner_user_id: null,
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        needs_human_attention: true
      }),
      persistedAttentionProspect({
        id: PROSPECT_NEW,
        name: "Unowned New",
        phone: "+15550001013",
        owner_user_id: null,
        attention_status: "new",
        new_lead_received_at: "2026-08-30T12:00:00.000Z"
      })
    ],
    loadAppointments: async () => []
  });

  const payload = await loadToday({ authContext: auth(USER_A), scope: "mine" });
  assert.equal(payload.scope, "mine");
  assert.equal(payload.counts.needsAttention, 0);
  assert.equal(payload.counts.newActionable, 0);
  assert.equal(payload.caughtUp, true);
});

test("today appointment appears in org timezone and tomorrow does not", async () => {
  todayService.setSourcesForTests({
    loadProspects: async () => [],
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
  assert.equal(payload.sections.appointmentsToday[0].entityId, APPT_TODAY);
  assert.equal(payload.sections.appointmentsToday[0].whenLabel, "4:00 PM");
  assert.doesNotMatch(payload.sections.appointmentsToday[0].whenLabel, /T\d{2}:\d{2}/);
  assert.equal(payload.sections.appointmentsToday[0].href, `/app/appointments?appointmentId=${APPT_TODAY}`);
});

test("overdue and due-today durable follow-ups classify correctly", async () => {
  useRealFollowUps();

  const dueToday = await followUpApplicationService.createManualFollowUp(
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
  const overdue = await followUpApplicationService.createManualFollowUp(
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

  const payload = await loadToday();
  const statuses = payload.sections.followUps.map((item) => item.status).sort();
  assert.deepEqual(statuses, ["due-today", "overdue"]);
  assert.equal(payload.counts.followUpsDueOverdue, 2);
  assert.ok(payload.sections.followUps.find((item) => item.source?.id === dueToday.followUp.id));
  assert.ok(payload.sections.followUps.find((item) => item.source?.id === overdue.followUp.id));
});

test("legacy undated BR-178 follow-up appears as Needs Date, not Overdue", async () => {
  const legacyNeedsDate = br178LegacyNeedsDate();
  todayService.setSourcesForTests({
    listFollowUps: async (args) => {
      const payload = await followUpApplicationService.listFollowUps({
        ...args,
        includeLegacy: true
      });
      return {
        ...payload,
        items: [...(payload.items || []), legacyNeedsDate]
      };
    }
  });

  const payload = await loadToday();
  const needsDate = payload.sections.followUps.find((item) => item.status === "needs-date");
  assert.ok(needsDate);
  assert.equal(needsDate.source?.source, "legacy");
  assert.equal(needsDate.source?.dueDate, null);
  assert.equal(needsDate.displayPriority, 60);
  assert.equal(payload.counts.followUpsDueOverdue, 0);
  assert.equal(
    payload.sections.followUps.some((item) => item.status === "overdue"),
    false
  );
});

test("client follow-up appears and links to the client workspace", async () => {
  useRealFollowUps();
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "client",
      entityId: CLIENT_ID,
      subjectLabel: "Alex Client",
      dueDate: "2026-08-30",
      title: "Service check-in",
      reference: REFERENCE
    },
    auth()
  );

  const payload = await loadToday();
  assert.equal(payload.sections.followUps.length, 1);
  assert.equal(payload.sections.followUps[0].entityType, "client");
  assert.equal(payload.sections.followUps[0].href, `/app/clients/${CLIENT_ID}`);
});

test("Atlas-answered New lead is not actionable; true unhandled lead is", async () => {
  const answered = persistedAttentionProspect({
    id: PROSPECT_ANSWERED,
    name: "Atlas Answered",
    phone: "+15550001003",
    attention_status: "waiting_for_prospect",
    new_lead_received_at: "2026-08-30T12:00:00.000Z"
  });
  const unhandled = persistedAttentionProspect({
    id: PROSPECT_NEW,
    name: "Unhandled Lead",
    phone: "+15550001004",
    attention_status: "new",
    new_lead_received_at: "2026-08-30T12:00:00.000Z"
  });

  assert.equal(isActionableNewLead(answered), false);
  assert.equal(isActionableNewLead(unhandled), true);

  todayService.setSourcesForTests({
    loadProspects: async () => [answered, unhandled],
    loadAppointments: async () => []
  });

  const payload = await loadToday();
  assert.equal(payload.counts.newActionable, 1);
  assert.equal(payload.sections.newLeads[0].entityId, PROSPECT_NEW);
});

test("My scope hides peer work; Team scope shows it only when hierarchy allows", async () => {
  useRealFollowUps();
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
    loadAppointments: async () => [appointment({ agentId: USER_B, prospectName: "Peer Appt" })]
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
  assert.equal(mine.counts.needsAttention, 0);
  assert.equal(mine.counts.appointmentsToday, 0);
  assert.equal(mine.counts.followUpsDueOverdue, 0);

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
  assert.equal(team.counts.needsAttention, 1);
  assert.equal(team.counts.appointmentsToday, 1);
  assert.equal(team.counts.followUpsDueOverdue, 1);
});

test("wrong-org entities fail closed", async () => {
  useRealFollowUps();
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
  assert.equal(payload.counts.needsAttention, 0);
  assert.equal(payload.counts.appointmentsToday, 0);
  assert.equal(payload.counts.followUpsDueOverdue, 0);
});

test("Super Admin control-plane Today is empty", () => {
  const empty = emptyToday();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.caughtUp, true);
  assert.equal(empty.counts.needsAttention, 0);
  assert.equal(empty.sections.appointmentsToday.length, 0);
  assert.equal(empty.organizationId, null);
});

test("Support Mode stays tenant-bound via organization id", async () => {
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
    ],
    loadAppointments: async () => []
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
  assert.equal(bound.sections.needsAttention[0].title, "Tenant A");
});

test("completing a follow-up updates Today items and counts", async () => {
  useRealFollowUps();
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
  assert.equal(before.counts.followUpsDueOverdue, 1);
  assert.equal(before.caughtUp, false);

  await followUpApplicationService.completeFollowUp(
    created.followUp.id,
    { organizationId: ORG_A, completionNote: "Done" },
    auth()
  );

  const after = await loadToday();
  assert.equal(after.counts.followUpsDueOverdue, 0);
  assert.equal(after.sections.followUps.length, 0);
});

test("unread BR-176 notifications appear without a second notification system", async () => {
  useRealNotifications();
  await agentNotificationService.notifyOperationalEvent({
    eventType: EVENT_TYPES.NEEDS_ATTENTION,
    organizationId: ORG_A,
    recipientUserId: USER_A,
    ownerUserId: USER_A,
    entityType: "prospect",
    entityId: PROSPECT_NA,
    title: "Needs attention",
    actionUrl: `/app/conversations?prospectId=${PROSPECT_NA}`
  });

  const payload = await loadToday();
  assert.equal(payload.sections.notifications.length, 1);
  assert.match(payload.sections.notifications[0].href, /conversations/);
});

test("BR-180 routes, refresh, and source boundaries stay aggregation-only", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/today.js"), "utf8");
  const service = fs.readFileSync(
    path.join(__dirname, "../application/todayActionCenterApplicationService.js"),
    "utf8"
  );
  const page = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/TodayPage.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(__dirname, "../../frontend/src/config/workspaceExperience.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../../frontend/src/App.jsx"), "utf8");
  const recruitDecision = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"), "utf8");
  const notifications = fs.readFileSync(path.join(__dirname, "../services/agentNotificationService.js"), "utf8");
  const followUps = fs.readFileSync(path.join(__dirname, "../application/followUpApplicationService.js"), "utf8");

  assert.match(routes, /operationalControlPlaneEmpty\(emptyToday\)/);
  assert.match(routes, /organizationGuard/);
  assert.match(routes, /getTenantOrganizationId/);
  assert.match(service, /Read model only/);
  assert.match(page, /todayCaughtUp/);
  assert.doesNotMatch(page, /setInterval/);
  assert.match(nav, /path: appPath\("today"\)/);
  assert.match(app, /path="today"/);
  assert.doesNotMatch(recruitDecision, /todayActionCenterApplicationService/);
  assert.doesNotMatch(notifications, /todayActionCenterApplicationService/);
  assert.match(followUps, /resolveOwnerFilter/);
  assert.match(service, /includeNonOperationalContacts:\s*true/);
  assert.match(service, /includeLegacy:\s*true/);
  assert.match(service, /isTodayProspectCandidate/);
  assert.doesNotMatch(service, /due_date\s+IS\s+NULL|ALTER TABLE atlas_follow_ups/i);
  assert.doesNotMatch(service, /nullable.*due_date|due_date.*nullable/i);
  assert.match(routes, /\.\.\.context/);
  assert.match(routes, /req\.authContext/);
  assert.doesNotMatch(routes, /status:\s*["']active["']/);
});

test("Today actorContext forwards canonical status; omitting it empties prospect sections", async () => {
  const persistedNa = persistedAttentionProspect({
    id: PROSPECT_NA,
    name: "Persisted Takeover",
    phone: "+15550001021",
    attention_status: "human_required",
    human_attention_reason: "provider_send_failed",
    needs_human_attention: true
  });
  todayService.setSourcesForTests({
    loadProspects: async () => [persistedNa],
    loadAppointments: async () => []
  });

  const reqActive = {
    authContext: auth(USER_A),
    tenantContext: { userId: USER_A, organizationId: ORG_A }
  };
  const fromRoute = actorContext(reqActive);
  assert.equal(fromRoute.status, "active");
  assert.equal(fromRoute.userId, USER_A);
  assert.equal(fromRoute.organizationId, ORG_A);

  const withStatus = await loadToday({ authContext: fromRoute });
  assert.equal(withStatus.counts.needsAttention, 1);
  assert.equal(withStatus.sections.needsAttention[0].entityId, PROSPECT_NA);

  const { status, ...withoutStatus } = auth(USER_A);
  void status;
  const missingStatus = actorContext({
    authContext: withoutStatus,
    tenantContext: { userId: USER_A, organizationId: ORG_A }
  });
  assert.equal(missingStatus.status, undefined);

  const stripped = await loadToday({ authContext: missingStatus });
  assert.equal(stripped.counts.needsAttention, 0);
  assert.equal(stripped.counts.newActionable, 0);
});

test("inactive actor fails closed on prospect sections", async () => {
  todayService.setSourcesForTests({
    loadProspects: async () => [
      persistedAttentionProspect({
        id: PROSPECT_NA,
        name: "Persisted Takeover",
        phone: "+15550001022",
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        needs_human_attention: true
      }),
      persistedAttentionProspect({
        id: PROSPECT_NEW,
        name: "Unhandled Lead",
        phone: "+15550001023",
        attention_status: "new",
        new_lead_received_at: "2026-08-30T12:00:00.000Z"
      })
    ],
    loadAppointments: async () => []
  });

  const inactive = await loadToday({
    authContext: actorContext({
      authContext: auth(USER_A, { status: "suspended" }),
      tenantContext: { userId: USER_A, organizationId: ORG_A }
    })
  });
  assert.equal(inactive.counts.needsAttention, 0);
  assert.equal(inactive.counts.newActionable, 0);
  assert.equal(inactive.caughtUp, true);
});
