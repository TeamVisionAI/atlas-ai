/**
 * BR-184 — Today / Action Center display constants.
 * Display priority and filters only. Does not mutate operational state.
 */

const TODAY_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

const TODAY_FILTERS = Object.freeze({
  ALL: "all",
  OVERDUE: "overdue",
  NEEDS_ATTENTION: "needs_attention",
  DUE_TODAY: "due_today",
  APPOINTMENTS: "appointments",
  FOLLOW_UPS: "follow_ups",
  DOCUMENTS: "documents"
});

const TODAY_KINDS = Object.freeze({
  NEEDS_ATTENTION: "needs_attention",
  HUMAN_TAKEOVER: "human_takeover",
  APPOINTMENT: "appointment",
  FOLLOW_UP: "follow_up",
  NEW_LEAD: "new_lead",
  SERVICE_CASE: "service_case",
  DOCUMENT_REQUEST: "document_request"
});

const TODAY_PRIORITIES = Object.freeze({
  OVERDUE: "overdue",
  NEEDS_ATTENTION: "needs_attention",
  DUE_TODAY: "due_today",
  UPCOMING_TODAY: "upcoming_today"
});

const TODAY_SECTIONS = Object.freeze({
  NEEDS_ATTENTION: "needsAttention",
  APPOINTMENTS_TODAY: "appointmentsToday",
  FOLLOW_UPS: "followUps",
  NEW_LEADS: "newLeads",
  NOTIFICATIONS: "notifications"
});

/** Lower number = higher on-screen priority. Never written back to sources. */
const DISPLAY_PRIORITY = Object.freeze({
  OVERDUE: 10,
  NEEDS_ATTENTION: 20,
  DUE_TODAY: 30,
  UPCOMING_TODAY: 40
});

const APPOINTMENT_SOON_MS = 2 * 60 * 60 * 1000;
const NOTIFICATION_LIMIT = 12;

function emptyTodayCounts() {
  return {
    overdue: 0,
    needsAttention: 0,
    dueToday: 0,
    appointmentsToday: 0,
    followUpsDueOverdue: 0,
    newActionable: 0
  };
}

function emptyTodaySections() {
  return {
    needsAttention: [],
    appointmentsToday: [],
    followUps: [],
    newLeads: [],
    notifications: []
  };
}

function emptyToday(overrides = {}) {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: false,
    organizationId: null,
    scope: TODAY_SCOPES.MINE,
    filter: TODAY_FILTERS.ALL,
    teamAvailable: false,
    timeZone: null,
    today: null,
    caughtUp: true,
    counts: emptyTodayCounts(),
    items: [],
    sections: emptyTodaySections(),
    ...overrides
  };
}

function normalizeTodayFilter(value) {
  const normalized = String(value || TODAY_FILTERS.ALL)
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  return Object.values(TODAY_FILTERS).includes(normalized) ? normalized : TODAY_FILTERS.ALL;
}

module.exports = {
  TODAY_SCOPES,
  TODAY_FILTERS,
  TODAY_KINDS,
  TODAY_PRIORITIES,
  TODAY_SECTIONS,
  DISPLAY_PRIORITY,
  APPOINTMENT_SOON_MS,
  NOTIFICATION_LIMIT,
  emptyTodayCounts,
  emptyTodaySections,
  emptyToday,
  normalizeTodayFilter
};
