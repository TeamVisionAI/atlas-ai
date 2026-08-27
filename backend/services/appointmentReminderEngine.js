/**
 * Sprint 22.1 — Appointment Reminder Engine with delivery.
 * DR1 — Durable tenant-scoped reminder persistence (Postgres/Supabase).
 * Reuses whatsappService; records reminder_sent business events.
 */

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
const {
  resolveAppointmentReminderRepository
} = require("../repositories/appointmentReminderRepository");
const {
  NEUTRAL_ATLAS_DISPLAY_NAME,
  loadTenantOperationalIdentity
} = require("../core/tenantOperationalIdentity");

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
        NEUTRAL_ATLAS_DISPLAY_NAME
    ).trim() || NEUTRAL_ATLAS_DISPLAY_NAME;

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

async function scheduleReminders(appointment) {
  const repository = await resolveAppointmentReminderRepository();
  const entries = enrichEntriesWithAppointment(
    appointment,
    buildReminderEntries(appointment)
  );

  const saved = await repository.replaceAllForAppointment(appointment.id, entries);

  return {
    status: REMINDER_STATUSES.SCHEDULED,
    count: saved.length,
    entries: saved
  };
}

async function cancelReminders(appointmentId) {
  const repository = await resolveAppointmentReminderRepository();
  await repository.cancelAllForAppointment(appointmentId, {
    cancelledAt: new Date().toISOString()
  });

  return { status: REMINDER_STATUSES.CANCELLED };
}

async function replaceReminders(appointment) {
  await cancelReminders(appointment.id);
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
 *
 * @param {object|null} storeInput — optional in-memory appointmentId→entries map (tests only)
 */
async function migratePendingFifteenMinuteReminders(storeInput = null) {
  // Test path: mutate provided store map in place (legacy contract).
  if (storeInput && typeof storeInput === "object") {
    let changed = false;
    let cancelled15m = 0;
    let added30m = 0;

    for (const appointmentId of Object.keys(storeInput)) {
      const entries = Array.isArray(storeInput[appointmentId])
        ? storeInput[appointmentId]
        : [];
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

      storeInput[appointmentId] = next;
    }

    return { changed, cancelled15m, added30m, store: storeInput };
  }

  const repository = await resolveAppointmentReminderRepository();
  const scheduled15 = await repository.listScheduledByType(REMINDER_TYPES.REMINDER_15M);
  let cancelled15m = 0;
  let added30m = 0;

  const byAppointment = new Map();
  for (const entry of scheduled15) {
    const key = String(entry.appointmentId);
    if (!byAppointment.has(key)) {
      byAppointment.set(key, []);
    }
    byAppointment.get(key).push(entry);
  }

  for (const [appointmentId, fifteenRows] of byAppointment.entries()) {
    const existing = await repository.listByAppointmentId(appointmentId);
    const hasScheduled30 = existing.some(
      (entry) =>
        entry.reminderType === REMINDER_TYPES.REMINDER_30M &&
        entry.status === REMINDER_STATUSES.SCHEDULED
    );

    for (const entry of fifteenRows) {
      await repository.saveEntry({
        ...entry,
        status: REMINDER_STATUSES.CANCELLED,
        cancelledAt: new Date().toISOString(),
        cancelReason: "migrated_to_reminder_30m"
      });
      cancelled15m += 1;
    }

    if (!hasScheduled30 && fifteenRows.length) {
      const template = fifteenRows[0];
      const appointmentStartMs = template.appointmentStart
        ? Date.parse(template.appointmentStart)
        : Date.parse(template.scheduledFor) + 15 * 60 * 1000;
      const scheduledFor30 = new Date(appointmentStartMs - 30 * 60 * 1000).toISOString();

      if (
        Number.isFinite(appointmentStartMs) &&
        Date.parse(scheduledFor30) > Date.now() - 60_000
      ) {
        await repository.saveEntry({
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
      }
    }
  }

  return {
    changed: cancelled15m > 0 || added30m > 0,
    cancelled15m,
    added30m
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
      const tenantRuntime = await loadTenantOperationalIdentity(entry.organizationId);
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
  await migratePendingFifteenMinuteReminders();
  const repository = await resolveAppointmentReminderRepository();
  const due = await repository.listScheduledDue(new Date().toISOString());
  let processed = 0;

  for (const entry of due) {
    const appointment = {
      id: entry.appointmentId,
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
        await repository.saveEntry({
          ...entry,
          status: REMINDER_STATUSES.CANCELLED,
          cancelledAt: new Date().toISOString(),
          failureReason: result.reason
        });
        processed += 1;
        continue;
      }
      if (result.delivered) {
        await repository.saveEntry({
          ...entry,
          status: REMINDER_STATUSES.SENT,
          sentAt: new Date().toISOString(),
          deliveryStatus: result.status || null,
          failureReason: null
        });
      } else {
        await repository.saveEntry({
          ...entry,
          status: REMINDER_STATUSES.FAILED,
          failureReason: result.reason,
          deliveryStatus: result.status || null,
          retryable: Boolean(result.retryable),
          lastAttemptAt: new Date().toISOString()
        });
      }
      processed += 1;
    } catch (error) {
      await repository.saveEntry({
        ...entry,
        status: REMINDER_STATUSES.FAILED,
        failureReason: error.message,
        lastAttemptAt: new Date().toISOString()
      });
    }
  }

  return { processed };
}

let pollTimer = null;

function startReminderPoller(intervalMs = 60_000) {
  if (pollTimer) {
    return;
  }

  // One-shot cutover for any durable reminder_15m rows still scheduled.
  migratePendingFifteenMinuteReminders().catch((error) => {
    console.warn(
      "[appointmentReminderEngine] reminder_15m→30m migration failed:",
      error.message
    );
  });

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
  scheduleReminders,
  cancelReminders,
  replaceReminders,
  processDueReminders,
  buildReminderMessage,
  deliverReminder,
  migratePendingFifteenMinuteReminders,
  startReminderPoller,
  stopReminderPoller
};
