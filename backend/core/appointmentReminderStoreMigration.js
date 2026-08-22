/**
 * DR1 — Safe audit of legacy JSON reminder file for durable import.
 * Does NOT import baked fixtures or send reminders.
 */

const fs = require("fs");
const path = require("path");
const { REMINDER_STATUSES } = require("./configuration/appointmentDomain");

const DEFAULT_JSON_PATH = path.join(__dirname, "../data/appointmentReminders.json");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || ""));
}

/**
 * @param {object} store — appointmentId → reminder entries
 * @param {{ knownAppointmentIds?: Set<string>|string[] }} [options]
 */
function auditJsonReminderStoreForDurableImport(store, options = {}) {
  const known = new Set(
    Array.isArray(options.knownAppointmentIds)
      ? options.knownAppointmentIds
      : options.knownAppointmentIds instanceof Set
        ? [...options.knownAppointmentIds]
        : []
  );

  const report = {
    appointmentKeys: 0,
    fixtureOrNonUuidKeys: [],
    pendingScheduled: [],
    eligibleForImport: [],
    skippedFixtures: [],
    skippedUnknownAppointment: [],
    needsRegenerationAppointmentIds: []
  };

  for (const [appointmentId, entries] of Object.entries(store || {})) {
    report.appointmentKeys += 1;

    if (!isUuid(appointmentId)) {
      report.fixtureOrNonUuidKeys.push(appointmentId);
      report.skippedFixtures.push(appointmentId);
      continue;
    }

    const list = Array.isArray(entries) ? entries : [];
    const scheduled = list.filter((row) => row.status === REMINDER_STATUSES.SCHEDULED);

    if (scheduled.length === 0) {
      continue;
    }

    const orgIds = [...new Set(scheduled.map((row) => row.organizationId).filter(Boolean))];
    const summary = {
      appointmentId,
      organizationIds: orgIds,
      scheduledTypes: scheduled.map((row) => row.reminderType),
      count: scheduled.length
    };
    report.pendingScheduled.push(summary);

    if (known.size > 0 && !known.has(appointmentId)) {
      report.skippedUnknownAppointment.push(appointmentId);
      report.needsRegenerationAppointmentIds.push(appointmentId);
      continue;
    }

    // Positive identification: UUID appointment id + organization_id on every pending row.
    const allScoped = scheduled.every((row) => row.organizationId && isUuid(row.organizationId));
    if (!allScoped) {
      report.needsRegenerationAppointmentIds.push(appointmentId);
      continue;
    }

    report.eligibleForImport.push(summary);
  }

  report.needsRegenerationAppointmentIds = [
    ...new Set(report.needsRegenerationAppointmentIds)
  ];

  return report;
}

function readLegacyJsonReminderStore(filePath = DEFAULT_JSON_PATH) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

module.exports = {
  DEFAULT_JSON_PATH,
  isUuid,
  auditJsonReminderStoreForDurableImport,
  readLegacyJsonReminderStore
};
