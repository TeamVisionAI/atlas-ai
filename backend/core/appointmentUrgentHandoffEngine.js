/**
 * Urgent appointment handoff — <=60 minute lead time.
 * Reuses appointment confirmation copy, WhatsApp outbound, reminder cadence, and audit logging.
 * Agent WhatsApp alerts fail closed unless explicit notification_preferences are configured.
 */

const crypto = require("crypto");
const { findProspectInOrganization } = require("../services/supabaseService");
const { sendTextMessage } = require("../services/whatsappService");
const { writeAuditLog } = require("../security/auditLogService");
const { isVirtualMeeting, buildPersistedAppointmentConfirmation } = require("./appointmentConfirmationCopy");
const { APPOINTMENT_PURPOSES } = require("./configuration/appointmentDomain");
const {
  URGENT_LEAD_TIME_MS,
  ESCALATION_LEAD_TIME_MS,
  HANDOFF_STATUSES,
  DELIVERY_STATUSES,
  AUDIT_ACTIONS
} = require("./appointmentUrgentHandoffConstants");
const {
  resolveAgentUrgentWhatsAppDestination,
  resolveUrgentEscalationWhatsAppDestination
} = require("./agentNotificationDestinationResolver");
const {
  resolveAppointmentUrgentHandoffRepository
} = require("../repositories/appointmentUrgentHandoffRepository");

function resolveAppointmentStartMs(appointment = {}) {
  const raw = appointment.startDateTime || appointment.start_date_time;
  const ms = Date.parse(raw || "");
  return Number.isFinite(ms) ? ms : null;
}

function computeMinutesUntilStart(appointment, reference = new Date()) {
  const startMs = resolveAppointmentStartMs(appointment);

  if (!startMs) {
    return null;
  }

  return Math.max(0, Math.round((startMs - reference.getTime()) / 60_000));
}

function isUrgentAppointment(appointment, reference = new Date()) {
  const startMs = resolveAppointmentStartMs(appointment);

  if (!startMs) {
    return false;
  }

  const leadMs = startMs - reference.getTime();
  return leadMs > 0 && leadMs <= URGENT_LEAD_TIME_MS;
}

function resolveAssignedUserId(appointment = {}) {
  return (
    appointment.interviewerUserId ||
    appointment.interviewer_user_id ||
    appointment.agentId ||
    appointment.agent_id ||
    null
  );
}

function resolvePurposeLabel(purpose, language = "en") {
  const key = String(purpose || "").toLowerCase();

  if (key === APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW) {
    return language === "es" ? "Reclutamiento" : "Recruiting";
  }

  if (key === APPOINTMENT_PURPOSES.POLICY_REVIEW) {
    return language === "es" ? "Revisión IUL" : "IUL Review";
  }

  if (key === APPOINTMENT_PURPOSES.FNA) {
    return "FNA";
  }

  if (key === APPOINTMENT_PURPOSES.CLIENT_SERVICE) {
    return language === "es" ? "Servicio al cliente" : "Client Service";
  }

  if (key === APPOINTMENT_PURPOSES.TRAINING) {
    return language === "es" ? "Entrenamiento" : "Training";
  }

  return purpose || (language === "es" ? "Cita" : "Appointment");
}

function resolveMeetingTypeLabel(appointment = {}, language = "en") {
  if (isVirtualMeeting(appointment)) {
    return "Zoom";
  }

  const meetingType = String(appointment.meetingType || appointment.meeting_type || "").toLowerCase();

  if (meetingType.includes("phone")) {
    return language === "es" ? "Teléfono" : "Phone";
  }

  return language === "es" ? "Presencial" : "In Person";
}

function buildProspectWorkspacePath(prospectPhone) {
  if (!prospectPhone) {
    return null;
  }

  return `/app/prospect-workspace/${encodeURIComponent(prospectPhone)}`;
}

