/**
 * BR-179 — Client Workspace presentation helpers.
 */

export const CLIENT_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  FOLLOW_UP: "FOLLOW_UP",
  INACTIVE: "INACTIVE"
});

const STATUS_LABEL_KEYS = Object.freeze({
  ACTIVE: "clientsStatusActive",
  FOLLOW_UP: "clientsStatusFollowUp",
  INACTIVE: "clientsStatusInactive"
});

export function buildClientStatusLabel(status, translate) {
  const key = STATUS_LABEL_KEYS[String(status || "").toUpperCase()] || "clientsStatusActive";
  return translate(key);
}

export function buildClientSearchHaystack(item = {}) {
  return [item.name, item.phone, item.email].filter(Boolean).join(" ").toLowerCase();
}

export function matchesClientSearch(item, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return buildClientSearchHaystack(item).includes(needle);
}

export function formatClientTimestamp(value, locale = "en-US") {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function presentClientHistoryEvent(event = {}, translate, locale) {
  return {
    ...event,
    actorLabel: event.actorName || translate("clientsFormerTeammate"),
    atLabel: formatClientTimestamp(event.at, locale),
    summary: event.summary || event.body || translate("clientsHistoryEvent")
  };
}
