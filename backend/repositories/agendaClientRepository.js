const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { CLIENT_STATUSES } = require("../core/clients/constants");

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
    status: row.status || CLIENT_STATUSES.ACTIVE,
    history: Array.isArray(row.history) ? row.history : [],
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
    status: client.status || CLIENT_STATUSES.ACTIVE,
    history: client.history || [],
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

async function findByPhone(phone, organizationId) {
  if (!phone || !organizationId) return null;
  const { data, error } = await supabase
    .from("atlas_agenda_clients")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
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

async function listByIds(ids, organizationId) {
  if (!organizationId || !Array.isArray(ids) || ids.length === 0) return [];
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const { data, error } = await supabase
    .from("atlas_agenda_clients")
    .select("id, organization_id, owner_user_id, agenda_contact_id, name, phone, email, preferred_language, source, notes, status, history, created_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .in("id", unique);
  if (error) throw error;
  return (data || []).map(rowToAgendaClient);
}

async function listForOwners({ organizationId, ownerUserIds }) {
  if (!organizationId) return [];
  let query = supabase.from("atlas_agenda_clients").select("*").eq("organization_id", organizationId);
  if (ownerUserIds?.length === 1) {
    query = query.eq("owner_user_id", ownerUserIds[0]);
  } else if (ownerUserIds?.length > 1) {
    query = query.in("owner_user_id", ownerUserIds);
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToAgendaClient);
}

module.exports = {
  rowToAgendaClient,
  agendaClientToRow,
  save,
  findById,
  findByPhone,
  findByAgendaContactId,
  listByIds,
  listForOwners
};