function buildAgentWhatsAppAlertMessage(handoff, language = "es") {
  const firstName = String(handoff.prospectName || "").trim().split(/\s+/)[0] || "Prospect";
  const purpose = resolvePurposeLabel(handoff.purpose, language);
  const meeting = resolveMeetingTypeLabel(handoff, language);
  const minutes = handoff.minutesUntilStart ?? computeMinutesUntilStart(handoff);
  const when = handoff.appointmentStart
    ? new Date(handoff.appointmentStart).toLocaleString(language === "es" ? "es-US" : "en-US", {
        hour: "numeric",
        minute: "2-digit"
      })
    : "";
  const workspacePath = buildProspectWorkspacePath(handoff.prospectPhone);
  const linkLine = workspacePath
    ? language === "es"
      ? `\nAbrir: ${workspacePath}`
      : `\nOpen: ${workspacePath}`
    : "";

  if (language === "es") {
    return `🚨 Nueva entrevista — HOY ${when}\n${firstName} · ${purpose} · ${meeting}\nComienza en ${minutes} minutos.${linkLine}`;
  }

  return `🚨 New interview — TODAY ${when}\n${firstName} · ${purpose} · ${meeting}\nStarts in ${minutes} minutes.${linkLine}`;
}

async function writeHandoffAudit({ organizationId, userId, action, appointmentId, metadata = {} }) {
  try {
    await writeAuditLog({
      organizationId,
      userId: userId || null,
      action,
      targetType: "appointment",
      targetId: appointmentId,
      result: "success",
      metadata
    });
  } catch (error) {
    console.error("[urgent-handoff] audit failed:", action, error.message);
  }
}

async function sendProspectUrgentConfirmation(appointment, prospect) {
  const confirmation = buildPersistedAppointmentConfirmation(appointment, prospect);
  const {
    buildInterviewConfirmationVariables
  } = require("./whatsappTemplateVariableBuilder");

  const result = await sendTextMessage(appointment.prospectPhone, confirmation.text, {
    intent: "APPOINTMENT_CONFIRMATION",
    actor: "ATLAS",
    organizationId: appointment.organizationId,
    templateKey: "interview_confirmation",
    templateVariables: buildInterviewConfirmationVariables(appointment, prospect),
    idempotencyKey: confirmation.idempotencyKey
  });

  return {
    success: Boolean(result.success),
    status: result.success ? DELIVERY_STATUSES.SENT : DELIVERY_STATUSES.FAILED,
    delivery: result
  };
}

async function attemptAgentWhatsAppAlert(handoff, { organizationId, assignedUserId }) {
  const destination = await resolveAgentUrgentWhatsAppDestination({
    userId: assignedUserId,
    organizationId
  });

  if (!destination) {
    await writeHandoffAudit({
      organizationId,
      userId: assignedUserId,
      action: AUDIT_ACTIONS.AGENT_WHATSAPP_SKIPPED,
      appointmentId: handoff.appointmentId,
      metadata: { reason: "NO_EXPLICIT_AGENT_WHATSAPP_DESTINATION" }
    });

    return {
      status: DELIVERY_STATUSES.SKIPPED,
      reason: "NO_EXPLICIT_AGENT_WHATSAPP_DESTINATION"
    };
  }

  const message = buildAgentWhatsAppAlertMessage(handoff, "es");
  const idempotencyKey = `urgent-handoff-agent:${handoff.appointmentId}:${assignedUserId}`;

  const result = await sendTextMessage(destination.whatsappE164, message, {
    intent: "URGENT_APPOINTMENT_HANDOFF",
    actor: "ATLAS",
    organizationId,
    idempotencyKey
  });

  if (!result.success) {
    await writeHandoffAudit({
      organizationId,
      userId: assignedUserId,
      action: AUDIT_ACTIONS.AGENT_WHATSAPP_FAILED,
      appointmentId: handoff.appointmentId,
      metadata: { reason: result.error || result.status || "SEND_FAILED" }
    });

    return {
      status: DELIVERY_STATUSES.FAILED,
      reason: result.error || result.status || "SEND_FAILED"
    };
  }

  await writeHandoffAudit({
    organizationId,
    userId: assignedUserId,
    action: AUDIT_ACTIONS.AGENT_WHATSAPP_SENT,
    appointmentId: handoff.appointmentId
  });

  return {
    status: DELIVERY_STATUSES.SENT,
    sentAt: new Date().toISOString()
  };
}

