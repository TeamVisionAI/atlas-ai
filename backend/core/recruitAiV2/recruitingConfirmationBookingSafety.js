/**
 * Recruiting confirmation-time booking safety (hotfix on BR-190 / BR-126).
 *
 * Reuses the BR-219 safety principle (booking may outlive the authoring wait;
 * never claim success without evidence) without copying IUL booking UX.
 *
 * - Recheck the exact selected slot before create
 * - Offer fresh alternatives when the slot is gone
 * - Late-settle / adopt a strictly matching concurrent appointment
 * - Fail closed on ambiguous matches or missing evidence
 */

const { INTENTS, REASON_CODES } = require("./constants");
const { isActiveAppointment } = require("../activeAppointmentResolver");
const {
  appointmentMatchesProspectIdentity
} = require("../appointmentProspectIdentity");
const { resolveSchedulingConfig } = require("../sharedScheduling/sharedSchedulingConfig");

const CONCURRENT_RACE_WINDOW_MS = 3 * 60 * 1000;
const RECRUITING_CONFIRM_POST_TIMEOUT_GRACE_MS = 25_000;
const RECRUITING_CONFIRM_GRACE_ENV =
  "RECRUIT_AI_V2_RECRUITING_CONFIRM_POST_TIMEOUT_GRACE_MS";
const MAX_REPLACEMENTS = 2;

function normalizeTimeKey(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return raw.length === 5 ? raw : null;
  }
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function slotDate(slot) {
  return slot?.date || slot?.dateKey || null;
}

function slotTime(slot) {
  return normalizeTimeKey(slot?.time || slot?.timeKey || null);
}

function selectedSlotFromContext(context = {}) {
  const date =
    context.appointment?.proposedDate ||
    context.appointment?.confirmedDate ||
    null;
  const time = normalizeTimeKey(
    context.appointment?.proposedTime || context.appointment?.confirmedTime || null
  );
  if (!date || !time) {
    return null;
  }
  return {
    date,
    dateKey: date,
    time,
    timeKey: time,
    timezone: context.timezone || "America/New_York",
    meetingType:
      context.knownFacts?.preferredMeetingType ||
      context.knownFacts?.meetingMode ||
      context.appointment?.meetingType ||
      null
  };
}

function isRecruitingConfirmSlotTurn({ context = {}, interpretation = null } = {}) {
  if (String(context.conversationGoal || "").toLowerCase() === "policy_review") {
    return false;
  }
  const lastQ = String(context.conversation?.lastQuestionAsked || "");
  const intent = interpretation?.intent || null;
  const slot = selectedSlotFromContext(context);
  return lastQ === "confirm_slot" && intent === INTENTS.SCHEDULE_CONFIRM && Boolean(slot);
}

function slotsIncludeExact(slots, dateKey, timeKey) {
  if (!Array.isArray(slots) || !dateKey || !timeKey) {
    return false;
  }
  const wantedTime = normalizeTimeKey(timeKey);
  return slots.some(
    (slot) =>
      String(slotDate(slot) || "") === String(dateKey) &&
      normalizeTimeKey(slotTime(slot)) === wantedTime
  );
}

