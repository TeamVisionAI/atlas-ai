/**
 * Sprint 9.0 — Executive Dashboard → Mission Control filter mapping.
 * Presentation-only; counts and rankings come from backend priority engine.
 */

import { appPath } from "../config/appRoutes";

export const EXECUTIVE_FILTERS = {
  INTERVIEWS_TODAY: "interviews-today",
  TOMORROWS_INTERVIEWS: "tomorrows-interviews",
  PENDING_OUTCOMES: "pending-outcomes",
  HIGH_PRIORITY: "high-priority",
  ORIENTATION_READY: "orientation-ready",
  STALLED: "stalled"
};

/** i18n translation keys — resolve with translate(key). */
export const EXECUTIVE_FILTER_LABEL_KEYS = {
  [EXECUTIVE_FILTERS.INTERVIEWS_TODAY]: "executiveFilterInterviewsToday",
  [EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS]: "executiveFilterTomorrowsInterviews",
  [EXECUTIVE_FILTERS.PENDING_OUTCOMES]: "executiveFilterPendingOutcomes",
  [EXECUTIVE_FILTERS.HIGH_PRIORITY]: "executiveFilterHighPriority",
  [EXECUTIVE_FILTERS.ORIENTATION_READY]: "executiveFilterOrientationReady",
  [EXECUTIVE_FILTERS.STALLED]: "executiveFilterStalled"
};

function parseInterviewTimestamp(prospect) {
  if (!prospect) {
    return null;
  }

  const interviewTime = Date.parse(prospect.interview_time || "");
  if (!Number.isNaN(interviewTime)) {
    return interviewTime;
  }

  const appointmentDate = Date.parse(prospect.appointment_date || "");
  if (!Number.isNaN(appointmentDate)) {
    return appointmentDate;
  }

  return null;
}

function isSameLocalDay(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const target = new Date(timestampMs);
  const ref = new Date(reference);
  return (
    target.getFullYear() === ref.getFullYear() &&
    target.getMonth() === ref.getMonth() &&
    target.getDate() === ref.getDate()
  );
}

function isTomorrow(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const tomorrow = new Date(reference);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameLocalDay(timestampMs, tomorrow);
}

function findProspect(prospects, phone) {
  return prospects.find((row) => row.phone === phone) || null;
}

export function resolveExecutiveFilterPhones(filter, workflowQueue = [], prospects = []) {
  if (!filter || !workflowQueue.length) {
    return [];
  }

  switch (filter) {
    case EXECUTIVE_FILTERS.INTERVIEWS_TODAY:
      return workflowQueue
        .filter((summary) => {
          const prospect = findProspect(prospects, summary.phone);
          return isSameLocalDay(parseInterviewTimestamp(prospect));
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS:
      return workflowQueue
        .filter((summary) => {
          const prospect = findProspect(prospects, summary.phone);
          return isTomorrow(parseInterviewTimestamp(prospect));
        })
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.PENDING_OUTCOMES:
      return workflowQueue
        .filter(
          (summary) =>
            summary.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS" ||
            summary.canonicalMilestone === "INTERVIEW_RESULT_PENDING"
        )
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.HIGH_PRIORITY:
      return workflowQueue
        .filter((summary) => summary.missionControlPriority <= 2)
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.ORIENTATION_READY:
      return workflowQueue
        .filter((summary) => summary.canonicalMilestone === "ORIENTATION")
        .map((row) => row.phone);

    case EXECUTIVE_FILTERS.STALLED:
      return workflowQueue
        .filter((summary) => Boolean(summary.stalledAt))
        .map((row) => row.phone);

    default:
      return [];
  }
}

export function filterQueueForExecutiveFilter(queue, filter, workflowQueue, prospects) {
  const phones = resolveExecutiveFilterPhones(filter, workflowQueue, prospects);

  if (!phones.length) {
    return [];
  }

  const phoneSet = new Set(phones);
  return queue.filter((item) => phoneSet.has(item.phone));
}

export function buildMissionControlPath({ filter, phone } = {}) {
  const params = new URLSearchParams();

  if (filter) {
    params.set("filter", filter);
  }

  if (phone) {
    params.set("phone", phone);
  }

  const query = params.toString();
  return query ? `${appPath("mission-control")}?${query}` : appPath("mission-control");
}
