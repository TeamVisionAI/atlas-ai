/**
 * BR-125 — After an authorized V2 create_appointment mutation, V2 owns
 * durable confirmed + appointment_confirmed reply. Prevents CE fallthrough /
 * "already confirmed" stub ownership when live authoring times out or loses
 * the in-flight processTurn result after mission write success.
 *
 * Active-appointment reclaim is fail-closed: exact org + canonical prospect +
 * exact slot + active lifecycle; agent when provided; never unrelated actives.
 */

const { renderCustomerReply } = require("./responseRenderer");
const { APPOINTMENT_STATUS, STAGES } = require("./conversationContext");
const {
  isActiveAppointment
} = require("../activeAppointmentResolver");

function appointmentLocalSlot(appointment = {}, timezone = "America/New_York") {
  const start = appointment.start_date_time || appointment.startDateTime || null;
  if (!start) {
    return {
      dateKey: null,
      timeKey: null,
      timezone: appointment.timezone || timezone
    };
  }
  try {
    const d = new Date(start);
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: appointment.timezone || timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: appointment.timezone || timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === "hour")?.value || "00";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    return {
      dateKey,
      timeKey: `${hour}:${minute}`,
      timezone: appointment.timezone || timezone
    };
  } catch {
    return { dateKey: null, timeKey: null, timezone: appointment.timezone || timezone };
  }
}

function slotMatchesProposed(appointment, proposedDate, proposedTime, timezone) {
  if (!appointment || !proposedDate || !proposedTime) {
    return false;
  }
  const slot = appointmentLocalSlot(appointment, timezone);
  return slot.dateKey === proposedDate && slot.timeKey === proposedTime;
}

function appointmentOrgId(appointment = {}) {
  return appointment.organizationId || appointment.organization_id || null;
}

function appointmentProspectId(appointment = {}) {
  return appointment.prospectId || appointment.prospect_id || null;
}

function appointmentAgentIds(appointment = {}) {
  return [
    appointment.agentId,
    appointment.agent_id,
    appointment.ownerRepId,
    appointment.owner_rep_id,
    appointment.interviewerUserId,
    appointment.interviewer_user_id,
    appointment.metadata?.interviewerUserId
  ]
    .filter(Boolean)
    .map((id) => String(id));
}

/**
 * Fail-closed eligibility for active-appointment reclaim (BR-125).
 */
function appointmentEligibleForReclaim(
  appointment,
  {
    organizationId = null,
    prospectId = null,
    agentId = null,
    proposedDate = null,
    proposedTime = null,
    timezone = "America/New_York"
  } = {}
) {
  if (!appointment?.id) {
    return { ok: false, reason: "MISSING_APPOINTMENT" };
  }
  if (!organizationId || !prospectId || !proposedDate || !proposedTime) {
    return { ok: false, reason: "MISSING_RECLAIM_SCOPE" };
  }
  if (!isActiveAppointment(appointment)) {
    return { ok: false, reason: "INACTIVE_LIFECYCLE" };
  }
  if (appointmentOrgId(appointment) !== organizationId) {
    return { ok: false, reason: "ORG_MISMATCH" };
  }
  if (appointmentProspectId(appointment) !== prospectId) {
    return { ok: false, reason: "PROSPECT_MISMATCH" };
  }
  if (agentId) {
    const agents = appointmentAgentIds(appointment);
    if (!agents.includes(String(agentId))) {
      return { ok: false, reason: "AGENT_MISMATCH" };
    }
  }
  if (!slotMatchesProposed(appointment, proposedDate, proposedTime, timezone)) {
    return { ok: false, reason: "SLOT_MISMATCH" };
  }
  return { ok: true, reason: null };
}

function normalizeActiveLookupResult(active) {
  if (active == null) {
    return { appointments: [], failClosed: false };
  }
  if (Array.isArray(active)) {
    if (active.length > 1) {
      return { appointments: active, failClosed: true, reason: "MULTIPLE_CANDIDATES" };
    }
    return { appointments: active.filter(Boolean), failClosed: false };
  }
  return { appointments: [active], failClosed: false };
}

function buildAppointmentConfirmedReply({
  language = "spanish",
  dateKey = null,
  timeKey = null
} = {}) {
  const rendered = renderCustomerReply({
    templateKey: "appointment_confirmed",
    language,
    entities: {
      dateLabel: dateKey,
      requestedDate: dateKey,
      requestedTime: timeKey
    }
  });
  return String(rendered?.text || "").trim();
}

function buildConfirmedDurablePatch({
  appointmentId,
  dateKey,
  timeKey,
  timezone = "America/New_York",
  baseContext = null
} = {}) {
  const appointment = {
    ...(baseContext?.appointment || {}),
    status: APPOINTMENT_STATUS.CONFIRMED,
    appointmentId,
    proposedDate: dateKey,
    proposedTime: timeKey,
    confirmedDate: dateKey,
    confirmedTime: timeKey
  };
  return {
    ...(baseContext || {}),
    timezone: timezone || baseContext?.timezone || "America/New_York",
    currentStage: STAGES.CONFIRMED,
    appointment,
    conversation: {
      ...(baseContext?.conversation || {}),
      lastOfferMade: "appointment_confirmed",
      lastQuestionAsked: "confirm_slot",
      lastProspectIntent: "schedule_confirm",
      clarificationCount: 0,
      pendingClarification: null
    }
  };
}

