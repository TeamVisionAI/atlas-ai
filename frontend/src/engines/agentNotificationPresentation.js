/**
 * BR-176 — present stored notification copy and history actors.
 * Canonical UTC timestamps stay stored; UI shows a friendly zoned wall clock.
 */

const ISO_IN_TEXT =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEZONE = "America/New_York";

export function formatFriendlyAppointmentWhen(
  iso,
  timeZone = DEFAULT_TIMEZONE,
  locale = "en-US"
) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  try {
    return date.toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone || DEFAULT_TIMEZONE
    });
  } catch {
    return date.toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: DEFAULT_TIMEZONE
    });
  }
}

export function presentNotificationBody(body, { timeZone, locale } = {}) {
  return String(body || "").replace(ISO_IN_TEXT, (match) => {
    return formatFriendlyAppointmentWhen(match, timeZone, locale) || match;
  });
}

export function presentHistoryActorLabel(actor, actorName = "") {
  const resolved = String(actorName || "").trim();
  if (resolved && !UUID_RE.test(resolved)) {
    return resolved;
  }

  const raw = String(actor || "").trim();
  if (!raw) {
    return null;
  }

  const lower = raw.toLowerCase();
  if (lower === "system" || lower === "atlas") {
    return "Atlas";
  }
  if (lower === "agent") {
    return "Agent";
  }
  if (UUID_RE.test(raw)) {
    return "Former teammate";
  }
  return raw;
}