async function processUrgentHandoffOnCreate(appointment, context = {}) {
  const reference = context.reference ? new Date(context.reference) : new Date();

  if (!isUrgentAppointment(appointment, reference)) {
    return { triggered: false, reason: "NOT_URGENT" };
  }

  const organizationId = appointment.organizationId || context.organizationId;
  const assignedUserId = resolveAssignedUserId(appointment);

  if (!organizationId || !assignedUserId || !appointment.id || !appointment.prospectPhone) {
    return { triggered: false, reason: "MISSING_REQUIRED_CONTEXT" };
  }

  const repository = await resolveAppointmentUrgentHandoffRepository(context);
  const existing = await repository.findByAppointmentId(appointment.id);

  if (existing && existing.metadata?.processedAt) {
    return { triggered: true, idempotent: true, handoff: existing };
  }

  const startMs = resolveAppointmentStartMs(appointment);
  const minutesUntilStart = computeMinutesUntilStart(appointment, reference);
  const escalationDueAt = new Date(startMs - ESCALATION_LEAD_TIME_MS).toISOString();
  const prospect =
    context.prospect ||
    (await findProspectInOrganization(appointment.prospectPhone, organizationId)) ||
    {};

  let handoff = await repository.upsert({
    id: existing?.id || crypto.randomUUID(),
    organizationId,
    appointmentId: appointment.id,
    assignedUserId,
    prospectPhone: appointment.prospectPhone,
    prospectName: prospect.name || appointment.metadata?.prospectName || null,
    appointmentStart: appointment.startDateTime,
    purpose: appointment.purpose || null,
    meetingType: appointment.meetingType || null,
    minutesUntilStart,
    status: HANDOFF_STATUSES.OPEN,
    escalationDueAt,
    metadata: {
      ...(existing?.metadata || {}),
      triggeredAt: reference.toISOString()
    }
  });

  await writeHandoffAudit({
    organizationId,
    userId: assignedUserId,
    action: AUDIT_ACTIONS.CREATED,
    appointmentId: appointment.id,
    metadata: { minutesUntilStart }
  });

  const prospectDelivery = await sendProspectUrgentConfirmation(appointment, prospect);
  handoff = await repository.save({
    ...handoff,
    prospectConfirmationStatus: prospectDelivery.status,
    prospectConfirmationSentAt:
      prospectDelivery.status === DELIVERY_STATUSES.SENT ? new Date().toISOString() : null
  });

  await writeHandoffAudit({
    organizationId,
    userId: assignedUserId,
    action:
      prospectDelivery.success === false
        ? AUDIT_ACTIONS.PROSPECT_CONFIRMATION_FAILED
        : AUDIT_ACTIONS.PROSPECT_CONFIRMATION_SENT,
    appointmentId: appointment.id,
    metadata: { status: prospectDelivery.status }
  });

  const agentDelivery = await attemptAgentWhatsAppAlert(handoff, {
    organizationId,
    assignedUserId
  });

  handoff = await repository.save({
    ...handoff,
    agentWhatsappStatus: agentDelivery.status,
    agentWhatsappSentAt: agentDelivery.sentAt || null,
    metadata: {
      ...handoff.metadata,
      processedAt: new Date().toISOString(),
      agentWhatsappReason: agentDelivery.reason || null
    }
  });

  return {
    triggered: true,
    handoff,
    prospectConfirmation: prospectDelivery,
    agentWhatsapp: agentDelivery
  };
}

async function acknowledgeUrgentHandoff(handoffId, context = {}) {
  const { organizationId, userId } = context;

  if (!organizationId || !userId || !handoffId) {
    const error = new Error("organizationId, userId, and handoffId are required.");
    error.statusCode = 400;
    throw error;
  }

  const repository = await resolveAppointmentUrgentHandoffRepository(context);
  const handoff = await repository.findById(handoffId);

  if (!handoff || handoff.organizationId !== organizationId) {
    const error = new Error("Urgent handoff not found.");
    error.statusCode = 404;
    throw error;
  }

  if (handoff.status !== HANDOFF_STATUSES.OPEN) {
    return { handoff, alreadyAcknowledged: true };
  }

  if (handoff.assignedUserId !== userId && handoff.escalatedToUserId !== userId) {
    const error = new Error("Not authorized to acknowledge this urgent handoff.");
    error.statusCode = 403;
    throw error;
  }

  const updated = await repository.save({
    ...handoff,
    status: HANDOFF_STATUSES.ACKNOWLEDGED,
    acknowledgedAt: new Date().toISOString(),
    acknowledgedByUserId: userId
  });

  await writeHandoffAudit({
    organizationId,
    userId,
    action: AUDIT_ACTIONS.ACKNOWLEDGED,
    appointmentId: handoff.appointmentId
  });

  return { handoff: updated, alreadyAcknowledged: false };
}

