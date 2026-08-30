/**
 * BR-183 — atlas_client_document_requests persistence.
 * Service-role only. Isolation is enforced in the application service.
 */

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { DOCUMENT_REQUEST_STATUSES } = require("../core/clientDocuments");

function rowToRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    ownerUserId: row.owner_user_id,
    serviceCaseId: row.service_case_id || null,
    productionId: row.production_id || null,
    documentType: row.document_type,
    title: row.title,
    instructions: row.instructions || null,
    status: row.status || DOCUMENT_REQUEST_STATUSES.OPEN,
    dueDate: row.due_date || null,
    requestedAt: row.requested_at,
    fulfilledAt: row.fulfilled_at || null,
    cancelledAt: row.cancelled_at || null,
    fulfilledDocumentId: row.fulfilled_document_id || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: Array.isArray(row.history) ? row.history : []
  };
}

function requestToRow(record) {
  return {
    id: record.id || crypto.randomUUID(),
    organization_id: record.organizationId,
    client_id: record.clientId,
    owner_user_id: record.ownerUserId,
    service_case_id: record.serviceCaseId || null,
    production_id: record.productionId || null,
    document_type: record.documentType,
    title: record.title,
    instructions: record.instructions || null,
    status: record.status || DOCUMENT_REQUEST_STATUSES.OPEN,
    due_date: record.dueDate || null,
    requested_at: record.requestedAt || new Date().toISOString(),
    fulfilled_at: record.fulfilledAt || null,
    cancelled_at: record.cancelledAt || null,
    fulfilled_document_id: record.fulfilledDocumentId || null,
    created_by_user_id: record.createdByUserId || null,
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
    history: record.history || []
  };
}

async function save(record) {
  const row = requestToRow(record);
  const { data, error } = await supabase
    .from("atlas_client_document_requests")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToRequest(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_client_document_requests").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToRequest(data);
}

async function listForOwners({ organizationId, ownerUserIds, clientId, serviceCaseId } = {}) {
  if (!organizationId) return [];
  let query = supabase.from("atlas_client_document_requests").select("*").eq("organization_id", organizationId);
  if (clientId) query = query.eq("client_id", clientId);
  if (serviceCaseId) query = query.eq("service_case_id", serviceCaseId);
  if (ownerUserIds?.length === 1) {
    query = query.eq("owner_user_id", ownerUserIds[0]);
  } else if (Array.isArray(ownerUserIds) && ownerUserIds.length > 1) {
    query = query.in("owner_user_id", ownerUserIds);
  } else if (Array.isArray(ownerUserIds) && ownerUserIds.length === 0) {
    return [];
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToRequest);
}

module.exports = {
  save,
  findById,
  listForOwners
};
