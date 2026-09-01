const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");

function rowToRecruit(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    agendaContactId: row.agenda_contact_id,
    appointmentId: row.appointment_id || null,
    name: row.name || null,
    phone: row.phone || null,
    recruiterUserId: row.recruiter_user_id || null,
    recruiterAgendaContactId: row.recruiter_agenda_contact_id || null,
    recruiterClientId: row.recruiter_client_id || null,
    recruiterDisplayName: row.recruiter_display_name || null,
    recruitedAt: row.recruited_at || null,
    linkedProspectId: row.linked_prospect_id || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function recruitToRow(recruit) {
  return {
    id: recruit.id || crypto.randomUUID(),
    organization_id: recruit.organizationId,
    agenda_contact_id: recruit.agendaContactId,
    appointment_id: recruit.appointmentId || null,
    name: recruit.name || null,
    phone: recruit.phone || null,
    recruiter_user_id: recruit.recruiterUserId || null,
    recruiter_agenda_contact_id: recruit.recruiterAgendaContactId || null,
    recruiter_client_id: recruit.recruiterClientId || null,
    recruiter_display_name: recruit.recruiterDisplayName || null,
    recruited_at: recruit.recruitedAt || null,
    linked_prospect_id: recruit.linkedProspectId || null,
    created_by_user_id: recruit.createdByUserId || null,
    created_at: recruit.createdAt || new Date().toISOString(),
    updated_at: recruit.updatedAt || new Date().toISOString()
  };
}

async function save(recruit) {
  const row = recruitToRow(recruit);
  const { data, error } = await supabase
    .from("atlas_agenda_recruits")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToRecruit(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_agenda_recruits").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToRecruit(data);
}

async function findByAgendaContactId(agendaContactId, organizationId) {
  if (!agendaContactId) return null;
  let query = supabase
    .from("atlas_agenda_recruits")
    .select("*")
    .eq("agenda_contact_id", agendaContactId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToRecruit(data);
}

async function findByAppointmentId(appointmentId, organizationId) {
  if (!appointmentId) return null;
  let query = supabase
    .from("atlas_agenda_recruits")
    .select("*")
    .eq("appointment_id", appointmentId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToRecruit(data);
}

async function listForOrganization(organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from("atlas_agenda_recruits")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data || []).map(rowToRecruit);
}

module.exports = {
  rowToRecruit,
  recruitToRow,
  save,
  findById,
  findByAgendaContactId,
  findByAppointmentId,
  listForOrganization
};
