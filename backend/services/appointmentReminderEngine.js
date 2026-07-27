/**
 * Sprint 22.1 — Appointment Reminder Engine with delivery.
 * Reuses whatsappService; records reminder_sent business events.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sendTextMessage } = require("./whatsappService");
const { logConversation } = require("./logService");
const { findProspectInOrganization } = require("./supabaseService");
const { recordBusinessEvent } = require("../core/recruitingBusinessEventBridge");
const { APPOINTMENT_EVENTS } = require("../modules/business-events/domain/EventTypes");
const { REMINDER_STATUSES } = require("../core/configuration/appointmentDomain");
const { shouldMockExternalComms } = require("../dev/simulatorGuard");

const REMINDER_FILE = path.join(__dirname, "../data/appointmentReminders.json");

const REMINDER_TYPES = Object.freeze({
  CONFIRMATION: "confirmation",
  REMINDER_24H: "reminder_24h",
  REMINDER_1H: "reminder_1h",
  REMINDER_15M: "reminder_15m"
});

const REMINDER_SCHEDULE = Object.freeze([
  { type: REMINDER_TYPES.CONFIRMATION, offsetMinutes: 0, immediate: true },
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

function formatWhen(iso, timezone = "America/New_York") {
  try {
    return new Date(iso).toLocaleString("es-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone
    });
  } catch {
    return iso;
  }
}

function buildReminderMessage(appointment, reminderType, prospect) {
  const name = prospect?.name || appointment.metadata?.prospectName || "";
  const when = formatWhen(appointment.startDateTime, appointment.timezone);
  const greeting = name ? `Hola ${name.split(" ")[0]},` : "Hola,";
  const meetLink = appointment.virtualMeetingUrl ? `\nEnlace: ${appointment.virtualMeetingUrl}` : "";

  switch (reminderType) {
    case REMINDER_TYPES.CONFIRMATION:
      return `${greeting} tu entrevista por Zoom quedó confirmada para ${when}.${meetLink}\n\nTeam Vision`;
    case REMINDER_TYPES.REMINDER_24H:
      return `${greeting} te recordamos que mañana tienes tu entrevista por Zoom a las ${when.split(", ").pop() || when}.${meetLink}\n\nTeam Vision`;
    case REMINDER_TYPES.REMINDER_1H:
      return `${greeting} tu entrevista por Zoom es en 1 hora (${when}).${meetLink}\n\nTeam Vision`;
    case REMINDER_TYPES.REMINDER_15M:
      return `${greeting} tu entrevista por Zoom comienza en 15 minutos.${meetLink}\n\nTeam Vision`;
    default:
      return `${greeting} recordatorio de entrevista: ${when}.${meetLink}\n\nTeam Vision`;
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

async function deliverReminder(entry, appointment) {
  const prospect = await findProspectInOrganization(
    entry.prospectPhone,
    entry.organizationId
  );

  const message = buildReminderMessage(appointment, entry.reminderType, prospect);

  if (!shouldMockExternalComms()) {
    const result = await sendTextMessage(entry.prospectPhone, message, {
      intent: "APPOINTMENT_REMINDER",
      actor: "ATLAS"
    });

    if (!result.success) {
      return { delivered: false, reason: result.error || "SEND_FAILED" };
    }
  }

  await logConversation({
    phone: entry.prospectPhone,
    name: prospect?.name || appointment.metadata?.prospectName,
    direction: "outgoing",
    message,
    intent: "APPOINTMENT_REMINDER",
    pipeline: "APPOINTMENT",
    currentStep: prospect?.current_step || "CONFIRMED",
    language: prospect?.language || "es"
  }).catch(() => {});

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
      scheduledFor: entry.scheduledFor
    }
  }).catch(() => {});

  return { delivered: true };
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
        metadata: entry.metadata || {}
      };

      try {
        const result = await deliverReminder(entry, appointment);
        entry.status = result.delivered ? REMINDER_STATUSES.SENT : REMINDER_STATUSES.FAILED;
        entry.sentAt = new Date().toISOString();
        if (!result.delivered) {
          entry.failureReason = result.reason;
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
  startReminderPoller,
  stopReminderPoller,
  buildReminderMessage
};
