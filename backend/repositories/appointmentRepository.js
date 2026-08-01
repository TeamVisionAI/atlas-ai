/**
 * Sprint 22 — Appointment persistence (Supabase + JSON fallback).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { isProduction } = require("../core/platformProductionGuard");
const { isMissingTableError } = require("../core/supabaseTableErrors");
const { coerceAppointmentItems } = require("../core/appointmentCollection");
const {
  rowToAppointment,
  appointmentToRow,
  resolveOwnerRepIdFromRow,
  resolveOwnerRepIdFromAppointment
} = require("../core/appointmentReadModel");
const { logInterviewerTrace } = require("../dev/interviewerTrace");

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

    logInterviewerTrace({
      authenticatedUserId: data?.agent_id || row.agent_id || null,
      authenticatedUserName: null,
      interviewerUserId: data?.interviewer_user_id || row.interviewer_user_id || null,
      interviewerName: data?.interviewer_name || row.interviewer_name || null,
      appointmentId: data?.id || row.id || null,
      source: "appointmentRepository.save"
    });

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

  logInterviewerTrace({
    authenticatedUserId: row.agent_id || null,
    authenticatedUserName: null,
    interviewerUserId: row.interviewer_user_id || null,
    interviewerName: row.interviewer_name || null,
    appointmentId: row.id || null,
    source: "appointmentRepository.save"
  });

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

    const appointment = rowToAppointment(data);

    logInterviewerTrace({
      authenticatedUserId: appointment?.agentId || null,
      authenticatedUserName: null,
      interviewerUserId: appointment?.interviewerUserId || null,
      interviewerName: appointment?.interviewerName || null,
      appointmentId: appointment?.id || null,
      source: "appointmentRepository.findById"
    });

    return appointment;
  }

  const rows = readJsonStore();
  const match = rows.find(
    (row) => row.id === id && (!organizationId || row.organization_id === organizationId)
  );

  const appointment = rowToAppointment(match);

  logInterviewerTrace({
    authenticatedUserId: appointment?.agentId || null,
    authenticatedUserName: null,
    interviewerUserId: appointment?.interviewerUserId || null,
    interviewerName: appointment?.interviewerName || null,
    appointmentId: appointment?.id || null,
    source: "appointmentRepository.findById"
  });

  return appointment;
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
    "rescheduled",
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
  resolveOwnerRepIdFromRow,
  resolveOwnerRepIdFromAppointment,
  rowToAppointment,
  appointmentToRow,
  coerceAppointmentItems,
  save,
  findById,
  search,
  listActiveForAgent
};
