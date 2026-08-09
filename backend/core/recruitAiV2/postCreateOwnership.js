/**
 * BR-125 — After an authorized V2 create_appointment mutation, V2 owns
 * durable confirmed + appointment_confirmed reply. Prevents CE fallthrough /
 * "already confirmed" stub ownership when live authoring times out or loses
 * the in-flight processTurn result after mission write success.
 */

const { renderCustomerReply } = require("./responseRenderer");
const { APPOINTMENT_STATUS, STAGES } = require("./conversationContext");

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
    return Boolean(appointment?.id);
  }
  const slot = appointmentLocalSlot(appointment, timezone);
  return slot.dateKey === proposedDate && slot.timeKey === proposedTime;
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
 * active Atlas appointment that matches the durable proposed slot.
 */
async function resolvePostCreateOwnership({
  v2Result = null,
  findActiveAppointment = null,
  prospectPhone = null,
  organizationId = null,
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
    return { owned: false, source: null };
  }

  let active = null;
  try {
    active = await findActiveAppointment(prospectPhone, organizationId);
  } catch {
    return { owned: false, source: null };
  }
  if (!active?.id) {
    return { owned: false, source: null };
  }
  if (
    proposedDate &&
    proposedTime &&
    !slotMatchesProposed(active, proposedDate, proposedTime, timezone)
  ) {
    return { owned: false, source: null, mismatch: true };
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
  buildAppointmentConfirmedReply,
  buildConfirmedDurablePatch,
  resolvePostCreateOwnership,
  persistOwnedConfirmedContext
};