function pickReplacementSlots(slots, exclude = null, max = MAX_REPLACEMENTS) {
  if (!Array.isArray(slots)) {
    return [];
  }
  const excludeDate = exclude ? String(slotDate(exclude) || "") : "";
  const excludeTime = exclude ? normalizeTimeKey(slotTime(exclude)) : null;
  const seen = new Set();
  const out = [];
  for (const slot of slots) {
    const date = slotDate(slot);
    const time = normalizeTimeKey(slotTime(slot));
    if (!date || !time) {
      continue;
    }
    if (exclude && String(date) === excludeDate && time === excludeTime) {
      continue;
    }
    const key = `${date}|${time}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      date,
      dateKey: date,
      time,
      timeKey: time,
      timezone: slot.timezone || exclude?.timezone || "America/New_York"
    });
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

function resolveGetSlots(options = {}) {
  return (
    options.getSlots ||
    options.dependencies?.getSlots ||
    ((params) =>
      require("../../application/appointmentApplicationService").getSlots(params))
  );
}

function resolveAgentId(context = {}, options = {}) {
  return (
    options.actingUserId ||
    options.agentId ||
    context.agentId ||
    context.prospectOwnerUserId ||
    context.ownerUserId ||
    null
  );
}

async function recheckSelectedSlotAvailability({
  context = {},
  options = {},
  slot = null
} = {}) {
  const selected = slot || selectedSlotFromContext(context);
  if (!selected) {
    return {
      checked: false,
      stillAvailable: false,
      replacements: [],
      slots: [],
      reason: "MISSING_SELECTED_SLOT"
    };
  }

  const organizationId = context.organizationId || options.organizationId || null;
  const agentId = resolveAgentId(context, options);
  if (!organizationId || !agentId) {
    return {
      checked: false,
      stillAvailable: false,
      replacements: [],
      slots: [],
      reason: "MISSING_SCOPE"
    };
  }

  const schedulingConfig = resolveSchedulingConfig(context, options);
  const getSlots = resolveGetSlots(options);
  let raw = [];
  try {
    const result = await getSlots({
      organizationId,
      agentId,
      date: selected.date,
      dateEnd: selected.date,
      purpose: schedulingConfig.purpose,
      timePreference: "any",
      maxResults: 48
    });
    raw = result?.slots || result?.items || (Array.isArray(result) ? result : []);
  } catch {
    return {
      checked: false,
      stillAvailable: false,
      replacements: [],
      slots: [],
      reason: "AVAILABILITY_RECHECK_FAILED"
    };
  }

  const stillAvailable = slotsIncludeExact(raw, selected.date, selected.time);
  return {
    checked: true,
    stillAvailable,
    replacements: pickReplacementSlots(raw, selected),
    slots: raw,
    reason: stillAvailable ? null : "SELECTED_SLOT_UNAVAILABLE"
  };
}

function normalizeMeetingType(value) {
  const raw = String(value || "").toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "in_person" || raw === "office" || raw.includes("in person")) {
    return "in_person";
  }
  if (raw.includes("zoom") || raw === "virtual") {
    return "zoom";
  }
  return raw;
}

function appointmentLocalSlot(appointment = {}, timezone = "America/New_York") {
  const start = appointment.start_date_time || appointment.startDateTime || null;
  if (!start) {
    return { dateKey: null, timeKey: null };
  }
  try {
    const d = new Date(start);
    const tz = appointment.timezone || timezone;
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === "hour")?.value || "00";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    return { dateKey, timeKey: `${hour}:${minute}`, timezone: tz };
  } catch {
    return { dateKey: null, timeKey: null };
  }
}

function appointmentAgentIds(appointment = {}) {
  return [
    appointment.agentId,
    appointment.agent_id,
    appointment.interviewerUserId,
    appointment.interviewer_user_id,
    appointment.metadata?.interviewerUserId,
    appointment.ownerRepId,
    appointment.owner_rep_id
  ]
    .filter(Boolean)
    .map((id) => String(id));
}

function createdWithinRaceWindow(appointment, now = Date.now(), windowMs = CONCURRENT_RACE_WINDOW_MS) {
  const created = appointment?.created_at || appointment?.createdAt || null;
  if (!created) {
    return false;
  }
  const ts = Date.parse(created);
  if (!Number.isFinite(ts)) {
    return false;
  }
  return now - ts >= -2000 && now - ts <= windowMs;
}

function appointmentMatchesConfirmedIntent(
  appointment,
  {
    organizationId = null,
    prospectId = null,
    legacyProspectId = null,
    agentId = null,
    dateKey = null,
    timeKey = null,
    timezone = "America/New_York",
    meetingType = null,
    now = Date.now(),
    raceWindowMs = CONCURRENT_RACE_WINDOW_MS
  } = {}
) {
  if (!appointment?.id) {
    return { ok: false, reason: "MISSING_APPOINTMENT" };
  }
  if (!organizationId || !dateKey || !timeKey) {
    return { ok: false, reason: "MISSING_SCOPE" };
  }
  if (!isActiveAppointment(appointment)) {
    return { ok: false, reason: "INACTIVE_LIFECYCLE" };
  }
  const apptOrg = appointment.organizationId || appointment.organization_id || null;
  if (String(apptOrg) !== String(organizationId)) {
    return { ok: false, reason: "ORG_MISMATCH" };
  }
  const identities = [prospectId, legacyProspectId].filter(Boolean);
  if (!identities.length) {
    return { ok: false, reason: "MISSING_PROSPECT" };
  }
  if (!identities.some((id) => appointmentMatchesProspectIdentity(appointment, id))) {
    return { ok: false, reason: "PROSPECT_MISMATCH" };
  }
  if (agentId) {
    const agents = appointmentAgentIds(appointment);
    if (!agents.includes(String(agentId))) {
      return { ok: false, reason: "AGENT_MISMATCH" };
    }
  }
  const slot = appointmentLocalSlot(appointment, timezone);
  if (
    String(slot.dateKey) !== String(dateKey) ||
    normalizeTimeKey(slot.timeKey) !== normalizeTimeKey(timeKey)
  ) {
    return { ok: false, reason: "SLOT_MISMATCH" };
  }
  const wantedTz = String(timezone || "America/New_York");
  const apptTz = String(appointment.timezone || slot.timezone || wantedTz);
  if (apptTz !== wantedTz) {
    return { ok: false, reason: "TIMEZONE_MISMATCH" };
  }
  const wantedMode = normalizeMeetingType(meetingType);
  const apptMode = normalizeMeetingType(
    appointment.meeting_type || appointment.meetingType
  );
  if (wantedMode && apptMode && wantedMode !== apptMode) {
    return { ok: false, reason: "MODALITY_MISMATCH" };
  }
  if (!createdWithinRaceWindow(appointment, now, raceWindowMs)) {
    return { ok: false, reason: "OUTSIDE_RACE_WINDOW" };
  }
  return { ok: true, reason: null };
}

function selectAdoptedConcurrentAppointment(
  appointments,
  intent,
  { failClosedOnMultiple = true } = {}
) {
  const list = Array.isArray(appointments)
    ? appointments
    : appointments
      ? [appointments]
      : [];
  const matches = [];
  for (const appointment of list) {
    const verdict = appointmentMatchesConfirmedIntent(appointment, intent);
    if (verdict.ok) {
      matches.push(appointment);
    }
  }
  if (matches.length === 1) {
    return { appointment: matches[0], reason: null };
  }
  if (matches.length > 1 && failClosedOnMultiple) {
    return { appointment: null, reason: "MULTIPLE_CANDIDATES" };
  }
  return { appointment: null, reason: matches.length ? "AMBIGUOUS" : "NO_MATCH" };
}

function resolveRecruitingConfirmGraceMs(env = process.env) {
  const raw = env?.[RECRUITING_CONFIRM_GRACE_ENV];
  if (raw == null || raw === "") {
    return RECRUITING_CONFIRM_POST_TIMEOUT_GRACE_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 45_000) {
    return RECRUITING_CONFIRM_POST_TIMEOUT_GRACE_MS;
  }
  return Math.floor(n);
}

module.exports = {
  CONCURRENT_RACE_WINDOW_MS,
  RECRUITING_CONFIRM_POST_TIMEOUT_GRACE_MS,
  RECRUITING_CONFIRM_GRACE_ENV,
  MAX_REPLACEMENTS,
  normalizeTimeKey,
  selectedSlotFromContext,
  isRecruitingConfirmSlotTurn,
  slotsIncludeExact,
  pickReplacementSlots,
  recheckSelectedSlotAvailability,
  appointmentLocalSlot,
  appointmentMatchesConfirmedIntent,
  selectAdoptedConcurrentAppointment,
  createdWithinRaceWindow,
  resolveRecruitingConfirmGraceMs,
  REASON_SELECTED_SLOT_UNAVAILABLE: "SELECTED_SLOT_UNAVAILABLE",
  REASON_CODES_USED: {
    SELECTED_SLOT_UNAVAILABLE: REASON_CODES.SLOT_UNAVAILABLE_OFFER_ALTERNATIVES
  }
};
