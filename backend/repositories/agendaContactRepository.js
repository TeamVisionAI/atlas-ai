const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");

function rowToAgendaContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    phone: row.phone || null,
    email: row.email || null,
    preferredLanguage: row.preferred_language || row.metadata?.preferredLanguage || null,
    source: row.source || row.metadata?.source || null,
    notes: row.notes || row.metadata?.notes || null,
    status: row.status || "active",
    promotedProspectId: row.promoted_prospect_id || null,
    promotedClientId: row.promoted_client_id || null,
    metadata: row.metadata || {},
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function agendaContactToRow(contact) {
  return {
    id: contact.id || crypto.randomUUID(),
    organization_id: contact.organizationId,
    owner_user_id: contact.ownerUserId,
    name: contact.name,
    phone: contact.phone || null,
    email: contact.email || null,
    preferred_language: contact.preferredLanguage || contact.metadata?.preferredLanguage || null,
    source: contact.source || contact.metadata?.source || null,
    notes: contact.notes || contact.metadata?.notes || null,
    status: contact.status || "active",
    promoted_prospect_id: contact.promotedProspectId || null,
    promoted_client_id: contact.promotedClientId || null,
    metadata: contact.metadata || {},
    created_by: contact.createdBy || null,
    created_at: contact.createdAt || new Date().toISOString(),
    updated_at: contact.updatedAt || new Date().toISOString()
  };
}

async function save(contact) {
  const row = agendaContactToRow(contact);
  const { data, error } = await supabase
    .from("atlas_agenda_contacts")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToAgendaContact(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_agenda_contacts").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToAgendaContact(data);
}

async function search({ organizationId, ownerUserId, status = null, limit = 100 } = {}) {
  let query = supabase
    .from("atlas_agenda_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Number(limit) || 100, 250));
  if (ownerUserId) query = query.eq("owner_user_id", ownerUserId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToAgendaContact);
}

module.exports = {
  rowToAgendaContact,
  agendaContactToRow,
  save,
  findById,
  search
};
