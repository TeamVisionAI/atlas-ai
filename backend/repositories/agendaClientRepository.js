const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");

function rowToAgendaClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    agendaContactId: row.agenda_contact_id,
    name: row.name,
    phone: row.phone || null,
    email: row.email || null,
    preferredLanguage: row.preferred_language || null,
    source: row.source || null,
    notes: row.notes || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function agendaClientToRow(client) {
  return {
    id: client.id || crypto.randomUUID(),
    organization_id: client.organizationId,
    owner_user_id: client.ownerUserId,
    agenda_contact_id: client.agendaContactId,
    name: client.name,
    phone: client.phone || null,
    email: client.email || null,
    preferred_language: client.preferredLanguage || null,
    source: client.source || null,
    notes: client.notes || null,
    created_by: client.createdBy || null,
    created_at: client.createdAt || new Date().toISOString(),
    updated_at: client.updatedAt || new Date().toISOString()
  };
}

async function save(client) {
  const row = agendaClientToRow(client);
  const { data, error } = await supabase
    .from("atlas_agenda_clients")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToAgendaClient(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_agenda_clients").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToAgendaClient(data);
}

async function findByAgendaContactId(agendaContactId, organizationId) {
  if (!agendaContactId) return null;
  let query = supabase
    .from("atlas_agenda_clients")
    .select("*")
    .eq("agenda_contact_id", agendaContactId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToAgendaClient(data);
}

module.exports = {
  rowToAgendaClient,
  agendaClientToRow,
  save,
  findById,
  findByAgendaContactId
};
