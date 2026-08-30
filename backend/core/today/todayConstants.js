/**
 * BR-180 — Today / Action Center display constants.
 * Display priority only. Does not mutate operational state.
 */

const TODAY_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

const TODAY_KINDS = Object.freeze({
  NEEDS_ATTENTION: "needs_attention",
  APPOINTMENT: "appointment",
  FOLLOW_UP: "follow_up",
  NEW_LEAD: "new_lead",
  NOTIFICATION: "notification",
  SERVICE_CASE: "service_case"
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
  NEEDS_ATTENTION: 10,
  FOLLOW_UP_OVERDUE: 20,
  APPOINTMENT_SOON: 30,
  APPOINTMENT_TODAY: 40,
  FOLLOW_UP_DUE_TODAY: 50,
  FOLLOW_UP_NEEDS_DATE: 60,
  NEW_LEAD: 70,
  NOTIFICATION: 80
});

const APPOINTMENT_SOON_MS = 2 * 60 * 60 * 1000;
const NOTIFICATION_LIMIT = 12;

function emptyTodayCounts() {
  return {
    needsAttention: 0,
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
    teamAvailable: false,
    timeZone: null,
    today: null,
    caughtUp: true,
    counts: emptyTodayCounts(),
    sections: emptyTodaySections(),
    ...overrides
  };
}

module.exports = {
  TODAY_SCOPES,
  TODAY_KINDS,
  TODAY_SECTIONS,
  DISPLAY_PRIORITY,
  APPOINTMENT_SOON_MS,
  NOTIFICATION_LIMIT,
  emptyTodayCounts,
  emptyTodaySections,
  emptyToday
};
