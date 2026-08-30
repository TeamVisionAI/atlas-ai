/**
 * BR-176 — application service. Fail-open from business hooks.
 */

const { writeAuditLog } = require("../security/auditLogService");
const { dispatchInAppNotification } = require("../core/agentNotifications/dispatcher");
const {
  readAgentNotificationPreferences,
  mergeAgentNotificationPreferences
} = require("../core/agentNotifications/preferences");
const { AUDIT_ACTIONS } = require("../core/agentNotifications/constants");

let defaultStore = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getStore(store) {
  if (store) {
    return store;
  }
  if (defaultStore) {
    return defaultStore;
  }
  // node --test and NODE_ENV=test must inject a memory store. Never write live rows.
  if (isAutomatedTestRuntime()) {
    return null;
  }
  if (!process.env.SUPABASE_URL) {
    return null;
  }
  const { createSupabaseNotificationStore } = require("../repositories/agentNotificationRepository");
  defaultStore = createSupabaseNotificationStore();
  return defaultStore;
}

function setStoreForTests(store) {
  defaultStore = store || null;
}

async function notifyOperationalEvent(event, { store } = {}) {
  try {
    const resolved = getStore(store);
    if (!resolved) {
      return { created: false, reason: "STORE_UNAVAILABLE", channel: "in_app" };
    }
    return await dispatchInAppNotification(event, { store: resolved });
  } catch (error) {
    console.warn("[agent-notifications] dispatch failed", error.message);
    return { created: false, reason: "DISPATCH_FAILED" };
  }
}

async function listMyNotifications({ organizationId, userId, limit, store }) {
  const resolved = getStore(store);
  if (!resolved) {
    return [];
  }
  return resolved.listForRecipient({
    organizationId,
    recipientUserId: userId,
    limit
  });
}

async function unreadCount({ organizationId, userId, store }) {
  const resolved = getStore(store);
  if (!resolved) {
    return 0;
  }
  return resolved.countUnread({
    organizationId,
    recipientUserId: userId
  });
}

async function markRead({ id, organizationId, userId, store }) {
  const resolved = getStore(store);
  if (!resolved) {
    return null;
  }
  return resolved.markRead({
    id,
    organizationId,
    recipientUserId: userId,
    readAt: new Date().toISOString()
  });
}

async function markAllRead({ organizationId, userId, store }) {
  const resolved = getStore(store);
  if (!resolved) {
    return 0;
  }
  return resolved.markAllRead({
    organizationId,
    recipientUserId: userId,
    readAt: new Date().toISOString()
  });
}

async function getPreferences({ userId, store }) {
  const resolved = getStore(store);
  if (!resolved) {
    return readAgentNotificationPreferences({});
  }
  const raw = await resolved.getUserNotificationPreferences(userId);
  return readAgentNotificationPreferences(raw);
}

async function updatePreferences({ userId, organizationId, patch, store }) {
  const resolved = getStore(store);
  if (!resolved) {
    return readAgentNotificationPreferences({});
  }
  const existing = await resolved.getUserNotificationPreferences(userId);
  const merged = mergeAgentNotificationPreferences(existing, patch);
  await resolved.saveUserNotificationPreferences(userId, merged);
  const next = readAgentNotificationPreferences(merged);
  await writeAuditLog({
    action: AUDIT_ACTIONS.PREFERENCES_UPDATED,
    organizationId,
    userId,
    targetType: "atlas_user",
    targetId: userId,
    result: "success",
    metadata: {
      inAppEnabled: next.inAppEnabled,
      soundEnabled: next.soundEnabled
    }
  }).catch(() => {});
  return next;
}

module.exports = {
  notifyOperationalEvent,
  listMyNotifications,
  unreadCount,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
  getStore,
  setStoreForTests
};
