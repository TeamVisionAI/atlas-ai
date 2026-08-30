/**
 * BR-178 — date-only-safe classification and presentation helpers.
 * Never treats an invented midnight as a real clock time.
 */

const {
  RELATIVE_PERIODS,
  getOrganizationDateWindow,
  zonedTimeToUtcMs
} = require("../organizationDateWindow");
const { FOLLOW_UP_STATUSES, FOLLOW_UP_VIEW_STATUSES, FOLLOW_UP_PRIORITIES } = require("./constants");

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeDueDate(value) {
  const raw = String(value || "").trim().slice(0, 10);
  return DATE_ONLY_RE.test(raw) ? raw : null;
}

function normalizeDueTime(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

function addIsoDateDays(isoDate, days) {
  const date = normalizeDueDate(isoDate);
  if (!date) {
    return null;
  }
  const [, year, month, day] = date.match(DATE_ONLY_RE);
  const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + Number(days || 0)));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function todayIsoDate(organizationId, reference = new Date()) {
  const window = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference
  });
  return String(window.localStart || "").slice(0, 10);
}

function resolveDueAt({ dueDate, dueTime, timeZone }) {
  const date = normalizeDueDate(dueDate);
  if (!date) {
    return null;
  }
  const [, year, month, day] = date.match(DATE_ONLY_RE);
  const time = normalizeDueTime(dueTime);
  const hour = time ? Number(time.slice(0, 2)) : 0;
  const minute = time ? Number(time.slice(3, 5)) : 0;
  const zone = timeZone || "America/New_York";
  return new Date(
    zonedTimeToUtcMs(Number(year), Number(month), Number(day), hour, minute, 0, 0, zone)
  ).toISOString();
}

function classifyPersistedFollowUp(row, { today } = {}) {
  const persisted = String(row?.status || FOLLOW_UP_STATUSES.OPEN).toUpperCase();
  if (persisted === FOLLOW_UP_STATUSES.COMPLETED) {
    return {
      persistedStatus: FOLLOW_UP_STATUSES.COMPLETED,
      status: FOLLOW_UP_STATUSES.COMPLETED,
      viewStatus: FOLLOW_UP_VIEW_STATUSES.COMPLETED
    };
  }
  if (persisted === FOLLOW_UP_STATUSES.CANCELLED) {
    return {
      persistedStatus: FOLLOW_UP_STATUSES.CANCELLED,
      status: FOLLOW_UP_STATUSES.CANCELLED,
      viewStatus: FOLLOW_UP_VIEW_STATUSES.COMPLETED
    };
  }

  const dueDate = normalizeDueDate(row?.dueDate || row?.due_date);
  const todayDate = normalizeDueDate(today);
  if (!dueDate || !todayDate) {
    return {
      persistedStatus: FOLLOW_UP_STATUSES.OPEN,
      status: FOLLOW_UP_STATUSES.OVERDUE,
      viewStatus: FOLLOW_UP_VIEW_STATUSES.OVERDUE
    };
  }
  if (dueDate < todayDate) {
    return {
      persistedStatus: FOLLOW_UP_STATUSES.OPEN,
      status: FOLLOW_UP_STATUSES.OVERDUE,
      viewStatus: FOLLOW_UP_VIEW_STATUSES.OVERDUE
    };
  }
  if (dueDate === todayDate) {
    return {
      persistedStatus: FOLLOW_UP_STATUSES.OPEN,
      status: FOLLOW_UP_STATUSES.DUE,
      viewStatus: FOLLOW_UP_VIEW_STATUSES.DUE_TODAY
    };
  }
  return {
    persistedStatus: FOLLOW_UP_STATUSES.OPEN,
    status: FOLLOW_UP_STATUSES.OPEN,
    viewStatus: FOLLOW_UP_VIEW_STATUSES.UPCOMING
  };
}

function priorityForViewStatus(viewStatus) {
  if (viewStatus === FOLLOW_UP_VIEW_STATUSES.OVERDUE || viewStatus === FOLLOW_UP_VIEW_STATUSES.DUE_TODAY) {
    return FOLLOW_UP_PRIORITIES.HIGH;
  }
  return FOLLOW_UP_PRIORITIES.NORMAL;
}

function formatDueLabel(dueDate, dueTime, locale = "en-US") {
  const date = normalizeDueDate(dueDate);
  if (!date) {
    return null;
  }
  const time = normalizeDueTime(dueTime);
  const parsed = Date.parse(time ? `${date}T${time}:00` : `${date}T12:00:00`);
  if (Number.isNaN(parsed)) {
    return date;
  }
  const options = time
    ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { weekday: "short", month: "short", day: "numeric" };
  return new Date(parsed).toLocaleString(locale, options);
}

module.exports = {
  DATE_ONLY_RE,
  TIME_RE,
  normalizeDueDate,
  normalizeDueTime,
  addIsoDateDays,
  todayIsoDate,
  resolveDueAt,
  classifyPersistedFollowUp,
  priorityForViewStatus,
  formatDueLabel
};