async function listOpenUrgentHandoffsForUser(context = {}) {
  const { organizationId, userId } = context;

  if (!organizationId || !userId) {
    return [];
  }

  const repository = await resolveAppointmentUrgentHandoffRepository(context);
  return repository.listOpenForUser({ organizationId, userId });
}

async function processDueUrgentEscalations(options = {}) {
  const reference = options.reference ? new Date(options.reference) : new Date();
  const repository = await resolveAppointmentUrgentHandoffRepository(options);
  const due = await repository.listDueForEscalation(reference.toISOString());
  const results = [];

  for (const handoff of due) {
    if (handoff.acknowledgedAt || handoff.status !== HANDOFF_STATUSES.OPEN) {
      continue;
    }

    if (handoff.metadata?.escalationNotifiedAt) {
      continue;
    }

    const escalationDestination = await resolveUrgentEscalationWhatsAppDestination({
      organizationId: handoff.organizationId
    });

    if (!escalationDestination) {
      await writeHandoffAudit({
        organizationId: handoff.organizationId,
        userId: handoff.assignedUserId,
        action: AUDIT_ACTIONS.ESCALATION_SKIPPED,
        appointmentId: handoff.appointmentId,
        metadata: { reason: "NO_EXPLICIT_ESCALATION_WHATSAPP_DESTINATION" }
      });

      results.push({
        handoffId: handoff.id,
        escalated: false,
        reason: "NO_EXPLICIT_ESCALATION_WHATSAPP_DESTINATION"
      });
      continue;
    }

    const message = buildAgentWhatsAppAlertMessage(
      {
        ...handoff,
        minutesUntilStart: computeMinutesUntilStart(handoff, reference)
      },
      "es"
    );

    const idempotencyKey = `urgent-handoff-escalation:${handoff.appointmentId}:${escalationDestination.userId}`;
    const result = await sendTextMessage(escalationDestination.whatsappE164, message, {
      intent: "URGENT_APPOINTMENT_HANDOFF_ESCALATION",
      actor: "ATLAS",
      organizationId: handoff.organizationId,
      idempotencyKey
    });

    const updated = await repository.save({
      ...handoff,
      escalatedAt: new Date().toISOString(),
      escalatedToUserId: escalationDestination.userId,
      metadata: {
        ...handoff.metadata,
        escalationNotifiedAt: new Date().toISOString(),
        escalationWhatsappStatus: result.success ? DELIVERY_STATUSES.SENT : DELIVERY_STATUSES.FAILED
      }
    });

    await writeHandoffAudit({
      organizationId: handoff.organizationId,
      userId: escalationDestination.userId,
      action: AUDIT_ACTIONS.ESCALATED,
      appointmentId: handoff.appointmentId,
      metadata: { whatsappSent: Boolean(result.success) }
    });

    results.push({
      handoffId: updated.id,
      escalated: true,
      handoff: updated
    });
  }

  return results;
}

function startUrgentHandoffEscalationPoller(intervalMs = 60_000) {
  let running = false;

  const timer = setInterval(async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      await processDueUrgentEscalations();
    } catch (error) {
      console.error("[urgent-handoff] escalation poller failed:", error.message);
    } finally {
      running = false;
    }
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}

async function cancelUrgentHandoffForAppointment(appointmentId, context = {}) {
  if (!appointmentId) {
    return null;
  }

  const repository = await resolveAppointmentUrgentHandoffRepository(context);
  const handoff = await repository.findByAppointmentId(appointmentId);

  if (!handoff || handoff.status !== HANDOFF_STATUSES.OPEN) {
    return handoff;
  }

  return repository.save({
    ...handoff,
    status: HANDOFF_STATUSES.CANCELLED,
    metadata: {
      ...handoff.metadata,
      cancelledAt: new Date().toISOString()
    }
  });
}

module.exports = {
  URGENT_LEAD_TIME_MS,
  isUrgentAppointment,
  computeMinutesUntilStart,
  resolvePurposeLabel,
  resolveMeetingTypeLabel,
  buildAgentWhatsAppAlertMessage,
  processUrgentHandoffOnCreate,
  acknowledgeUrgentHandoff,
  listOpenUrgentHandoffsForUser,
  processDueUrgentEscalations,
  startUrgentHandoffEscalationPoller,
  cancelUrgentHandoffForAppointment
};
