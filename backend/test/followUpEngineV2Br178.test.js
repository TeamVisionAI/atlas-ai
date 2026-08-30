/**
 * BR-178 — Follow-up Engine V2.
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

const {
  planFollowUpFromOutcome,
  buildOutcomeDedupKey,
  buildLegacyConversionDedupKey,
  classifyPersistedFollowUp,
  isLegacyCoveredByDurable,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_SURFACES,
  createMemoryFollowUpStore
} = require("../core/followUps");
const { classifyFollowUpStatus } = require("../core/followUpsQueueEngine");
const { MILESTONES } = require("../core/workflowConstants");
const followUpApplicationService = require("../application/followUpApplicationService");
const agentNotificationService = require("../services/agentNotificationService");
const { createMemoryNotificationStore, EVENT_TYPES } = require("../core/agentNotifications");
const { emptyFollowUps } = require("../core/operationalControlPlane");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const ENTITY_A = "51000000-0000-4000-8000-000000000001";
const APPT_A = "61000000-0000-4000-8000-000000000001";
const TODAY = "2026-08-30";

function auth(userId = USER_A, extras = {}) {
  return { userId, role: extras.role || "agent", ...extras };
}

function outcomeInput(overrides = {}) {
  return {
    organizationId: ORG_A,
    actorUserId: USER_A,
    ownerUserId: USER_A,
    surface: FOLLOW_UP_SURFACES.INTERVIEW,
    entityType: "prospect",
    entityId: ENTITY_A,
    subjectLabel: "Alex Recruit",
    subjectPhone: "+15550001111",
    appointmentId: APPT_A,
    reference: new Date("2026-08-30T16:00:00.000Z"),
    ...overrides
  };
}

test.beforeEach(() => {
  const followStore = createMemoryFollowUpStore();
  followUpApplicationService.setStoreForTests(followStore);
  agentNotificationService.setStoreForTests(createMemoryNotificationStore());
});

test.afterEach(() => {
  followUpApplicationService.setStoreForTests(null);
  agentNotificationService.setStoreForTests(null);
});

test("follow_up outcome creates one obligation", async () => {
  const first = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "follow_up", dueDate: "2026-09-02", dueTime: "10:00" })
  );
  assert.equal(first.created, true);
  assert.equal(first.followUp.dueDate, "2026-09-02");
  assert.equal(first.followUp.status, FOLLOW_UP_STATUSES.OPEN);
  assert.equal(first.followUp.entityType, "prospect");
});

test("repeated same outcome does not duplicate", async () => {
  const input = outcomeInput({ outcome: "Follow Up Needed", dueDate: "2026-09-02" });
  const first = await followUpApplicationService.syncFromOperationalOutcome(input);
  const second = await followUpApplicationService.syncFromOperationalOutcome(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.followUp.id, first.followUp.id);
  const listed = await followUpApplicationService.listFollowUps({
    organizationId: ORG_A,
    authContext: auth(),
    includeLegacy: false,
    reference: new Date("2026-08-30T16:00:00.000Z")
  });
  assert.equal(listed.items.length, 1);
});

test("no_show creates a retry obligation using the existing 7-day default", async () => {
  const result = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "no_show" })
  );
  assert.equal(result.created, true);
  assert.equal(result.followUp.dueDate, "2026-09-06");
  assert.equal(result.followUp.title, "No-show retry");
});

test("not_interested with no recycle date creates none", async () => {
  const result = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "not_interested" })
  );
  assert.equal(result.created, false);
  assert.equal(result.reason, "no_recycle_date");
});

test("not_interested with recycle date creates one", async () => {
  const result = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "not_interested", futureReminder: "2026-11-01" })
  );
  assert.equal(result.created, true);
  assert.equal(result.followUp.dueDate, "2026-11-01");
});

test("rescheduled and cancelled do not create obligations", async () => {
  const rescheduled = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "rescheduled", dueDate: "2026-09-01" })
  );
  const cancelled = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "cancelled", dueDate: "2026-09-01" })
  );
  assert.equal(rescheduled.created, false);
  assert.equal(cancelled.created, false);
});

test("agenda recruited creates onboarding follow-up; agenda client does not", async () => {
  const recruited = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({
      outcome: "recruited",
      surface: FOLLOW_UP_SURFACES.AGENDA,
      entityType: "agenda_contact",
      entityId: "contact-1"
    })
  );
  const client = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({
      outcome: "client",
      surface: FOLLOW_UP_SURFACES.AGENDA,
      entityType: "agenda_contact",
      entityId: "contact-1"
    })
  );
  assert.equal(recruited.created, true);
  assert.equal(recruited.followUp.entityType, "agenda_contact");
  assert.equal(client.created, false);
  assert.equal(client.reason, "no_client_crm_workflow");
});

test("manual follow-up requires a date and is idempotent on retry", async () => {
  const first = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "conversation",
      entityId: ENTITY_A,
      subjectLabel: "Pat",
      dueDate: "2026-09-03",
      notes: "Call after orientation"
    },
    auth()
  );
  const second = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "conversation",
      entityId: ENTITY_A,
      subjectLabel: "Pat",
      dueDate: "2026-09-03",
      notes: "Call after orientation"
    },
    auth()
  );
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  await assert.rejects(
    () =>
      followUpApplicationService.createManualFollowUp(
        { organizationId: ORG_A, entityType: "prospect", entityId: ENTITY_A },
        auth()
      ),
    /date is required/i
  );
});

test("due / upcoming / overdue classification uses the calendar date", () => {
  assert.equal(
    classifyPersistedFollowUp({ status: "OPEN", dueDate: "2026-08-29" }, { today: TODAY }).viewStatus,
    "overdue"
  );
  assert.equal(
    classifyPersistedFollowUp({ status: "OPEN", dueDate: TODAY }, { today: TODAY }).viewStatus,
    "due-today"
  );
  assert.equal(
    classifyPersistedFollowUp({ status: "OPEN", dueDate: "2026-09-02" }, { today: TODAY }).viewStatus,
    "upcoming"
  );
  assert.equal(
    classifyPersistedFollowUp({ status: "COMPLETED", dueDate: TODAY }, { today: TODAY }).viewStatus,
    "completed"
  );
  assert.equal(
    classifyPersistedFollowUp({ status: "OPEN", dueDate: null }, { today: TODAY }).viewStatus,
    "needs-date"
  );
});

test("undated completed-interview follow-up is needs-date, never overdue", () => {
  assert.equal(
    classifyFollowUpStatus({
      canonicalMilestone: MILESTONES.FOLLOW_UP,
      followUpAtMs: null,
      priorityTier: "FOLLOW_UP_DUE"
    }),
    "needs-date"
  );
});

test("Set date converts undated legacy into one durable obligation and covers the legacy row", async () => {
  const converted = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: "+15550001111",
      subjectLabel: "Alex Recruit",
      subjectPhone: "+15550001111",
      title: "Thinking About It",
      notes: "Thinking About It",
      dueDate: "2026-08-29",
      ownerUserId: USER_A,
      legacyConversion: true
    },
    auth()
  );
  assert.equal(converted.created, true);
  assert.equal(converted.followUp.sourceEvent, "legacy");
  assert.equal(converted.followUp.ownerUserId, USER_A);
  assert.equal(converted.followUp.organizationId, ORG_A);
  assert.equal(converted.followUp.subjectPhone, "+15550001111");
  assert.equal(converted.followUp.notes, "Thinking About It");
  assert.equal(
    converted.followUp.dedupKey,
    buildLegacyConversionDedupKey({ entityType: "prospect", entityId: "+15550001111" })
  );

  const again = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: "+15550001111",
      dueDate: "2026-09-12",
      ownerUserId: USER_A,
      legacyConversion: true
    },
    auth()
  );
  assert.equal(again.created, false);
  assert.equal(again.followUp.id, converted.followUp.id);
  assert.equal(again.followUp.dueDate, "2026-09-12");

  const listed = await followUpApplicationService.listFollowUps({
    organizationId: ORG_A,
    authContext: auth(),
    includeLegacy: false,
    reference: new Date("2026-08-30T16:00:00.000Z")
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].source, "durable");
  assert.equal(listed.items[0].status, "upcoming");

  const past = classifyPersistedFollowUp(
    { status: "OPEN", dueDate: "2026-08-29" },
    { today: TODAY }
  );
  const today = classifyPersistedFollowUp({ status: "OPEN", dueDate: TODAY }, { today: TODAY });
  const future = classifyPersistedFollowUp(
    { status: "OPEN", dueDate: "2026-09-12" },
    { today: TODAY }
  );
  assert.equal(past.viewStatus, "overdue");
  assert.equal(today.viewStatus, "due-today");
  assert.equal(future.viewStatus, "upcoming");

  assert.equal(
    isLegacyCoveredByDurable(
      [{ phone: "+15550001111", dueDate: "2026-09-12" }],
      { phone: "+15550001111", followUpDate: null }
    ),
    true
  );
  assert.equal(
    isLegacyCoveredByDurable([{ phone: "+15550002222" }], { phone: "+15550001111" }),
    false
  );
});

test("Follow-ups page has no periodic poll; NotificationBell polling stays", () => {
  const page = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/FollowUpsPage.jsx"), "utf8");
  const bell = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/layout/NotificationBell.jsx"),
    "utf8"
  );
  assert.doesNotMatch(page, /setInterval\s*\(/);
  assert.match(page, /lastFetchedAtRef/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /legacyConversion:\s*true/);
  assert.match(bell, /setInterval\s*\(/);
});

test("complete, reschedule, and cancel are durable and do not change entity type", async () => {
  const created = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({
      outcome: "follow_up",
      dueDate: "2026-09-02",
      entityType: "agenda_contact",
      entityId: "contact-9",
      surface: FOLLOW_UP_SURFACES.AGENDA
    })
  );
  const completed = await followUpApplicationService.completeFollowUp(
    created.followUp.id,
    { organizationId: ORG_A, completionNote: "Reached them" },
    auth()
  );
  assert.equal(completed.status, FOLLOW_UP_STATUSES.COMPLETED);
  assert.equal(completed.entityType, "agenda_contact");
  assert.equal(completed.completionNote, "Reached them");

  const second = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: ENTITY_A,
      dueDate: "2026-09-04",
      notes: "unique-reschedule"
    },
    auth()
  );
  const moved = await followUpApplicationService.rescheduleFollowUp(
    second.followUp.id,
    { organizationId: ORG_A, dueDate: "2026-09-10" },
    auth()
  );
  assert.equal(moved.dueDate, "2026-09-10");
  assert.equal(moved.status, FOLLOW_UP_STATUSES.OPEN);

  const cancelled = await followUpApplicationService.cancelFollowUp(
    moved.id,
    { organizationId: ORG_A, notes: "No longer needed" },
    auth()
  );
  assert.equal(cancelled.status, FOLLOW_UP_STATUSES.CANCELLED);
});

test("BR-176 due notification is owner-only and deduped", async () => {
  const store = createMemoryNotificationStore();
  agentNotificationService.setStoreForTests(store);
  const created = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "follow_up", dueDate: TODAY, dueTime: "10:00" })
  );
  const firstNotify = await followUpApplicationService.syncFromOperationalOutcome(
    outcomeInput({ outcome: "follow_up", dueDate: TODAY, dueTime: "10:00" })
  );
  void created;
  void firstNotify;
  const ownerUnread = await store.countUnread({ organizationId: ORG_A, recipientUserId: USER_A });
  const otherUnread = await store.countUnread({ organizationId: ORG_A, recipientUserId: USER_B });
  assert.equal(ownerUnread, 1);
  assert.equal(otherUnread, 0);
  const listed = await store.listForRecipient({ organizationId: ORG_A, recipientUserId: USER_A });
  assert.equal(listed[0].eventType, EVENT_TYPES.FOLLOW_UP_DUE);
  assert.doesNotMatch(listed[0].body, /\+1|555/);
});

test("reschedule creates a new due episode after the date changes to today", async () => {
  const store = createMemoryNotificationStore();
  agentNotificationService.setStoreForTests(store);
  const created = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: ENTITY_A,
      dueDate: "2026-09-12",
      notes: "later"
    },
    auth()
  );
  assert.equal(await store.countUnread({ organizationId: ORG_A, recipientUserId: USER_A }), 0);
  await followUpApplicationService.rescheduleFollowUp(
    created.followUp.id,
    { organizationId: ORG_A, dueDate: TODAY, reference: new Date("2026-08-30T16:00:00.000Z") },
    auth()
  );
  assert.equal(await store.countUnread({ organizationId: ORG_A, recipientUserId: USER_A }), 1);
});

test("tenant isolation and unauthorized access fail closed", async () => {
  const created = await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: ENTITY_A,
      dueDate: "2026-09-03",
      notes: "org-a"
    },
    auth()
  );
  await assert.rejects(
    () =>
      followUpApplicationService.completeFollowUp(
        created.followUp.id,
        { organizationId: ORG_B },
        auth()
      ),
    /not found/i
  );
  await assert.rejects(
    () =>
      followUpApplicationService.completeFollowUp(
        created.followUp.id,
        { organizationId: ORG_A },
        auth(USER_B)
      ),
    /not found/i
  );
});

test("control-plane empty payload has no tenant follow-ups", () => {
  const empty = emptyFollowUps();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.totalCount, 0);
});

test("follow-up routes use control-plane empty and Support Mode stays tenant-bound", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/followUps.js"), "utf8");
  const dashboard = fs.readFileSync(path.join(__dirname, "../routes/dashboard.js"), "utf8");
  assert.match(routes, /operationalControlPlaneEmpty\(emptyFollowUps\)/);
  assert.match(dashboard, /summarizeForOwner/);
});

test("canonical outcome services hook follow-up sync and send no external messages", () => {
  const interview = fs.readFileSync(
    path.join(__dirname, "../application/interviewOutcomeApplicationService.js"),
    "utf8"
  );
  const agenda = fs.readFileSync(
    path.join(__dirname, "../application/agendaApplicationService.js"),
    "utf8"
  );
  const service = fs.readFileSync(
    path.join(__dirname, "../application/followUpApplicationService.js"),
    "utf8"
  );
  const recruitDecision = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"),
    "utf8"
  );
  const interpreter = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/interpreter.js"),
    "utf8"
  );
  assert.match(interview, /syncFromOperationalOutcome/);
  assert.match(agenda, /syncFromOperationalOutcome/);
  assert.match(agenda, /Agenda contacts stay Agenda contacts/);
  assert.doesNotMatch(service, /sendWhatsApp|twilio|sendEmail\(|sendSms\(/i);
  assert.doesNotMatch(recruitDecision, /followUpApplicationService|syncFromOperationalOutcome/);
  assert.doesNotMatch(interpreter, /followUpApplicationService|syncFromOperationalOutcome/);
});

test("outcome policy keeps date-only recycle semantics", () => {
  const none = planFollowUpFromOutcome({ outcome: "not_interested", today: TODAY });
  const recycle = planFollowUpFromOutcome({
    outcome: "not_interested",
    futureReminder: "2026-12-01",
    today: TODAY
  });
  assert.equal(none.create, false);
  assert.equal(recycle.create, true);
  assert.equal(recycle.dueTime, null);
  assert.equal(
    buildOutcomeDedupKey({
      surface: "interview",
      entityType: "prospect",
      entityId: "p1",
      outcomeKey: "follow_up",
      appointmentId: "a1"
    }),
    "outcome:interview:prospect:p1:follow_up:a1"
  );
});
