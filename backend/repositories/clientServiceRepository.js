/**
 * BR-182 — atlas_client_service_cases persistence.
 * Service-role only. Isolation is enforced in the application service.
 */

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { SERVICE_STATUSES } = require("../core/clientService");

function rowToCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    ownerUserId: row.owner_user_id,
    productionId: row.production_id || null,
    serviceType: row.service_type,
    status: row.status || SERVICE_STATUSES.OPEN,
    title: row.title,
    notes: row.notes || null,
    dueDate: row.due_date || null,
    scheduledAppointmentId: row.scheduled_appointment_id || null,
    createdByUserId: row.created_by_user_id || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: Array.isArray(row.history) ? row.history : []
  };
}

function caseToRow(record) {
  return {
    id: record.id || crypto.randomUUID(),
    organization_id: record.organizationId,
    client_id: record.clientId,
    owner_user_id: record.ownerUserId,
    production_id: record.productionId || null,
    service_type: record.serviceType,
    status: record.status || SERVICE_STATUSES.OPEN,
    title: record.title,
    notes: record.notes || null,
    due_date: record.dueDate || null,
    scheduled_appointment_id: record.scheduledAppointmentId || null,
    created_by_user_id: record.createdByUserId || null,
    completed_at: record.completedAt || null,
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
    history: record.history || []
  };
}

async function save(record) {
  const row = caseToRow(record);
  const { data, error } = await supabase
    .from("atlas_client_service_cases")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToCase(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_client_service_cases").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToCase(data);
}

async function listForOwners({ organizationId, ownerUserIds, clientId } = {}) {
  if (!organizationId) return [];
  let query = supabase.from("atlas_client_service_cases").select("*").eq("organization_id", organizationId);
  if (clientId) query = query.eq("client_id", clientId);
  if (ownerUserIds?.length === 1) {
    query = query.eq("owner_user_id", ownerUserIds[0]);
  } else if (Array.isArray(ownerUserIds) && ownerUserIds.length > 1) {
    query = query.in("owner_user_id", ownerUserIds);
  } else if (Array.isArray(ownerUserIds) && ownerUserIds.length === 0) {
    return [];
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToCase);
}

module.exports = {
  save,
  findById,
  listForOwners
};
