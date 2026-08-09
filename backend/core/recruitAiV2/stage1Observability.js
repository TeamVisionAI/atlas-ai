/**
 * Recruit AI v2 — Stage-1 observability (telemetry only).
 * Emits normalized recruit_ai_v2.* events via whatsapp_pipeline / logWhatsAppStage.
 *
 * Best-effort and non-authoritative: never throws into callers.
 * Does not mutate appointments, Calendar, durable ownership, or execution gates.
 */

const { logWhatsAppStage } = require("../whatsappStructuredLogger");

const EVENTS = Object.freeze({
  CREATE_ATTEMPTED: "recruit_ai_v2.create_appointment.attempted",
  CREATE_SUCCEEDED: "recruit_ai_v2.create_appointment.succeeded",
  CREATE_FAILED: "recruit_ai_v2.create_appointment.failed",
  SCHEDULE_WORKFLOW_ROLLBACK: "recruit_ai_v2.schedule_workflow_rollback",
  BR125_RECLAIM_ATTEMPTED: "recruit_ai_v2.br125.reclaim.attempted",
  BR125_RECLAIM_SUCCEEDED: "recruit_ai_v2.br125.reclaim.succeeded",
  BR125_RECLAIM_FAILED: "recruit_ai_v2.br125.reclaim.failed",
  DUPLICATE_APPOINTMENT: "recruit_ai_v2.duplicate.appointment_detected",
  // Calendar duplicate intentionally omitted until a reliable determination exists.
  MISMATCH_DURABLE_CONFIRMED_NO_ACTIVE:
    "recruit_ai_v2.mismatch.durable_confirmed_no_active",
  MISMATCH_ACTIVE_UNCONFIRMED_DURABLE:
    "recruit_ai_v2.mismatch.active_unconfirmed_durable",
  CE_FALLTHROUGH_AFTER_V2_OWNERSHIP:
    "recruit_ai_v2.ce_fallthrough.after_v2_ownership",
  CALENDAR_CREATE_FAILED: "recruit_ai_v2.calendar.create_failed",
  CALENDAR_ROLLBACK_FAILED: "recruit_ai_v2.calendar.rollback_failed",
  EXECUTION_AUTHZ_DENIED: "recruit_ai_v2.execution.authz_denied",
  EXECUTION_GATE_DISABLED: "recruit_ai_v2.execution.gate_disabled",
  EXECUTION_UNSUPPORTED_MUTATION: "recruit_ai_v2.execution.unsupported_mutation",
  REPLY_DELIVERED: "recruit_ai_v2.reply.delivered"
});

const ENVELOPE_KEYS = new Set([
  "organizationId",
  "agentId",
  "prospectId",
  "phone",
  "decisionCode",
  "reasonCodes",
  "appointmentId",
  "calendarEventId",
  "correlationId",
  "providerMessageId",
  "outcome",
  "level",
  "owner",
  "replyType",
  "templateKey",
  "source",
  "detail",
  "action",
  "phase",
  "idempotent",
  "reconciled",
  "allowExecution",
  "outboundIntent",
  "deliverySuccess"
]);

function asReasonCodes(fields = {}) {
  if (Array.isArray(fields.reasonCodes)) {
    return fields.reasonCodes.filter(Boolean).map(String);
  }
  if (fields.reasonCode) {
    return [String(fields.reasonCode)];
  }
  if (fields.reason) {
    return [String(fields.reason)];
  }
  return [];
}

function buildEnvelope(fields = {}) {
  const correlationId =
    fields.correlationId || fields.providerMessageId || null;
  const extras = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      ENVELOPE_KEYS.has(key) ||
      key === "event" ||
      key === "stage" ||
      key === "component" ||
      key === "ts"
    ) {
      continue;
    }
    if (value !== undefined) {
      extras[key] = value;
    }
  }

  return {
    event: fields.event || null,
    organizationId: fields.organizationId ?? null,
    agentId: fields.agentId ?? null,
    prospectId: fields.prospectId ?? null,
    phone: fields.phone ?? null,
    decisionCode: fields.decisionCode ?? null,
    reasonCodes: asReasonCodes(fields),
    appointmentId: fields.appointmentId ?? null,
    calendarEventId: fields.calendarEventId ?? null,
    correlationId,
    outcome: fields.outcome ?? null,
    owner: fields.owner ?? null,
    replyType: fields.replyType ?? fields.templateKey ?? null,
    templateKey: fields.templateKey ?? null,
    source: fields.source ?? null,
    detail: fields.detail ?? null,
    action: fields.action ?? null,
    phase: fields.phase ?? null,
    idempotent: fields.idempotent == null ? null : Boolean(fields.idempotent),
    reconciled: fields.reconciled == null ? null : Boolean(fields.reconciled),
    allowExecution:
      fields.allowExecution == null ? null : Boolean(fields.allowExecution),
    outboundIntent: fields.outboundIntent ?? null,
    deliverySuccess:
      fields.deliverySuccess == null ? null : Boolean(fields.deliverySuccess),
    ...extras
  };
}

/**
 * Emit a Stage-1 normalized event. Never throws.
 * @param {string} event
 * @param {object} fields
 * @param {{ logStage?: Function }} [opts]
 */
function emitRecruitAiV2Signal(event, fields = {}, opts = {}) {
  try {
    if (!event || typeof event !== "string") {
      return false;
    }
    const logStage =
      typeof opts.logStage === "function" ? opts.logStage : logWhatsAppStage;
    const envelope = buildEnvelope({ ...fields, event });
    logStage(event, envelope);
    return true;
  } catch {
    return false;
  }
}

function resolveCalendarEventId(source = null) {
  if (!source || typeof source !== "object") {
    return null;
  }
  return (
    source.calendarEventId ||
    source.calendar_event_id ||
    source.googleCalendarEventId ||
    source.google_calendar_event_id ||
    source.booking?.googleCalendarEventId ||
    source.scheduleResult?.booking?.googleCalendarEventId ||
    source.scheduleResult?.googleCalendarEventId ||
    null
  );
}

module.exports = {
  EVENTS,
  emitRecruitAiV2Signal,
  buildEnvelope,
  resolveCalendarEventId,
  asReasonCodes
};