/**
 * Prefer the late/in-flight V2 execution result; otherwise reconcile from an
 * active Atlas appointment that matches exact reclaim scope.
 */
async function resolvePostCreateOwnership({
  v2Result = null,
  findActiveAppointment = null,
  prospectPhone = null,
  organizationId = null,
  prospectId = null,
  agentId = null,
  proposedDate = null,
  proposedTime = null,
  timezone = "America/New_York",
  language = "spanish",
  baseContext = null
} = {}) {
  if (v2Result?.execution?.success && v2Result.execution.appointmentId) {
    const performed = v2Result.execution.performed?.[0] || {};
    const dateKey =
      performed.dateKey ||
      v2Result.nextContext?.appointment?.confirmedDate ||
      proposedDate;
    const timeKey =
      performed.timeKey ||
      v2Result.nextContext?.appointment?.confirmedTime ||
      proposedTime;

    // If a concrete proposed slot is known, refuse to own a different performed slot.
    if (
      proposedDate &&
      proposedTime &&
      dateKey &&
      timeKey &&
      (dateKey !== proposedDate || timeKey !== proposedTime)
    ) {
      return {
        owned: false,
        source: null,
        reason: "V2_PERFORMED_SLOT_MISMATCH"
      };
    }

    const replyText =
      String(v2Result.rendered?.text || "").trim() ||
      buildAppointmentConfirmedReply({ language, dateKey, timeKey });
    return {
      owned: true,
      source: "v2_execution_result",
      appointmentId: v2Result.execution.appointmentId,
      dateKey,
      timeKey,
      replyText,
      nextContext: buildConfirmedDurablePatch({
        appointmentId: v2Result.execution.appointmentId,
        dateKey,
        timeKey,
        timezone:
          performed.timezone ||
          v2Result.nextContext?.timezone ||
          timezone,
        baseContext: v2Result.nextContext || baseContext
      }),
      v2Result
    };
  }

  if (typeof findActiveAppointment !== "function" || !prospectPhone || !organizationId) {
    return { owned: false, source: null, reason: "LOOKUP_UNAVAILABLE" };
  }
  if (!prospectId || !proposedDate || !proposedTime) {
    return { owned: false, source: null, reason: "MISSING_RECLAIM_SCOPE" };
  }

  let activeRaw = null;
  try {
    activeRaw = await findActiveAppointment(prospectPhone, organizationId, agentId);
  } catch {
    return { owned: false, source: null, reason: "LOOKUP_FAILED" };
  }

  const normalized = normalizeActiveLookupResult(activeRaw);
  if (normalized.failClosed) {
    return {
      owned: false,
      source: null,
      reason: normalized.reason || "MULTIPLE_CANDIDATES"
    };
  }
  const active = normalized.appointments[0] || null;
  if (!active?.id) {
    return { owned: false, source: null, reason: "NO_ACTIVE" };
  }

  const eligible = appointmentEligibleForReclaim(active, {
    organizationId,
    prospectId,
    agentId,
    proposedDate,
    proposedTime,
    timezone
  });
  if (!eligible.ok) {
    return {
      owned: false,
      source: null,
      reason: eligible.reason,
      mismatch: true
    };
  }

  const slot = appointmentLocalSlot(active, timezone);
  const dateKey = slot.dateKey || proposedDate;
  const timeKey = slot.timeKey || proposedTime;
  const replyText = buildAppointmentConfirmedReply({ language, dateKey, timeKey });
  return {
    owned: true,
    source: "active_appointment_reconcile",
    appointmentId: active.id,
    dateKey,
    timeKey,
    replyText,
    nextContext: buildConfirmedDurablePatch({
      appointmentId: active.id,
      dateKey,
      timeKey,
      timezone: slot.timezone || timezone,
      baseContext
    }),
    appointment: active
  };
}

async function persistOwnedConfirmedContext({
  ownership,
  organizationId,
  prospectId = null,
  prospectPhone = null,
  legacyProspectId = null,
  inboundMessageId = null,
  persistenceService = null
} = {}) {
  if (!ownership?.owned || !ownership.nextContext || !organizationId) {
    return { ok: false, reason: "NO_OWNERSHIP" };
  }
  try {
    const persistence =
      persistenceService ||
      (() => {
        const {
          createContextPersistenceService
        } = require("./contextPersistenceService");
        const {
          createSupabaseContextRepository,
          createMemoryContextRepository
        } = require("./contextRepository");
        let supabase = null;
        try {
          const { getServiceRoleClient } = require("../../services/backendDbService");
          supabase = getServiceRoleClient();
        } catch {
          supabase = null;
        }
        return createContextPersistenceService({
          repository: supabase
            ? createSupabaseContextRepository(supabase)
            : createMemoryContextRepository()
        });
      })();

    await persistence.compareAndSaveContext({
      organizationId,
      prospectId:
        prospectId ||
        ownership.nextContext.prospectId ||
        ownership.appointment?.prospect_id ||
        null,
      channel: "whatsapp",
      nextContext: ownership.nextContext,
      inboundMessageId,
      decisionCode: "create_appointment",
      prospectPhone,
      legacyProspectId,
      ensureCore: true
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.code || error?.message || "PERSIST_FAILED" };
  }
}

module.exports = {
  appointmentLocalSlot,
  slotMatchesProposed,
  appointmentEligibleForReclaim,
  normalizeActiveLookupResult,
  buildAppointmentConfirmedReply,
  buildConfirmedDurablePatch,
  resolvePostCreateOwnership,
  persistOwnedConfirmedContext
};
