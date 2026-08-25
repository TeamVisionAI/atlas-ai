/**
 * Durable urgent appointment handoff persistence.
 */

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { isProduction } = require("../core/platformProductionGuard");
const { isMissingTableError } = require("../core/supabaseTableErrors");
const {
  rowToHandoff,
  handoffToRow
} = require("../core/appointmentUrgentHandoffReadModel");
const { HANDOFF_STATUSES } = require("../core/appointmentUrgentHandoffConstants");

const TABLE = "atlas_urgent_appointment_handoffs";
const PRODUCTION_TABLE_REQUIRED_MESSAGE =
  "atlas_urgent_appointment_handoffs table is required in production.";

let injectedRepository = null;
let supabaseAvailableCache = null;

function createMemoryAppointmentUrgentHandoffRepository() {
  /** @type {Map<string, object>} appointmentId → handoff */
  const byAppointment = new Map();
  /** @type {Map<string, object>} id → handoff */
  const byId = new Map();

  function clone(entry) {
    return JSON.parse(JSON.stringify(entry));
  }

  function index(entry) {
    byId.set(entry.id, entry);
    byAppointment.set(String(entry.appointmentId), entry);
  }

  return {
    kind: "memory",

    async findByAppointmentId(appointmentId) {
      const row = byAppointment.get(String(appointmentId));
      return row ? clone(row) : null;
    },

    async findById(id) {
      const row = byId.get(String(id));
      return row ? clone(row) : null;
    },

    async listOpenForUser({ organizationId, userId }) {
      return [...byId.values()]
        .filter(
          (entry) =>
            entry.organizationId === organizationId &&
            entry.status === HANDOFF_STATUSES.OPEN &&
            (entry.assignedUserId === userId || entry.escalatedToUserId === userId)
        )
        .map(clone);
    },

    async listDueForEscalation(beforeIso) {
      return [...byId.values()]
        .filter((entry) => {
          if (entry.status !== HANDOFF_STATUSES.OPEN) {
            return false;
          }

          if (entry.acknowledgedAt || entry.metadata?.escalationNotifiedAt) {
            return false;
          }

          const due = Date.parse(entry.escalationDueAt || "");
          return Number.isFinite(due) && due <= Date.parse(beforeIso);
        })
        .map(clone);
    },

    async upsert(handoff) {
      const existing = byAppointment.get(String(handoff.appointmentId));
      const next = clone({
        ...(existing || {}),
        ...handoff,
        id: handoff.id || existing?.id || crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || handoff.createdAt || new Date().toISOString()
      });
      index(next);
      return clone(next);
    },

    async save(handoff) {
      const next = clone({
        ...handoff,
        id: handoff.id || crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        createdAt: handoff.createdAt || new Date().toISOString()
      });
      index(next);
      return clone(next);
    }
  };
}

async function isTableAvailable() {
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

function assertProductionTableAvailable(tableAvailable) {
  if (!tableAvailable && isProduction()) {
    throw new Error(PRODUCTION_TABLE_REQUIRED_MESSAGE);
  }
}

function createSupabaseAppointmentUrgentHandoffRepository() {
  return {
    kind: "supabase",

    async findByAppointmentId(appointmentId) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("appointment_id", appointmentId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return rowToHandoff(data);
    },

    async findById(id) {
      const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();

      if (error) {
        throw error;
      }

      return rowToHandoff(data);
    },

    async listOpenForUser({ organizationId, userId }) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", HANDOFF_STATUSES.OPEN)
        .or(`assigned_user_id.eq.${userId},escalated_to_user_id.eq.${userId}`)
        .order("appointment_start", { ascending: true });

      if (error) {
        throw error;
      }

      return (data || []).map(rowToHandoff);
    },

    async listDueForEscalation(beforeIso) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("status", HANDOFF_STATUSES.OPEN)
        .is("acknowledged_at", null)
        .lte("escalation_due_at", beforeIso)
        .order("escalation_due_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data || [])
        .map(rowToHandoff)
        .filter((entry) => !entry.metadata?.escalationNotifiedAt);
    },

    async upsert(handoff) {
      const row = handoffToRow(handoff);
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(row, { onConflict: "appointment_id" })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return rowToHandoff(data);
    },

    async save(handoff) {
      const row = handoffToRow(handoff);
      const { data, error } = await supabase.from(TABLE).upsert(row).select("*").single();

      if (error) {
        throw error;
      }

      return rowToHandoff(data);
    }
  };
}

async function resolveAppointmentUrgentHandoffRepository(options = {}) {
  if (options.repository) {
    return options.repository;
  }

  if (injectedRepository) {
    return injectedRepository;
  }

  const tableAvailable = await isTableAvailable();

  if (tableAvailable) {
    return createSupabaseAppointmentUrgentHandoffRepository();
  }

  assertProductionTableAvailable(tableAvailable);
  return createMemoryAppointmentUrgentHandoffRepository();
}

function injectAppointmentUrgentHandoffRepository(repository) {
  injectedRepository = repository;
}

function resetAppointmentUrgentHandoffRepositoryInjection() {
  injectedRepository = null;
  supabaseAvailableCache = null;
}

module.exports = {
  createMemoryAppointmentUrgentHandoffRepository,
  resolveAppointmentUrgentHandoffRepository,
  injectAppointmentUrgentHandoffRepository,
  resetAppointmentUrgentHandoffRepositoryInjection
};
