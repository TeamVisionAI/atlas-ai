/**
 * DR1 — Durable appointment reminder repository.
 * Production: Postgres/Supabase only (fail closed).
 * Tests: in-memory repository.
 * No ephemeral JSON file fallback.
 */

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { isProduction } = require("../core/platformProductionGuard");
const { isMissingTableError } = require("../core/supabaseTableErrors");
const { REMINDER_STATUSES } = require("../core/configuration/appointmentDomain");
const {
  rowToReminder,
  reminderToRow
} = require("../core/appointmentReminderReadModel");

const TABLE = "atlas_appointment_reminders";
const PRODUCTION_TABLE_REQUIRED_MESSAGE =
  "atlas_appointment_reminders table is required in production (DR1 durable reminder storage).";

let injectedRepository = null;
let supabaseAvailableCache = null;

function createMemoryAppointmentReminderRepository() {
  /** @type {Map<string, object[]>} appointmentId → entries */
  const byAppointment = new Map();

  function clone(entry) {
    return JSON.parse(JSON.stringify(entry));
  }

  function listAll() {
    const all = [];
    for (const entries of byAppointment.values()) {
      all.push(...entries.map(clone));
    }
    return all;
  }

  return {
    kind: "memory",

    async listByAppointmentId(appointmentId) {
      return (byAppointment.get(String(appointmentId)) || []).map(clone);
    },

    async listScheduledDue(beforeIso) {
      const cutoff = Date.parse(beforeIso);
      return listAll().filter(
        (entry) =>
          entry.status === REMINDER_STATUSES.SCHEDULED &&
          Date.parse(entry.scheduledFor) <= cutoff
      );
    },

    async listScheduledByType(reminderType) {
      return listAll().filter(
        (entry) =>
          entry.status === REMINDER_STATUSES.SCHEDULED &&
          entry.reminderType === reminderType
      );
    },

    async listByOrganizationId(organizationId) {
      return listAll().filter((entry) => entry.organizationId === organizationId);
    },

    /**
     * Overwrite all rows for an appointment (scheduleReminders semantics).
     */
    async replaceAllForAppointment(appointmentId, entries) {
      const next = (entries || []).map((entry) =>
        clone({
          ...entry,
          id: entry.id || crypto.randomUUID(),
          appointmentId: String(appointmentId),
          updatedAt: new Date().toISOString()
        })
      );
      byAppointment.set(String(appointmentId), next);
      return next.map(clone);
    },

    async cancelAllForAppointment(
      appointmentId,
      { cancelledAt, cancelReason, onlyScheduled = false } = {}
    ) {
      const key = String(appointmentId);
      const current = byAppointment.get(key) || [];
      const stamp = cancelledAt || new Date().toISOString();
      const next = current.map((entry) => {
        if (onlyScheduled && entry.status !== REMINDER_STATUSES.SCHEDULED) {
          return entry;
        }
        return {
          ...entry,
          status: REMINDER_STATUSES.CANCELLED,
          cancelledAt: stamp,
          cancelReason: cancelReason || entry.cancelReason || null,
          updatedAt: stamp
        };
      });
      byAppointment.set(key, next);
      return next.map(clone);
    },

    async saveEntry(entry) {
      const key = String(entry.appointmentId);
      const current = byAppointment.get(key) || [];
      const nextEntry = clone({
        ...entry,
        id: entry.id || crypto.randomUUID(),
        updatedAt: new Date().toISOString()
      });
      const index = current.findIndex((row) => row.id === nextEntry.id);
      if (index >= 0) {
        current[index] = nextEntry;
      } else {
        // Enforce one scheduled per type in memory.
        if (nextEntry.status === REMINDER_STATUSES.SCHEDULED) {
          for (let i = 0; i < current.length; i += 1) {
            if (
              current[i].reminderType === nextEntry.reminderType &&
              current[i].status === REMINDER_STATUSES.SCHEDULED &&
              current[i].id !== nextEntry.id
            ) {
              current[i] = {
                ...current[i],
                status: REMINDER_STATUSES.CANCELLED,
                cancelledAt: new Date().toISOString(),
                cancelReason: "superseded_active_type",
                updatedAt: new Date().toISOString()
              };
            }
          }
        }
        current.push(nextEntry);
      }
      byAppointment.set(key, current);
      return clone(nextEntry);
    },

    async clear() {
      byAppointment.clear();
    }
  };
}

