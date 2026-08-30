/**
 * BR-176 — per-user in-app / sound preferences.
 * Stored under atlas_users.notification_preferences.agentNotifications
 * so existing urgent-WhatsApp keys are preserved.
 */

const { EVENT_TYPES, PREFERENCE_DEFAULTS, DEFAULT_EVENT_TOGGLES } = require("./constants");

const PREFERENCE_NAMESPACE = "agentNotifications";

function asBoolean(value, fallback) {
  if (value === true || value === false) {
    return value;
  }
  return fallback;
}

function normalizeEventToggles(value = {}) {
  const next = { ...DEFAULT_EVENT_TOGGLES };
  for (const eventType of Object.values(EVENT_TYPES)) {
    if (value[eventType] === true || value[eventType] === false) {
      next[eventType] = value[eventType];
    }
  }
  return next;
}

function readAgentNotificationPreferences(notificationPreferences = {}) {
  const raw =
    notificationPreferences?.[PREFERENCE_NAMESPACE] &&
    typeof notificationPreferences[PREFERENCE_NAMESPACE] === "object"
      ? notificationPreferences[PREFERENCE_NAMESPACE]
      : notificationPreferences || {};

  return {
    inAppEnabled: asBoolean(raw.inAppEnabled, PREFERENCE_DEFAULTS.inAppEnabled),
    soundEnabled: asBoolean(raw.soundEnabled, PREFERENCE_DEFAULTS.soundEnabled),
    events: normalizeEventToggles(raw.events)
  };
}

function mergeAgentNotificationPreferences(existingPreferences = {}, patch = {}) {
  const current = readAgentNotificationPreferences(existingPreferences);
  const next = {
    inAppEnabled:
      patch.inAppEnabled === undefined ? current.inAppEnabled : Boolean(patch.inAppEnabled),
    soundEnabled:
      patch.soundEnabled === undefined ? current.soundEnabled : Boolean(patch.soundEnabled),
    events: normalizeEventToggles({
      ...current.events,
      ...(patch.events && typeof patch.events === "object" ? patch.events : {})
    })
  };

  return {
    ...existingPreferences,
    [PREFERENCE_NAMESPACE]: next
  };
}

function shouldPersistInApp(preferences, eventType) {
  if (!preferences?.inAppEnabled) {
    return false;
  }
  if (preferences.events && preferences.events[eventType] === false) {
    return false;
  }
  return true;
}

function shouldPlaySound(preferences, eventType, { isNewUnread = false } = {}) {
  if (!isNewUnread) {
    return false;
  }
  if (!preferences?.soundEnabled) {
    return false;
  }
  return shouldPersistInApp(preferences, eventType);
}

module.exports = {
  PREFERENCE_NAMESPACE,
  readAgentNotificationPreferences,
  mergeAgentNotificationPreferences,
  shouldPersistInApp,
  shouldPlaySound
};
