/**
 * BR-178 — outcome → follow-up obligation plan.
 * Reuses existing interview cadence defaults. Does not invent aggressive outreach.
 * Does not send WhatsApp / SMS / email.
 */

const { OUTCOME_KEYS, FOLLOW_UP_SURFACES } = require("./constants");
const { addIsoDateDays, normalizeDueDate, normalizeDueTime } = require("./classification");

const OUTCOME_ALIASES = Object.freeze({
  follow_up: OUTCOME_KEYS.FOLLOW_UP,
  follow_up_needed: OUTCOME_KEYS.FOLLOW_UP,
  needs_more_time: OUTCOME_KEYS.FOLLOW_UP,
  thinking_about_it: OUTCOME_KEYS.FOLLOW_UP,
  wants_to_talk_to_spouse: OUTCOME_KEYS.FOLLOW_UP,
  call_back_later: OUTCOME_KEYS.FOLLOW_UP,
  no_show: OUTCOME_KEYS.NO_SHOW,
  not_interested: OUTCOME_KEYS.NOT_INTERESTED,
  recruited: OUTCOME_KEYS.RECRUITED,
  pending_iba: OUTCOME_KEYS.RECRUITED,
  client: OUTCOME_KEYS.CLIENT,
  became_client: OUTCOME_KEYS.CLIENT,
  rescheduled: OUTCOME_KEYS.RESCHEDULED,
  reschedule_interview: OUTCOME_KEYS.RESCHEDULED,
  cancelled: OUTCOME_KEYS.CANCELLED,
  other: OUTCOME_KEYS.OTHER
});

function slugifyOutcome(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeOutcomeKey(value) {
  return OUTCOME_ALIASES[slugifyOutcome(value)] || null;
}

function planFollowUpFromOutcome({
  outcome,
  surface = FOLLOW_UP_SURFACES.INTERVIEW,
  dueDate = null,
  dueTime = null,
  futureReminder = null,
  today = null
} = {}) {
  const outcomeKey = normalizeOutcomeKey(outcome);
  const explicitDate = normalizeDueDate(dueDate) || normalizeDueDate(futureReminder);
  const explicitTime = normalizeDueTime(dueTime);
  const todayDate = normalizeDueDate(today);

  if (!outcomeKey || outcomeKey === OUTCOME_KEYS.RESCHEDULED) {
    return { create: false, reason: "appointment_is_next_action", outcomeKey };
  }
  if (outcomeKey === OUTCOME_KEYS.CANCELLED || outcomeKey === OUTCOME_KEYS.OTHER) {
    return { create: false, reason: "no_automatic_outreach", outcomeKey };
  }

  if (outcomeKey === OUTCOME_KEYS.NOT_INTERESTED) {
    if (!explicitDate) {
      return { create: false, reason: "no_recycle_date", outcomeKey };
    }
    return {
      create: true,
      outcomeKey,
      title: "Recycle follow-up",
      dueDate: explicitDate,
      dueTime: explicitTime,
      sourceEvent: "outcome:not_interested"
    };
  }

  if (outcomeKey === OUTCOME_KEYS.FOLLOW_UP) {
    return {
      create: true,
      outcomeKey,
      title: "Follow-up",
      dueDate: explicitDate || addIsoDateDays(todayDate, 3),
      dueTime: explicitTime || "10:00",
      sourceEvent: "outcome:follow_up"
    };
  }

  if (outcomeKey === OUTCOME_KEYS.NO_SHOW) {
    return {
      create: true,
      outcomeKey,
      title: "No-show retry",
      dueDate: explicitDate || addIsoDateDays(todayDate, 7),
      dueTime: explicitTime || "10:00",
      sourceEvent: "outcome:no_show"
    };
  }

  if (outcomeKey === OUTCOME_KEYS.RECRUITED) {
    return {
      create: true,
      outcomeKey,
      title: "IBA / onboarding check-in",
      dueDate: explicitDate || addIsoDateDays(todayDate, 3),
      dueTime: explicitTime,
      sourceEvent: "outcome:recruited"
    };
  }

  if (outcomeKey === OUTCOME_KEYS.CLIENT) {
    if (surface === FOLLOW_UP_SURFACES.AGENDA) {
      return { create: false, reason: "no_client_crm_workflow", outcomeKey };
    }
    return {
      create: true,
      outcomeKey,
      title: "Client service check-in",
      dueDate: explicitDate || addIsoDateDays(todayDate, 2),
      dueTime: explicitTime,
      sourceEvent: "outcome:client"
    };
  }

  return { create: false, reason: "unmapped_outcome", outcomeKey };
}

function buildOutcomeDedupKey({
  surface,
  entityType,
  entityId,
  outcomeKey,
  appointmentId = null
}) {
  return [
    "outcome",
    String(surface || "unknown"),
    String(entityType || "unknown"),
    String(entityId || "none"),
    String(outcomeKey || "unknown"),
    String(appointmentId || "none")
  ].join(":");
}

function buildLegacyConversionDedupKey({ entityType, entityId }) {
  return ["legacy", String(entityType || "unknown"), String(entityId || "none")].join(":");
}

function buildManualDedupKey({ entityType, entityId, dueDate, notes = "" }) {
  const noteToken = String(notes || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return ["manual", String(entityType || "unknown"), String(entityId || "none"), String(dueDate || "none"), noteToken || "none"].join(
    ":"
  );
}

module.exports = {
  normalizeOutcomeKey,
  planFollowUpFromOutcome,
  buildOutcomeDedupKey,
  buildLegacyConversionDedupKey,
  buildManualDedupKey
};
