/**
 * Sprint 12.5.6 — Derives scheduling keys from persisted interview datetimes.
 */

function deriveDateKeyTimeKey(isoString, timezone = "America/New_York") {
  if (!isoString) {
    return null;
  }

  const parsed = Date.parse(isoString);

  if (Number.isNaN(parsed)) {
    return null;
  }

  const date = new Date(parsed);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateKey = `${lookup.year}-${lookup.month}-${lookup.day}`;
  const hour = String(Number(lookup.hour)).padStart(2, "0");
  const minute = lookup.minute || "00";

  return {
    dateKey,
    timeKey: `${hour}:${minute}`,
    timezone
  };
}

function inferMeetingTypeFromProspect(prospect = {}) {
  const normalized = String(prospect.interview_type || "").toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    return { meetingType: "virtual", interviewType: "Zoom", isZoom: true };
  }

  if (normalized.includes("public")) {
    return { meetingType: "in_person", interviewType: "Public Location", isZoom: false };
  }

  return { meetingType: "in_person", interviewType: "In Person", isZoom: false };
}

module.exports = {
  deriveDateKeyTimeKey,
  inferMeetingTypeFromProspect
};
