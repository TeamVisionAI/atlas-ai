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
  REMINDER_30M: "reminder_30m",
  // Legacy — no longer scheduled. Kept so pending store rows can migrate/suppress safely.
  REMINDER_15M: "reminder_15m"
});

const REMINDER_SCHEDULE = Object.freeze([
  { type: REMINDER_TYPES.REMINDER_24H, offsetMinutes: 24 * 60 },
  { type: REMINDER_TYPES.REMINDER_1H, offsetMinutes: 60 },
  { type: REMINDER_TYPES.REMINDER_30M, offsetMinutes: 30 }
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

function buildReminderMessage(appointment, reminderType, prospect, identity = {}) {
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
  const signature =
    String(
      identity.handoffDisplayName ||
        identity.displayName ||
        appointment.metadata?.organizationDisplayName ||
        "Team Vision"
    ).trim() || "Team Vision";

  if (language === "es") {
    const greeting = first ? `Hola ${first},` : "Hola,";
    switch (reminderType) {
      case REMINDER_TYPES.CONFIRMATION:
        // Kept for backwards-compatible delivery of legacy queued confirmation rows only.
        return `${greeting} tu entrevista ${channelLabel} quedó confirmada para ${when}.${meetLink}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_24H:
        return `${greeting} te recordamos que mañana tienes tu entrevista ${channelLabel} (${when}).${meetLink}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_1H:
        return `${greeting} tu entrevista ${channelLabel} es en 1 hora (${when}).${meetLink}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_30M:
        return `${greeting} tu entrevista ${channelLabel} comienza en 30 minutos.${meetLink}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_15M:
        // Legacy queued rows only — no longer scheduled.
        return `${greeting} tu entrevista ${channelLabel} comienza en 15 minutos.${meetLink}\n\n${signature}`;
      default:
        return `${greeting} recordatorio de entrevista: ${when}.${meetLink}\n\n${signature}`;
    }
  }

  const greeting = first ? `Hi ${first},` : "Hi,";
  switch (reminderType) {
    case REMINDER_TYPES.CONFIRMATION:
      return `${greeting} your interview ${channelLabel} is confirmed for ${when}.${meetLink}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_24H:
      return `${greeting} reminder: your interview ${channelLabel} is tomorrow (${when}).${meetLink}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_1H:
      return `${greeting} your interview ${channelLabel} is in 1 hour (${when}).${meetLink}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_30M:
      return `${greeting} your interview ${channelLabel} starts in 30 minutes.${meetLink}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_15M:
      // Legacy queued rows only — no longer scheduled.
      return `${greeting} your interview ${channelLabel} starts in 15 minutes.${meetLink}\n\n${signature}`;
    default:
      return `${greeting} interview reminder: ${when}.${meetLink}\n\n${signature}`;
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
  // Implements BR-078 — localized interview_when + meeting_type (preferred language).
  const {
    buildInterviewReminderVariables
  } = require("../core/whatsappTemplateVariableBuilder");

  return buildInterviewReminderVariables(appointment, prospect);
}

/**
 * Cancel pending reminder_15m jobs and insert reminder_30m when still in the future.
 * Prevents dual 15m+30m delivery after the global cadence change.
 */
function migratePendingFifteenMinuteReminders(storeInput = null) {
  const store = storeInput || readStore();
  let changed = false;
  let cancelled15m = 0;
  let added30m = 0;

  for (const appointmentId of Object.keys(store)) {
    const entries = Array.isArray(store[appointmentId]) ? store[appointmentId] : [];
    const scheduled15 = entries.filter(
      (entry) =>
        entry.reminderType === REMINDER_TYPES.REMINDER_15M &&
        entry.status === REMINDER_STATUSES.SCHEDULED
    );

    if (scheduled15.length === 0) {
      continue;
    }

    const next = entries.map((entry) => {
      if (
        entry.reminderType === REMINDER_TYPES.REMINDER_15M &&
        entry.status === REMINDER_STATUSES.SCHEDULED
      ) {
        cancelled15m += 1;
        changed = true;
        return {
          ...entry,
          status: REMINDER_STATUSES.CANCELLED,
          cancelledAt: new Date().toISOString(),
          cancelReason: "migrated_to_reminder_30m"
        };
      }

      return entry;
    });

    const hasScheduled30 = next.some(
      (entry) =>
        entry.reminderType === REMINDER_TYPES.REMINDER_30M &&
        entry.status === REMINDER_STATUSES.SCHEDULED
    );

    if (!hasScheduled30) {
      const template = scheduled15[0];
      const appointmentStartMs = template.appointmentStart
        ? Date.parse(template.appointmentStart)
        : Date.parse(template.scheduledFor) + 15 * 60 * 1000;
      const scheduledFor30 = new Date(appointmentStartMs - 30 * 60 * 1000).toISOString();

      if (
        Number.isFinite(appointmentStartMs) &&
        Date.parse(scheduledFor30) > Date.now() - 60_000
      ) {
        next.push({
          id: crypto.randomUUID(),
          appointmentId,
          organizationId: template.organizationId || null,
          prospectPhone: template.prospectPhone,
          reminderType: REMINDER_TYPES.REMINDER_30M,
          scheduledFor: scheduledFor30,
          offsetMinutes: 30,
          status: REMINDER_STATUSES.SCHEDULED,
          channel: template.channel || "whatsapp",
          createdAt: new Date().toISOString(),
          appointmentStart:
            template.appointmentStart || new Date(appointmentStartMs).toISOString(),
          timezone: template.timezone || "America/New_York",
          virtualMeetingUrl: template.virtualMeetingUrl || null,
          meetingType: template.meetingType || null,
          meetingLocationType: template.meetingLocationType || null,
          meetingProvider: template.meetingProvider || null,
          meetingAddress: template.meetingAddress || null,
          metadata: template.metadata || {},
          migratedFrom: REMINDER_TYPES.REMINDER_15M
        });
        added30m += 1;
        changed = true;
      }
    }

    store[appointmentId] = next;
  }

  if (changed && !storeInput) {
    writeStore(store);
  }

  return { changed, cancelled15m, added30m, store };
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

  // Fail closed: never send legacy 15m after cadence cutover (migration may lag).
  if (entry.reminderType === REMINDER_TYPES.REMINDER_15M) {
    return {
      delivered: false,
      reason: "LEGACY_REMINDER_15M_SUPPRESSED",
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

  let identity = {};
  if (entry.organizationId) {
    try {
      const { loadTenantRuntimeContext } = require("../core/tenantRuntimeContext");
      const tenantRuntime = await loadTenantRuntimeContext(entry.organizationId, {
        requireOrganizationId: true
      });
      identity = {
        handoffDisplayName: tenantRuntime.handoffDisplayName,
        displayName: tenantRuntime.displayName
      };
    } catch {
      identity = {};
    }
  }

  const message = buildReminderMessage(
    appointment,
    entry.reminderType,
    prospect,
    identity
  );
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
  const migration = migratePendingFifteenMinuteReminders();
  const store = migration.store || readStore();
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

  // One-shot cutover for any durable reminder_15m rows still scheduled.
  try {
    migratePendingFifteenMinuteReminders();
  } catch (error) {
    console.warn(
      "[appointmentReminderEngine] reminder_15m→30m migration failed:",
      error.message
    );
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
  migratePendingFifteenMinuteReminders,
  startReminderPoller,
  stopReminderPoller
};
