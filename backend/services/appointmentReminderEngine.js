/**
 * Sprint 22.1 — Appointment Reminder Engine with delivery.
 * Reuses whatsappService; records reminder_sent business events.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sendTextMessage } = require("./whatsappService");
const { findProspectInOrganization } = require("./supabaseService");
const { recordBusinessEvent } = require("../core/recruitingBusinessEventBridge");
const { APPOINTMENT_EVENTS } = require("../modules/business-events/domain/EventTypes");
const { REMINDER_STATUSES } = require("../core/configuration/appointmentDomain");
const {
  resolveProspectPreferredLanguage,
  preferredLanguageToCommunicationCode
} = require("../core/prospectLanguage");
const {
  isVirtualMeeting,
  formatAppointmentWhen
} = require("../core/appointmentConfirmationCopy");

const REMINDER_FILE = path.join(__dirname, "../data/appointmentReminders.json");

const REMINDER_TYPES = Object.freeze({
  // Immediate booking confirmation is owned by appointment persistence → Conversation
  // reply with idempotency key appointment-confirmation:{id}. Do not send a second one.
  CONFIRMATION: "confirmation",
  REMINDER_24H: "reminder_24h",
  REMINDER_1H: "reminder_1h",
  REMINDER_15M: "reminder_15m"
});

const REMINDER_SCHEDULE = Object.freeze([
  { type: REMINDER_TYPES.REMINDER_24H, offsetMinutes: 24 * 60 },
  { type: REMINDER_TYPES.REMINDER_1H, offsetMinutes: 60 },
  { type: REMINDER_TYPES.REMINDER_15M, offsetMinutes: 15 }
]);

function readStore() {
  try {
    if (!fs.existsSync(REMINDER_FILE)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(REMINDER_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(store) {
  const dir = path.dirname(REMINDER_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(REMINDER_FILE, JSON.stringify(store, null, 2));
}

function formatWhen(iso, timezone = "America/New_York", languageCode = "en") {
  return formatAppointmentWhen(
    { startDateTime: iso, timezone },
    languageCode
  );
}

function buildReminderMessage(appointment, reminderType, prospect) {
  const preferred = resolveProspectPreferredLanguage(prospect);
  const language = preferredLanguageToCommunicationCode(preferred);
  const name = prospect?.name || appointment.metadata?.prospectName || "";
  const first = name ? String(name).trim().split(/\s+/)[0] : "";
  const when = formatWhen(appointment.startDateTime, appointment.timezone, language);
  const virtual = isVirtualMeeting(appointment);
  const meetLink = appointment.virtualMeetingUrl
    ? language === "es"
      ? `\nEnlace: ${appointment.virtualMeetingUrl}`
      : `\nLink: ${appointment.virtualMeetingUrl}`
    : "";
  const channelLabel =
    language === "es"
      ? virtual
        ? "por Zoom"
        : "en la oficina"
      : virtual
        ? "via Zoom"
        : "at our office";

  if (language === "es") {
    const greeting = first ? `Hola ${first},` : "Hola,";
    switch (reminderType) {
      case REMINDER_TYPES.CONFIRMATION:
        // Kept for backwards-compatible delivery of legacy queued confirmation rows only.
        return `${greeting} tu entrevista ${channelLabel} quedó confirmada para ${when}.${meetLink}\n\nTeam Vision`;
      case REMINDER_TYPES.REMINDER_24H:
        return `${greeting} te recordamos que mañana tienes tu entrevista ${channelLabel} (${when}).${meetLink}\n\nTeam Vision`;
      case REMINDER_TYPES.REMINDER_1H:
        return `${greeting} tu entrevista ${channelLabel} es en 1 hora (${when}).${meetLink}\n\nTeam Vision`;
      case REMINDER_TYPES.REMINDER_15M:
        return `${greeting} tu entrevista ${channelLabel} comienza en 15 minutos.${meetLink}\n\nTeam Vision`;
      default:
        return `${greeting} recordatorio de entrevista: ${when}.${meetLink}\n\nTeam Vision`;
    }
  }

  const greeting = first ? `Hi ${first},` : "Hi,";
  switch (reminderType) {
    case REMINDER_TYPES.CONFIRMATION:
      return `${greeting} your interview ${channelLabel} is confirmed for ${when}.${meetLink}\n\nTeam Vision`;
    case REMINDER_TYPES.REMINDER_24H:
      return `${greeting} reminder: your interview ${channelLabel} is tomorrow (${when}).${meetLink}\n\nTeam Vision`;
    case REMINDER_TYPES.REMINDER_1H:
      return `${greeting} your interview ${channelLabel} is in 1 hour (${when}).${meetLink}\n\nTeam Vision`;
    case REMINDER_TYPES.REMINDER_15M:
      return `${greeting} your interview ${channelLabel} starts in 15 minutes.${meetLink}\n\nTeam Vision`;
    default:
      return `${greeting} interview reminder: ${when}.${meetLink}\n\nTeam Vision`;
  }
}

function buildReminderEntries(appointment) {
  const startMs = new Date(appointment.startDateTime).getTime();
  const now = Date.now();

  return REMINDER_SCHEDULE.map((rule) => {
    const scheduledFor =
      rule.immediate || rule.offsetMinutes === 0
        ? new Date(now + 5000).toISOString()
        : new Date(startMs - rule.offsetMinutes * 60 * 1000).toISOString();

    return {
      id: crypto.randomUUID(),
      appointmentId: appointment.id,
      organizationId: appointment.organizationId,
      prospectPhone: appointment.prospectPhone,
      reminderType: rule.type,
      scheduledFor,
      offsetMinutes: rule.offsetMinutes,
      status:
        new Date(scheduledFor).getTime() <= now - 60_000
          ? REMINDER_STATUSES.CANCELLED
          : REMINDER_STATUSES.SCHEDULED,
      channel: "whatsapp",
      createdAt: new Date().toISOString()
    };
  }).filter((entry) => entry.status === REMINDER_STATUSES.SCHEDULED);
}

function scheduleReminders(appointment) {
  const store = readStore();
  const entries = buildReminderEntries(appointment);
  store[appointment.id] = entries;
  writeStore(store);

  return {
    status: REMINDER_STATUSES.SCHEDULED,
    count: entries.length,
    entries
  };
}

function cancelReminders(appointmentId) {
  const store = readStore();

  if (store[appointmentId]) {
    store[appointmentId] = store[appointmentId].map((entry) => ({
      ...entry,
      status: REMINDER_STATUSES.CANCELLED,
      cancelledAt: new Date().toISOString()
    }));
    writeStore(store);
  }

  return { status: REMINDER_STATUSES.CANCELLED };
}

function replaceReminders(appointment) {
  cancelReminders(appointment.id);
  return scheduleReminders(appointment);
}

function buildReminderTemplateVariables(appointment, prospect) {
  const firstName = String(prospect?.name || appointment.metadata?.prospectName || "")
    .trim()
    .split(/\s+/)[0] || "there";
  const when = formatWhen(appointment.startDateTime, appointment.timezone);

  return {
    prospect_first_name: firstName,
    interview_when: when
  };
}

async function deliverReminder(entry, appointment) {
  // Immediate confirmations are owned by the scheduling reply path.
  if (entry.reminderType === REMINDER_TYPES.CONFIRMATION) {
    return {
      delivered: false,
      reason: "CONFIRMATION_OWNED_BY_SCHEDULE_REPLY",
      status: REMINDER_STATUSES.CANCELLED,
      retryable: false,
      delivery: null,
      suppressed: true
    };
  }

  const prospect = await findProspectInOrganization(
    entry.prospectPhone,
    entry.organizationId
  );

  const message = buildReminderMessage(appointment, entry.reminderType, prospect);
  const idempotencyKey = `reminder:${entry.appointmentId || appointment.id}:${entry.reminderType}`;

  // Always authorize through the canonical WhatsApp gate (including mocked provider sends).
  const result = await sendTextMessage(entry.prospectPhone, message, {
    intent: "APPOINTMENT_REMINDER",
    actor: "ATLAS",
    organizationId: entry.organizationId,
    templateKey: "interview_reminder",
    templateVariables: buildReminderTemplateVariables(appointment, prospect),
    idempotencyKey
  });

  if (!result.success) {
    return {
      delivered: false,
      reason: result.error || result.status || "SEND_FAILED",
      status: result.status || REMINDER_STATUSES.FAILED,
      retryable: Boolean(result.retryable),
      delivery: result.delivery || null
    };
  }

  // REMINDER_SENT only after successful authorized delivery (freeform or approved template).
  await recordBusinessEvent({
    phone: entry.prospectPhone,
    eventType: APPOINTMENT_EVENTS.REMINDER_SENT,
    actor: "ATLAS",
    channel: "whatsapp",
    organizationId: entry.organizationId,
    summary: `Reminder sent (${entry.reminderType})`,
    payload: {
      appointmentId: entry.appointmentId,
      reminderType: entry.reminderType,
      scheduledFor: entry.scheduledFor,
      deliveryStatus: result.status,
      simulated: Boolean(result.simulated)
    }
  }).catch(() => {});

  return {
    delivered: true,
    status: result.status,
    delivery: result.delivery || null
  };
}

async function processDueReminders() {
  const store = readStore();
  const now = Date.now();
  let processed = 0;

  for (const [appointmentId, entries] of Object.entries(store)) {
    let changed = false;

    for (const entry of entries) {
      if (entry.status !== REMINDER_STATUSES.SCHEDULED) {
        continue;
      }

      if (new Date(entry.scheduledFor).getTime() > now) {
        continue;
      }

      const appointment = {
        id: appointmentId,
        organizationId: entry.organizationId,
        prospectPhone: entry.prospectPhone,
        startDateTime: entry.appointmentStart || entry.scheduledFor,
        timezone: entry.timezone || "America/New_York",
        virtualMeetingUrl: entry.virtualMeetingUrl || null,
        meetingType: entry.meetingType || null,
        meetingLocationType: entry.meetingLocationType || null,
        meetingProvider: entry.meetingProvider || null,
        meetingAddress: entry.meetingAddress || null,
        metadata: entry.metadata || {}
      };

      try {
        const result = await deliverReminder(entry, appointment);
        if (result.suppressed) {
          entry.status = REMINDER_STATUSES.CANCELLED;
          entry.cancelledAt = new Date().toISOString();
          entry.failureReason = result.reason;
          processed += 1;
          changed = true;
          continue;
        }
        if (result.delivered) {
          entry.status = REMINDER_STATUSES.SENT;
          entry.sentAt = new Date().toISOString();
          entry.deliveryStatus = result.status || null;
          delete entry.failureReason;
        } else {
          // Do not mark sent when blocked/failed — keep retryable durable failure state.
          entry.status = REMINDER_STATUSES.FAILED;
          entry.failureReason = result.reason;
          entry.deliveryStatus = result.status || null;
          entry.retryable = Boolean(result.retryable);
          entry.lastAttemptAt = new Date().toISOString();
        }
        processed += 1;
        changed = true;
      } catch (error) {
        entry.status = REMINDER_STATUSES.FAILED;
        entry.failureReason = error.message;
        changed = true;
      }
    }

    if (changed) {
      store[appointmentId] = entries;
    }
  }

  writeStore(store);
  return { processed };
}

function enrichEntriesWithAppointment(appointment, entries) {
  return entries.map((entry) => ({
    ...entry,
    appointmentStart: appointment.startDateTime,
    timezone: appointment.timezone,
    virtualMeetingUrl: appointment.virtualMeetingUrl,
    meetingType: appointment.meetingType || null,
    meetingLocationType: appointment.meetingLocationType || null,
    meetingProvider: appointment.meetingProvider || null,
    meetingAddress: appointment.meetingAddress || null,
    metadata: appointment.metadata
  }));
}

function scheduleRemindersForAppointment(appointment) {
  const result = scheduleReminders(appointment);
  const store = readStore();
  store[appointment.id] = enrichEntriesWithAppointment(appointment, store[appointment.id] || []);
  writeStore(store);
  return result;
}

function replaceRemindersForAppointment(appointment) {
  cancelReminders(appointment.id);
  return scheduleRemindersForAppointment(appointment);
}

let pollTimer = null;

function startReminderPoller(intervalMs = 60_000) {
  if (pollTimer) {
    return;
  }

  pollTimer = setInterval(() => {
    processDueReminders().catch((error) => {
      console.warn("[appointmentReminderEngine] poll failed:", error.message);
    });
  }, intervalMs);

  if (typeof pollTimer.unref === "function") {
    pollTimer.unref();
  }
}

function stopReminderPoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = {
  REMINDER_TYPES,
  REMINDER_SCHEDULE,
  scheduleReminders: scheduleRemindersForAppointment,
  cancelReminders,
  replaceReminders: replaceRemindersForAppointment,
  processDueReminders,
  buildReminderMessage,
  deliverReminder,
  startReminderPoller,
  stopReminderPoller,
  buildReminderMessage
};
