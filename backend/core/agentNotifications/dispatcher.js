/**
 * BR-176 — operational event → routing → in-app channel.
 * Does not send WhatsApp, email, or push.
 */

const crypto = require("node:crypto");
const { EVENT_TYPES, ENTITY_TYPES, CHANNELS } = require("./constants");
const { resolveRecipient } = require("./routing");
const { buildDedupKey } = require("./dedup");
const { buildNotificationCopy } = require("./copy");
const {
  readAgentNotificationPreferences,
  shouldPersistInApp
} = require("./preferences");

function isKnownEvent(eventType) {
  return Object.values(EVENT_TYPES).includes(String(eventType || ""));
}

async function dispatchInAppNotification(event = {}, { store } = {}) {
  if (!store) {
    return { created: false, reason: "STORE_REQUIRED", channel: CHANNELS.IN_APP };
  }
  if (!isKnownEvent(event.eventType)) {
    return { created: false, reason: "UNKNOWN_EVENT", channel: CHANNELS.IN_APP };
  }
  const organizationId = String(event.organizationId || "").trim();
  if (!organizationId) {
    return { created: false, reason: "ORGANIZATION_REQUIRED", channel: CHANNELS.IN_APP };
  }

  const recipientUserId = resolveRecipient(event);
  if (!recipientUserId) {
    return { created: false, reason: "NO_RECIPIENT", channel: CHANNELS.IN_APP };
  }

  const rawPrefs = await store.getUserNotificationPreferences(recipientUserId);
  const preferences = readAgentNotificationPreferences(rawPrefs);
  if (!shouldPersistInApp(preferences, event.eventType)) {
    return {
      created: false,
      reason: preferences.inAppEnabled ? "EVENT_DISABLED" : "IN_APP_DISABLED",
      channel: CHANNELS.IN_APP,
      soundWouldPlay: false
    };
  }

  const copy = buildNotificationCopy(event);
  const row = {
    id: event.id || crypto.randomUUID(),
    organizationId,
    recipientUserId,
    eventType: event.eventType,
    title: copy.title,
    body: copy.body,
    entityType: event.entityType || ENTITY_TYPES.APPOINTMENT,
    entityId: String(event.entityId || event.appointment?.id || ""),
    actionUrl: event.actionUrl || copy.actionUrl,
    severity: event.severity || copy.severity,
    createdAt: event.createdAt || new Date().toISOString(),
    readAt: null,
    dismissedAt: null,
    dedupKey: event.dedupKey || buildDedupKey({ ...event, organizationId })
  };

  try {
    const saved = await store.insertNotification(row);
    return {
      created: true,
      reason: null,
      channel: CHANNELS.IN_APP,
      notification: saved,
      soundEligible: preferences.soundEnabled === true
    };
  } catch (error) {
    if (error?.duplicate || error?.code === "23505") {
      return { created: false, reason: "DUPLICATE", channel: CHANNELS.IN_APP };
    }
    throw error;
  }
}

module.exports = {
  dispatchInAppNotification
};
