/**
 * BR-183 — atlas_client_documents persistence.
 * Service-role only. Isolation is enforced in the application service.
 */

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { DOCUMENT_STATUSES } = require("../core/clientDocuments");

function rowToDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    ownerUserId: row.owner_user_id,
    uploadedByUserId: row.uploaded_by_user_id || null,
    serviceCaseId: row.service_case_id || null,
    productionId: row.production_id || null,
    requestId: row.request_id || null,
    documentType: row.document_type,
    originalFilename: row.original_filename,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status || DOCUMENT_STATUSES.RECEIVED,
    notes: row.notes || null,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: Array.isArray(row.history) ? row.history : []
  };
}

function documentToRow(record) {
  return {
    id: record.id || crypto.randomUUID(),
    organization_id: record.organizationId,
    client_id: record.clientId,
    owner_user_id: record.ownerUserId,
    uploaded_by_user_id: record.uploadedByUserId || null,
    service_case_id: record.serviceCaseId || null,
    production_id: record.productionId || null,
    request_id: record.requestId || null,
    document_type: record.documentType,
    original_filename: record.originalFilename,
    storage_key: record.storageKey,
    mime_type: record.mimeType,
    size_bytes: record.sizeBytes,
    status: record.status || DOCUMENT_STATUSES.RECEIVED,
    notes: record.notes || null,
    received_at: record.receivedAt || new Date().toISOString(),
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
    history: record.history || []
  };
}

async function save(record) {
  const row = documentToRow(record);
  const { data, error } = await supabase.from("atlas_client_documents").upsert(row).select("*").single();
  if (error) throw error;
  return rowToDocument(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_client_documents").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToDocument(data);
}

async function listForOwners({ organizationId, ownerUserIds, clientId, serviceCaseId } = {}) {
  if (!organizationId) return [];
  let query = supabase.from("atlas_client_documents").select("*").eq("organization_id", organizationId);
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
  return (data || []).map(rowToDocument);
}

module.exports = {
  save,
  findById,
  listForOwners
};
