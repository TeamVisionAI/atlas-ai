/**
 * BR-176 — Agent Notifications Foundation.
 * Synthetic fixtures only. No WhatsApp, email, or push.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const {
  EVENT_TYPES,
  PREFERENCE_DEFAULTS,
  createMemoryNotificationStore,
  dispatchInAppNotification,
  resolveRecipient,
  classifyAttentionEvent,
  enteredNeedsAttention,
  buildDedupKey,
  readAgentNotificationPreferences,
  mergeAgentNotificationPreferences,
  shouldPersistInApp,
  shouldPlaySound,
  buildNotificationCopy
} = require("../core/agentNotifications");
const agentNotificationService = require("../services/agentNotificationService");
const agentNotificationRoutes = require("../routes/agentNotifications");
const { savePersistedWorkflowState, clearMemoryWorkflowStateStore } = require("../core/workflowStateStore");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_ADMIN = "33333333-3333-4333-8333-333333333333";
const APPT_ID = "44444444-4444-4444-8444-444444444444";
const PROSPECT_ID = "55555555-5555-4555-8555-555555555555";

function appointment(overrides = {}) {
  return {
    id: APPT_ID,
    organizationId: ORG_A,
    interviewerUserId: USER_A,
    agentId: USER_B,
    createdBy: USER_ADMIN,
    startDateTime: "2026-09-01T15:00:00.000Z",
    prospectPhone: "+17865550000",
    ...overrides
  };
}

async function notify(event, store) {
  return agentNotificationService.notifyOperationalEvent(event, { store });
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await run(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function notificationApp({ organizationId, userId, controlPlaneOnly = false }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = { userId: req.headers["x-user-id"] || userId };
    req.tenantContext = {
      organizationId: req.headers["x-org-id"] || organizationId
    };
    req.controlPlaneOnly =
      req.headers["x-control-plane"] === "1" || controlPlaneOnly;
    next();
  });
  app.use("/api/organization", agentNotificationRoutes);
  return app;
}

test.afterEach(() => {
  agentNotificationService.setStoreForTests(null);
});

test("new appointment notifies interviewer, not creator or phone", async () => {
  const store = createMemoryNotificationStore();
  const result = await notify(
    {
      eventType: EVENT_TYPES.NEW_APPOINTMENT,
      organizationId: ORG_A,
      appointment: appointment(),
      entityId: APPT_ID
    },
    store
  );
  assert.equal(result.created, true);
  assert.equal(result.notification.recipientUserId, USER_A);
  assert.equal(result.channel, "in_app");
  assert.match(result.notification.title, /New appointment/i);
  assert.doesNotMatch(result.notification.body, /\+1|786/);
  assert.equal(await store.countUnread({ organizationId: ORG_A, recipientUserId: USER_B }), 0);
  assert.equal(resolveRecipient({
    eventType: EVENT_TYPES.NEW_APPOINTMENT,
    appointment: { prospectPhone: "+17865550000" }
  }), null);
});

test("reschedule and cancel notify the assigned interviewer", async () => {
  const store = createMemoryNotificationStore();
  const rescheduled = await notify(
    {
      eventType: EVENT_TYPES.APPOINTMENT_RESCHEDULED,
      organizationId: ORG_A,
      appointment: appointment({ startDateTime: "2026-09-02T16:00:00.000Z" }),
      entityId: APPT_ID,
      startDateTime: "2026-09-02T16:00:00.000Z"
    },
    store
  );
  const cancelled = await notify(
    {
      eventType: EVENT_TYPES.APPOINTMENT_CANCELLED,
      organizationId: ORG_A,
      appointment: appointment(),
      entityId: APPT_ID
    },
    store
  );
  assert.equal(rescheduled.created, true);
  assert.equal(cancelled.created, true);
  assert.equal(rescheduled.notification.recipientUserId, USER_A);
  assert.equal(cancelled.notification.recipientUserId, USER_A);
  assert.equal(await store.countUnread({ organizationId: ORG_A, recipientUserId: USER_A }), 2);
});

test("Needs Attention notifies current owner once per enter", async (t) => {
  const previousMemoryKey = process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY;
  process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY = "br176-agent-notifications";
  t.after(() => {
    clearMemoryWorkflowStateStore();
    if (previousMemoryKey === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY = previousMemoryKey;
    }
  });
  const store = createMemoryNotificationStore();
  agentNotificationService.setStoreForTests(store);
  const phone = "+17865550176";
  const first = await savePersistedWorkflowState(
    phone,
    { needsHumanAttention: true, stallEpisodeKey: "episode-1" },
    {
      backend: "memory",
      organizationId: ORG_A,
      prospectId: PROSPECT_ID,
      ownerUserId: USER_A,
      prospect: { owner_user_id: USER_A }
    }
  );
  assert.equal(first.needsHumanAttention, true);
  const listed = await store.listForRecipient({ organizationId: ORG_A, recipientUserId: USER_A });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].eventType, EVENT_TYPES.NEEDS_ATTENTION);

  await savePersistedWorkflowState(
    phone,
    { needsHumanAttention: true, stallEpisodeKey: "episode-1" },
    {
      backend: "memory",
      organizationId: ORG_A,
      prospectId: PROSPECT_ID,
      ownerUserId: USER_A
    }
  );
  assert.equal(
    (await store.listForRecipient({ organizationId: ORG_A, recipientUserId: USER_A })).length,
    1
  );

  await savePersistedWorkflowState(
    phone,
    { needsHumanAttention: false, stallEpisodeKey: null },
    { backend: "memory", organizationId: ORG_A, ownerUserId: USER_A }
  );
  await savePersistedWorkflowState(
    phone,
    { needsHumanAttention: true, stallEpisodeKey: "episode-2" },
    {
      backend: "memory",
      organizationId: ORG_A,
      prospectId: PROSPECT_ID,
      ownerUserId: USER_A
    }
  );
  assert.equal(
    (await store.listForRecipient({ organizationId: ORG_A, recipientUserId: USER_A })).length,
    2
  );
});

test("explicit human request classifies as takeover and notifies owner", async () => {
  assert.equal(
    classifyAttentionEvent("explicit_human_request"),
    EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED
  );
  assert.equal(
    classifyAttentionEvent("recruiter_escalation"),
    EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED
  );
  assert.equal(classifyAttentionEvent("stall"), EVENT_TYPES.NEEDS_ATTENTION);

  const store = createMemoryNotificationStore();
  const result = await notify(
    {
      eventType: EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED,
      organizationId: ORG_A,
      recipientUserId: USER_A,
      entityId: PROSPECT_ID,
      episodeKey: "takeover-1"
    },
    store
  );
  assert.equal(result.created, true);
  assert.equal(result.notification.recipientUserId, USER_A);
  assert.match(result.notification.title, /Takeover/i);
});

test("sticky TAKE OVER is not a Needs Attention enter", () => {
  assert.equal(
    enteredNeedsAttention(
      { needsHumanAttention: false },
      {
        needsHumanAttention: true,
        manualAgentOwnership: true,
        humanTakenOverAt: "2026-08-30T00:00:00.000Z"
      }
    ),
    false
  );
  assert.equal(
    enteredNeedsAttention(
      { needsHumanAttention: false },
      { needsHumanAttention: true }
    ),
    true
  );
});

test("deterministic dedup suppresses the same operational event", async () => {
  const store = createMemoryNotificationStore();
  const event = {
    eventType: EVENT_TYPES.NEW_APPOINTMENT,
    organizationId: ORG_A,
    appointment: appointment(),
    entityId: APPT_ID
  };
  const first = await dispatchInAppNotification(event, { store });
  const second = await dispatchInAppNotification(event, { store });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, "DUPLICATE");
  assert.equal(await store.countUnread({ organizationId: ORG_A, recipientUserId: USER_A }), 1);
  assert.equal(
    buildDedupKey(event),
    `NEW_APPOINTMENT:${ORG_A}:${APPT_ID}`
  );
});

test("read, unread, and mark all read stay recipient-scoped", async () => {
  const store = createMemoryNotificationStore();
  await notify(
    {
      eventType: EVENT_TYPES.NEW_APPOINTMENT,
      organizationId: ORG_A,
      appointment: appointment(),
      entityId: APPT_ID
    },
    store
  );
  await notify(
    {
      eventType: EVENT_TYPES.APPOINTMENT_CANCELLED,
      organizationId: ORG_A,
      appointment: appointment({ id: "66666666-6666-4666-8666-666666666666" }),
      entityId: "66666666-6666-4666-8666-666666666666"
    },
    store
  );
  assert.equal(await agentNotificationService.unreadCount({
    organizationId: ORG_A,
    userId: USER_A,
    store
  }), 2);

  const mine = await agentNotificationService.listMyNotifications({
    organizationId: ORG_A,
    userId: USER_A,
    store
  });
  const one = await agentNotificationService.markRead({
    id: mine[0].id,
    organizationId: ORG_A,
    userId: USER_A,
    store
  });
  assert.ok(one.readAt);
  assert.equal(await agentNotificationService.unreadCount({
    organizationId: ORG_A,
    userId: USER_A,
    store
  }), 1);

  const updated = await agentNotificationService.markAllRead({
    organizationId: ORG_A,
    userId: USER_A,
    store
  });
  assert.equal(updated, 1);
  assert.equal(await agentNotificationService.unreadCount({
    organizationId: ORG_A,
    userId: USER_A,
    store
  }), 0);
});

test("tenant and user isolation: wrong user or tenant cannot read or update", async () => {
  const store = createMemoryNotificationStore();
  const created = await notify(
    {
      eventType: EVENT_TYPES.NEW_APPOINTMENT,
      organizationId: ORG_A,
      appointment: appointment(),
      entityId: APPT_ID
    },
    store
  );
  const id = created.notification.id;

  assert.equal(
    await store.getById({ id, organizationId: ORG_A, recipientUserId: USER_B }),
    null
  );
  assert.equal(
    await store.getById({ id, organizationId: ORG_B, recipientUserId: USER_A }),
    null
  );
  assert.equal(
    await agentNotificationService.markRead({
      id,
      organizationId: ORG_A,
      userId: USER_B,
      store
    }),
    null
  );
  assert.equal(
    await agentNotificationService.markRead({
      id,
      organizationId: ORG_B,
      userId: USER_A,
      store
    }),
    null
  );
  assert.deepEqual(
    await agentNotificationService.listMyNotifications({
      organizationId: ORG_A,
      userId: USER_ADMIN,
      store
    }),
    []
  );
});

test("HTTP feed is own-user only; control plane is empty", async () => {
  const store = createMemoryNotificationStore();
  agentNotificationService.setStoreForTests(store);
  await notify(
    {
      eventType: EVENT_TYPES.NEW_APPOINTMENT,
      organizationId: ORG_A,
      appointment: appointment(),
      entityId: APPT_ID
    },
    store
  );
  const created = [...store.notifications.values()][0];

  const app = notificationApp({ organizationId: ORG_A, userId: USER_A });
  await withServer(app, async (port) => {
    const own = await fetch(`http://127.0.0.1:${port}/api/organization/notifications`);
    assert.equal(own.status, 200);
    const ownBody = await own.json();
    assert.equal(ownBody.notifications.length, 1);
    assert.equal(ownBody.unreadCount, 1);

    const otherUser = await fetch(`http://127.0.0.1:${port}/api/organization/notifications`, {
      headers: { "x-user-id": USER_B }
    });
    const otherUserBody = await otherUser.json();
    assert.equal(otherUserBody.notifications.length, 0);

    const adminFeed = await fetch(`http://127.0.0.1:${port}/api/organization/notifications`, {
      headers: { "x-user-id": USER_ADMIN }
    });
    assert.equal((await adminFeed.json()).notifications.length, 0);

    const otherTenant = await fetch(`http://127.0.0.1:${port}/api/organization/notifications`, {
      headers: { "x-org-id": ORG_B, "x-user-id": USER_A }
    });
    assert.equal((await otherTenant.json()).notifications.length, 0);

    const steal = await fetch(
      `http://127.0.0.1:${port}/api/organization/notifications/${created.id}/read`,
      {
        method: "POST",
        headers: { "x-user-id": USER_B }
      }
    );
    assert.equal(steal.status, 404);

    const stealTenant = await fetch(
      `http://127.0.0.1:${port}/api/organization/notifications/${created.id}/read`,
      {
        method: "POST",
        headers: { "x-org-id": ORG_B, "x-user-id": USER_A }
      }
    );
    assert.equal(stealTenant.status, 404);

    const control = await fetch(`http://127.0.0.1:${port}/api/organization/notifications`, {
      headers: { "x-control-plane": "1" }
    });
    const controlBody = await control.json();
    assert.equal(controlBody.notifications.length, 0);
    assert.equal(controlBody.controlPlane, true);
  });
});

test("sound preference does not affect persistence; in-app off skips persist", async () => {
  const store = createMemoryNotificationStore();
  store.preferencesByUser.set(USER_A, {
    urgentAppointmentWhatsAppEnabled: true,
    agentNotifications: {
      inAppEnabled: true,
      soundEnabled: false,
      events: { NEW_APPOINTMENT: true }
    }
  });
  const silent = await notify(
    {
      eventType: EVENT_TYPES.NEW_APPOINTMENT,
      organizationId: ORG_A,
      appointment: appointment(),
      entityId: APPT_ID
    },
    store
  );
  assert.equal(silent.created, true);
  assert.equal(silent.soundEligible, false);

  const prefs = readAgentNotificationPreferences(
    await store.getUserNotificationPreferences(USER_A)
  );
  assert.equal(shouldPersistInApp(prefs, EVENT_TYPES.NEW_APPOINTMENT), true);
  assert.equal(
    shouldPlaySound(prefs, EVENT_TYPES.NEW_APPOINTMENT, { isNewUnread: true }),
    false
  );

  const merged = mergeAgentNotificationPreferences(
    await store.getUserNotificationPreferences(USER_A),
    { soundEnabled: true }
  );
  assert.equal(merged.urgentAppointmentWhatsAppEnabled, true);
  assert.equal(merged.agentNotifications.soundEnabled, true);
  assert.equal(PREFERENCE_DEFAULTS.soundEnabled, false);

  store.preferencesByUser.set(USER_A, {
    agentNotifications: { inAppEnabled: false, soundEnabled: true, events: {} }
  });
  const skipped = await notify(
    {
      eventType: EVENT_TYPES.APPOINTMENT_CANCELLED,
      organizationId: ORG_A,
      appointment: appointment({ id: "77777777-7777-4777-8777-777777777777" }),
      entityId: "77777777-7777-4777-8777-777777777777"
    },
    store
  );
  assert.equal(skipped.created, false);
  assert.equal(skipped.reason, "IN_APP_DISABLED");
});

test("hooks live on appointment and workflow services, not Recruit AI", () => {
  const appointmentSrc = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  const workflowSrc = fs.readFileSync(
    path.join(__dirname, "../core/workflowStateStore.js"),
    "utf8"
  );
  const decisionSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"),
    "utf8"
  );
  const semanticSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/semantic/semanticInterpreter.js"),
    "utf8"
  );
  assert.match(appointmentSrc, /notifyAppointmentLifecycle\("NEW_APPOINTMENT"/);
  assert.match(appointmentSrc, /notifyAppointmentLifecycle\("APPOINTMENT_RESCHEDULED"/);
  assert.match(appointmentSrc, /notifyAppointmentLifecycle\("APPOINTMENT_CANCELLED"/);
  assert.match(appointmentSrc, /notifyAppointmentLifecycle\("HUMAN_TAKEOVER_REQUESTED"/);
  assert.match(workflowSrc, /notifyNeedsAttentionEnter/);
  assert.match(workflowSrc, /enteredNeedsAttention/);
  assert.doesNotMatch(decisionSrc, /notifyOperationalEvent|agentNotificationService/);
  assert.doesNotMatch(semanticSrc, /notifyOperationalEvent|agentNotificationService/);
});

test("notification copy never includes a phone number", () => {
  const copy = buildNotificationCopy({
    eventType: EVENT_TYPES.NEW_APPOINTMENT,
    appointment: appointment()
  });
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /\+1|786555/);
});
