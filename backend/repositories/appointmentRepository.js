/**
 * Sprint 22 — Appointment persistence (Supabase + JSON fallback).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { isProduction } = require("../core/platformProductionGuard");
const { isMissingTableError } = require("../core/supabaseTableErrors");

const STORE_FILE = path.join(__dirname, "../data/appointments.json");

function generateId() {
  return crypto.randomUUID();
}

function readJsonStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return [];
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeJsonStore(rows) {
  const dir = path.dirname(STORE_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(STORE_FILE, JSON.stringify(rows, null, 2));
}

function rowToAppointment(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id || row.organizationId,
    prospectId: row.prospect_id || row.prospectId || null,
    prospectPhone: row.prospect_phone || row.prospectPhone,
    agentId: row.agent_id || row.agentId,
    purpose: row.purpose,
    status: row.status,
    source: row.source,
    startDateTime: row.start_date_time || row.startDateTime,
    endDateTime: row.end_date_time || row.endDateTime,
    durationMinutes: row.duration_minutes ?? row.durationMinutes,
    timezone: row.timezone,
    meetingType: row.meeting_type || row.meetingType,
    meetingProvider: row.meeting_provider || row.meetingProvider || null,
    meetingLocationType: row.meeting_location_type || row.meetingLocationType || null,
    meetingLocationName: row.meeting_location_name || row.meetingLocationName || null,
    meetingAddress: row.meeting_address || row.meetingAddress || null,
    meetingNotes: row.meeting_notes || row.meetingNotes || null,
    virtualMeetingUrl: row.virtual_meeting_url || row.virtualMeetingUrl || null,
    calendarEventId: row.calendar_event_id || row.calendarEventId || null,
    calendarProvider: row.calendar_provider || row.calendarProvider || null,
    confirmationStatus: row.confirmation_status || row.confirmationStatus,
    emailInvitationStatus: row.email_invitation_status || row.emailInvitationStatus,
    reminderStatus: row.reminder_status || row.reminderStatus,
    humanAssistRequired: Boolean(row.human_assist_required ?? row.humanAssistRequired),
    humanAssistReason: row.human_assist_reason || row.humanAssistReason || null,
    rescheduleCount: row.reschedule_count ?? row.rescheduleCount ?? 0,
    cancellationReason: row.cancellation_reason || row.cancellationReason || null,
    outcome: row.outcome || null,
    outcomeNotes: row.outcome_notes || row.outcomeNotes || null,
    history: row.history || [],
    metadata: row.metadata || {},
    createdBy: row.created_by || row.createdBy || null,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function appointmentToRow(appointment) {
  return {
    id: appointment.id,
    organization_id: appointment.organizationId,
    prospect_id: appointment.prospectId || null,
    prospect_phone: appointment.prospectPhone,
    agent_id: appointment.agentId,
    purpose: appointment.purpose,
    status: appointment.status,
    source: appointment.source,
    start_date_time: appointment.startDateTime,
    end_date_time: appointment.endDateTime,
    duration_minutes: appointment.durationMinutes,
    timezone: appointment.timezone,
    meeting_type: appointment.meetingType,
    meeting_provider: appointment.meetingProvider || null,
    meeting_location_type: appointment.meetingLocationType || null,
    meeting_location_name: appointment.meetingLocationName || null,
    meeting_address: appointment.meetingAddress || null,
    meeting_notes: appointment.meetingNotes || null,
    virtual_meeting_url: appointment.virtualMeetingUrl || null,
    calendar_event_id: appointment.calendarEventId || null,
    calendar_provider: appointment.calendarProvider || null,
    confirmation_status: appointment.confirmationStatus,
    email_invitation_status: appointment.emailInvitationStatus,
    reminder_status: appointment.reminderStatus,
    human_assist_required: appointment.humanAssistRequired,
    human_assist_reason: appointment.humanAssistReason || null,
    reschedule_count: appointment.rescheduleCount || 0,
    cancellation_reason: appointment.cancellationReason || null,
    outcome: appointment.outcome || null,
    outcome_notes: appointment.outcomeNotes || null,
    history: appointment.history || [],
    metadata: appointment.metadata || {},
    created_by: appointment.createdBy || null,
    created_at: appointment.createdAt,
    updated_at: appointment.updatedAt
  };
}

async function isTableAvailable() {
  const { error } = await supabase.from("atlas_appointments").select("id").limit(1);

  if (!error) {
    return true;
  }

  if (isMissingTableError(error)) {
    return false;
  }

  throw error;
}

async function save(appointment) {
  const row = appointmentToRow(appointment);
  const tableAvailable = await isTableAvailable();

  if (tableAvailable) {
    const { data, error } = await supabase
      .from("atlas_appointments")
      .upsert(row)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return rowToAppointment(data);
  }

  if (isProduction()) {
    throw new Error("atlas_appointments table is required in production.");
  }

  const rows = readJsonStore();
  const index = rows.findIndex((item) => item.id === appointment.id);

  if (index >= 0) {
    rows[index] = row;
  } else {
    rows.push(row);
  }

  writeJsonStore(rows);
  return rowToAppointment(row);
}

async function findById(id, organizationId) {
  const tableAvailable = await isTableAvailable();

  if (tableAvailable) {
    let query = supabase.from("atlas_appointments").select("*").eq("id", id);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    return rowToAppointment(data);
  }

  const rows = readJsonStore();
  const match = rows.find(
    (row) => row.id === id && (!organizationId || row.organization_id === organizationId)
  );

  return rowToAppointment(match);
}

async function search(filters = {}) {
  const tableAvailable = await isTableAvailable();

  if (tableAvailable) {
    let query = supabase.from("atlas_appointments").select("*", { count: "exact" });

    if (filters.organizationId) {
      query = query.eq("organization_id", filters.organizationId);
    }

    if (filters.agentId) {
      query = query.eq("agent_id", filters.agentId);
    }

    if (filters.prospectPhone) {
      query = query.eq("prospect_phone", filters.prospectPhone);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in("status", filters.status);
      } else {
        query = query.eq("status", filters.status);
      }
    }

    if (filters.purpose) {
      query = query.eq("purpose", filters.purpose);
    }

    if (filters.meetingType) {
      query = query.eq("meeting_type", filters.meetingType);
    }

    if (filters.from) {
      query = query.gte("start_date_time", filters.from);
    }

    if (filters.to) {
      query = query.lte("start_date_time", filters.to);
    }

    if (filters.humanAssistRequired) {
      query = query.eq("human_assist_required", true);
    }

    query = query.order("start_date_time", { ascending: true });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error, count } = await query;

    if (error) {
      const wrapped = new Error(error.message || "Failed to query appointments.");
      wrapped.code = error.code;
      throw wrapped;
    }

    return {
      items: (data || []).map(rowToAppointment),
      total: count ?? (data || []).length
    };
  }

  let rows = readJsonStore();

  if (filters.organizationId) {
    rows = rows.filter((row) => row.organization_id === filters.organizationId);
  }

  if (filters.agentId) {
    rows = rows.filter((row) => row.agent_id === filters.agentId);
  }

  if (filters.prospectPhone) {
    rows = rows.filter((row) => row.prospect_phone === filters.prospectPhone);
  }

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    rows = rows.filter((row) => statuses.includes(row.status));
  }

  if (filters.from) {
    rows = rows.filter((row) => row.start_date_time >= filters.from);
  }

  if (filters.to) {
    rows = rows.filter((row) => row.start_date_time <= filters.to);
  }

  if (filters.humanAssistRequired) {
    rows = rows.filter((row) => row.human_assist_required);
  }

  rows.sort((a, b) => new Date(a.start_date_time) - new Date(b.start_date_time));

  if (filters.limit) {
    rows = rows.slice(0, filters.limit);
  }

  return {
    items: rows.map(rowToAppointment),
    total: rows.length
  };
}

async function listActiveForAgent(agentId, organizationId, from, to) {
  const activeStatuses = [
    "scheduled",
    "confirmed",
    "pending_confirmation",
    "in_progress",
    "human_assist_required"
  ];

  return search({
    organizationId,
    agentId,
    status: activeStatuses,
    from,
    to
  });
}

module.exports = {
  generateId,
  rowToAppointment,
  appointmentToRow,
  save,
  findById,
  search,
  listActiveForAgent
};