async function isSupabaseTableAvailable() {
  if (supabaseAvailableCache !== null) {
    return supabaseAvailableCache;
  }

  const { error } = await supabase.from(TABLE).select("id").limit(1);

  if (!error) {
    supabaseAvailableCache = true;
    return true;
  }

  if (isMissingTableError(error)) {
    supabaseAvailableCache = false;
    return false;
  }

  throw error;
}

function createSupabaseAppointmentReminderRepository() {
  return {
    kind: "supabase",

    async listByAppointmentId(appointmentId) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("appointment_id", appointmentId)
        .order("scheduled_for", { ascending: true });

      if (error) {
        throw error;
      }

      return (data || []).map(rowToReminder);
    },

    async listScheduledDue(beforeIso) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("status", REMINDER_STATUSES.SCHEDULED)
        .lte("scheduled_for", beforeIso)
        .order("scheduled_for", { ascending: true });

      if (error) {
        throw error;
      }

      return (data || []).map(rowToReminder);
    },

    async listScheduledByType(reminderType) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("status", REMINDER_STATUSES.SCHEDULED)
        .eq("reminder_type", reminderType);

      if (error) {
        throw error;
      }

      return (data || []).map(rowToReminder);
    },

    async listByOrganizationId(organizationId) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId);

      if (error) {
        throw error;
      }

      return (data || []).map(rowToReminder);
    },

    async replaceAllForAppointment(appointmentId, entries) {
      const { error: deleteError } = await supabase
        .from(TABLE)
        .delete()
        .eq("appointment_id", appointmentId);

      if (deleteError) {
        throw deleteError;
      }

      if (!entries?.length) {
        return [];
      }

      const rows = entries.map((entry) =>
        reminderToRow({
          ...entry,
          id: entry.id || crypto.randomUUID(),
          appointmentId,
          updatedAt: new Date().toISOString()
        })
      );

      const { data, error } = await supabase.from(TABLE).insert(rows).select("*");

      if (error) {
        throw error;
      }

      return (data || []).map(rowToReminder);
    },

    async cancelAllForAppointment(
      appointmentId,
      { cancelledAt, cancelReason, onlyScheduled = false } = {}
    ) {
      const stamp = cancelledAt || new Date().toISOString();
      const patch = {
        status: REMINDER_STATUSES.CANCELLED,
        cancelled_at: stamp,
        updated_at: stamp
      };

      if (cancelReason) {
        patch.cancel_reason = cancelReason;
      }

      let query = supabase
        .from(TABLE)
        .update(patch)
        .eq("appointment_id", appointmentId);
      if (onlyScheduled) {
        query = query.eq("status", REMINDER_STATUSES.SCHEDULED);
      }
      const { data, error } = await query.select("*");

      if (error) {
        throw error;
      }

      return (data || []).map(rowToReminder);
    },

    async saveEntry(entry) {
      const row = reminderToRow({
        ...entry,
        id: entry.id || crypto.randomUUID(),
        updatedAt: new Date().toISOString()
      });

      const { data, error } = await supabase
        .from(TABLE)
        .upsert(row, { onConflict: "id" })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return rowToReminder(data);
    }
  };
}

async function resolveAppointmentReminderRepository() {
  if (injectedRepository) {
    return injectedRepository;
  }

  const available = await isSupabaseTableAvailable();

  if (available) {
    return createSupabaseAppointmentReminderRepository();
  }

  if (isProduction()) {
    throw new Error(PRODUCTION_TABLE_REQUIRED_MESSAGE);
  }

  // Non-production without migration: in-memory only (never JSON file).
  console.warn(
    "[appointmentReminderRepository] atlas_appointment_reminders unavailable; using in-memory store (non-production)."
  );
  return createMemoryAppointmentReminderRepository();
}

function setAppointmentReminderRepositoryForTests(repository) {
  injectedRepository = repository;
  supabaseAvailableCache = null;
}

function resetAppointmentReminderRepositoryCache() {
  injectedRepository = null;
  supabaseAvailableCache = null;
}

module.exports = {
  TABLE,
  PRODUCTION_TABLE_REQUIRED_MESSAGE,
  createMemoryAppointmentReminderRepository,
  createSupabaseAppointmentReminderRepository,
  resolveAppointmentReminderRepository,
  setAppointmentReminderRepositoryForTests,
  resetAppointmentReminderRepositoryCache
};
