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
const {
  REMINDER_TYPES,
  resolveAppointmentReminderSchedule,
  resolveReminderRecipientPhone
} = require("../core/appointmentReminderSchedule");

// Immediate booking confirmation is owned by appointment persistence → Conversation
// reply with idempotency key appointment-confirmation:{id}. Do not send a second one.
const REMINDER_SCHEDULE = resolveAppointmentReminderSchedule();

function formatWhen(iso, timezone = "America/New_York", languageCode = "en") {
  return formatAppointmentWhen(
    { startDateTime: iso, timezone },
    languageCode
  );
}

function isPolicyReviewAppointment(appointment = {}) {
  const purpose = String(appointment.purpose || appointment.metadata?.purpose || "").toLowerCase();
  return purpose === "policy_review";
}

function buildReminderMessage(appointment, reminderType, prospect, identity = {}) {
  const preferred = resolveProspectPreferredLanguage(prospect);
  const language = preferredLanguageToCommunicationCode(preferred);
  const name = prospect?.name || appointment.metadata?.prospectName || "";
  const first = name ? String(name).trim().split(/\s+/)[0] : "";
  const when = formatWhen(appointment.startDateTime, appointment.timezone, language);
  const virtual = isVirtualMeeting(appointment);
  const policyReview = isPolicyReviewAppointment(appointment);
  const meetLink = appointment.virtualMeetingUrl
    ? language === "es"
      ? `\nEnlace: ${appointment.virtualMeetingUrl}`
      : `\nLink: ${appointment.virtualMeetingUrl}`
    : "";
  const officeAddress = String(
    appointment.meetingAddress ||
      appointment.meeting_address ||
      appointment.metadata?.officeAddress ||
      appointment.metadata?.meetingAddress ||
      ""
  ).trim();
  const officeLine =
    !virtual && officeAddress
      ? language === "es"
        ? `\nDirección: ${officeAddress}`
        : `\nAddress: ${officeAddress}`
      : "";
  const channelLabel =
    language === "es"
      ? virtual
        ? "por Zoom"
        : "en la oficina"
      : virtual
        ? "via Zoom"
        : "at our office";
  const eventNoun = policyReview
    ? language === "es"
      ? "revisión de póliza IUL"
      : "IUL Policy Review"
    : language === "es"
      ? "entrevista"
      : "interview";
  const signature =
    String(
      identity.handoffDisplayName ||
        identity.displayName ||
        appointment.metadata?.organizationDisplayName ||
        NEUTRAL_ATLAS_DISPLAY_NAME
    ).trim() || NEUTRAL_ATLAS_DISPLAY_NAME;

  if (language === "es") {
    const greeting = first ? `Hola ${first},` : "Hola,";
    const poss = policyReview ? "su" : "tu";
    const haveTomorrow = policyReview ? "tiene" : "tienes";
    const remind = policyReview ? "le recordamos" : "te recordamos";
    switch (reminderType) {
      case REMINDER_TYPES.CONFIRMATION:
        // Kept for backwards-compatible delivery of legacy queued confirmation rows only.
        return `${greeting} ${poss} ${eventNoun} ${channelLabel} quedó confirmada para ${when}.${meetLink}${officeLine}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_24H:
        return `${greeting} ${remind} que mañana ${haveTomorrow} ${poss} ${eventNoun} ${channelLabel} (${when}).${meetLink}${officeLine}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_1H:
        return `${greeting} ${poss} ${eventNoun} ${channelLabel} es en 1 hora (${when}).${meetLink}${officeLine}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_30M:
        return `${greeting} ${poss} ${eventNoun} ${channelLabel} comienza en 30 minutos.${meetLink}${officeLine}\n\n${signature}`;
      case REMINDER_TYPES.REMINDER_15M:
        // Legacy queued rows only — no longer scheduled.
        return `${greeting} ${poss} ${eventNoun} ${channelLabel} comienza en 15 minutos.${meetLink}${officeLine}\n\n${signature}`;
      default:
        return `${greeting} recordatorio de ${eventNoun}: ${when}.${meetLink}${officeLine}\n\n${signature}`;
    }
  }

  const greeting = first ? `Hi ${first},` : "Hi,";
  switch (reminderType) {
    case REMINDER_TYPES.CONFIRMATION:
      return `${greeting} your ${eventNoun} ${channelLabel} is confirmed for ${when}.${meetLink}${officeLine}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_24H:
      return `${greeting} reminder: your ${eventNoun} ${channelLabel} is tomorrow (${when}).${meetLink}${officeLine}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_1H:
      return `${greeting} your ${eventNoun} ${channelLabel} is in 1 hour (${when}).${meetLink}${officeLine}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_30M:
      return `${greeting} your ${eventNoun} ${channelLabel} starts in 30 minutes.${meetLink}${officeLine}\n\n${signature}`;
    case REMINDER_TYPES.REMINDER_15M:
      // Legacy queued rows only — no longer scheduled.
      return `${greeting} your ${eventNoun} ${channelLabel} starts in 15 minutes.${meetLink}${officeLine}\n\n${signature}`;
    default:
      return `${greeting} ${eventNoun} reminder: ${when}.${meetLink}${officeLine}\n\n${signature}`;
  }
}

function buildReminderEntries(appointment, settings = null) {
  const startMs = new Date(appointment.startDateTime).getTime();
  const now = Date.now();
  const recipientPhone = resolveReminderRecipientPhone(appointment);
  const schedule = resolveAppointmentReminderSchedule(settings);

  return schedule.map((rule) => {
    const scheduledFor =
      rule.immediate || rule.offsetMinutes === 0
        ? new Date(now + 5000).toISOString()
        : new Date(startMs - rule.offsetMinutes * 60 * 1000).toISOString();

    return {
      id: crypto.randomUUID(),
      appointmentId: appointment.id,
      organizationId: appointment.organizationId,
      prospectPhone: recipientPhone,
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

function hasBlockingReminder(existing, desired) {
  return existing.some((row) => {
    if (row.reminderType !== desired.reminderType) {
      return false;
    }
    if (row.status === REMINDER_STATUSES.SCHEDULED) {
      return true;
    }
    if (row.status === REMINDER_STATUSES.SENT) {
      const sameStart =
        row.appointmentStart &&
        desired.appointmentStart &&
        String(row.appointmentStart) === String(desired.appointmentStart);
      return sameStart;
    }
    return false;
  });
}

async function scheduleReminders(appointment, options = {}) {
  const repository = await resolveAppointmentReminderRepository();
  const desired = enrichEntriesWithAppointment(
    appointment,
    buildReminderEntries(appointment, options.settings || null)
  );
  const existing = await repository.listByAppointmentId(appointment.id);
  const created = [];

  for (const entry of desired) {
    if (hasBlockingReminder(existing, entry)) {
      continue;
    }
    const saved = await repository.saveEntry(entry);
    created.push(saved);
    existing.push(saved);
  }

  const active = existing.filter((row) => row.status === REMINDER_STATUSES.SCHEDULED);

  return {
    status: REMINDER_STATUSES.SCHEDULED,
    count: active.length,
    createdCount: created.length,
    entries: active
  };
}

async function cancelReminders(appointmentId) {
  const repository = await resolveAppointmentReminderRepository();
  await repository.cancelAllForAppointment(appointmentId, {
    cancelledAt: new Date().toISOString(),
    onlyScheduled: true,
    cancelReason: "appointment_cancelled_or_replaced"
  });

  return { status: REMINDER_STATUSES.CANCELLED };
}

async function replaceReminders(appointment, options = {}) {
  await cancelReminders(appointment.id);
  return scheduleReminders(appointment, options);
}

/**
 * Repair missing future reminder jobs for one persisted appointment.
 * Never creates a job whose send time has already passed.
 * Never duplicates an existing scheduled/sent job for the current start.
 */
async function repairMissingRemindersForAppointment(appointment, options = {}) {
  if (!appointment?.id) {
    return { status: REMINDER_STATUSES.CANCELLED, count: 0, createdCount: 0, entries: [] };
  }
  const startMs = Date.parse(appointment.startDateTime);
  if (!Number.isFinite(startMs) || startMs <= Date.now()) {
    return { status: REMINDER_STATUSES.SCHEDULED, count: 0, createdCount: 0, entries: [] };
  }
  const status = String(appointment.status || "").toLowerCase();
  if (["cancelled", "completed", "no_show"].includes(status)) {
    return { status: REMINDER_STATUSES.CANCELLED, count: 0, createdCount: 0, entries: [] };
  }
  return scheduleReminders(appointment, options);
}

async function repairMissingReminders({ organizationId, now = new Date(), settings = null } = {}) {
  if (!organizationId) {
    const error = new Error("organizationId is required");
    error.code = "TENANT_SCOPE_REQUIRED";
    throw error;
  }
  const appointmentRepository = require("../repositories/appointmentRepository");
  const { items } = await appointmentRepository.search({
    organizationId,
    status: ["scheduled", "confirmed", "rescheduled", "pending_confirmation"],
    from: now.toISOString()
  });

  const results = [];
  for (const appointment of items) {
    const repaired = await repairMissingRemindersForAppointment(appointment, { settings });
    results.push({
      appointmentId: appointment.id,
      createdCount: repaired.createdCount || 0,
      count: repaired.count || 0
    });
  }

  return {
    organizationId,
    scanned: items.length,
    repaired: results.filter((row) => row.createdCount > 0).length,
    results
  };
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

  const recipientPhone =
    resolveReminderRecipientPhone({
      prospectPhone: entry.prospectPhone,
      metadata: appointment.metadata
    }) || entry.prospectPhone;

  const prospect = recipientPhone
    ? await findProspectInOrganization(recipientPhone, entry.organizationId)
    : null;

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
  if (!recipientPhone) {
    return {
      delivered: false,
      reason: "REMINDER_PHONE_MISSING",
      status: REMINDER_STATUSES.FAILED,
      retryable: false,
      delivery: null
    };
  }

  const result = await sendTextMessage(recipientPhone, message, {
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
    phone: recipientPhone,
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
  repairMissingRemindersForAppointment,
  repairMissingReminders,
  processDueReminders,
  buildReminderMessage,
  deliverReminder,
  migratePendingFifteenMinuteReminders,
  startReminderPoller,
  stopReminderPoller,
  resolveReminderRecipientPhone,
  resolveAppointmentReminderSchedule
};
