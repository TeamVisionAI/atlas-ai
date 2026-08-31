/**
 * BR-181 — atlas_client_production persistence.
 * Service-role only. Isolation is enforced in the application service.
 */

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { PRODUCTION_STATUSES } = require("../core/clientProduction");

function rowToProduction(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    ownerUserId: row.owner_user_id,
    activityType: row.activity_type,
    status: row.status || PRODUCTION_STATUSES.DRAFT,
    carrier: row.carrier || null,
    productType: row.product_type || null,
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency || "USD",
    appointmentId: row.appointment_id || null,
    source: row.source || "MANUAL",
    submittedAt: row.submitted_at || null,
    issuedAt: row.issued_at || null,
    paidAt: row.paid_at || null,
    closedAt: row.closed_at || null,
    notes: row.notes || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: Array.isArray(row.history) ? row.history : []
  };
}

function productionToRow(record) {
  return {
    id: record.id || crypto.randomUUID(),
    organization_id: record.organizationId,
    client_id: record.clientId,
    owner_user_id: record.ownerUserId,
    activity_type: record.activityType,
    status: record.status || PRODUCTION_STATUSES.DRAFT,
    carrier: record.carrier || null,
    product_type: record.productType || null,
    amount: record.amount == null ? null : record.amount,
    currency: record.currency || "USD",
    appointment_id: record.appointmentId || null,
    source: record.source || "MANUAL",
    submitted_at: record.submittedAt || null,
    issued_at: record.issuedAt || null,
    paid_at: record.paidAt || null,
    closed_at: record.closedAt || null,
    notes: record.notes || null,
    created_by_user_id: record.createdByUserId || null,
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
    history: record.history || []
  };
}

async function save(record) {
  const row = productionToRow(record);
  const { data, error } = await supabase
    .from("atlas_client_production")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToProduction(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_client_production").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToProduction(data);
}

async function listForOwners({ organizationId, ownerUserIds, clientId } = {}) {
  if (!organizationId) return [];
  let query = supabase.from("atlas_client_production").select("*").eq("organization_id", organizationId);
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
  return (data || []).map(rowToProduction);
}

async function findByAppointmentId(appointmentId, organizationId) {
  const id = String(appointmentId || "").trim();
  if (!id || !organizationId) return null;
  const { data, error } = await supabase
    .from("atlas_client_production")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("appointment_id", id)
    .maybeSingle();
  if (error) throw error;
  return rowToProduction(data);
}

async function listAllForPlatform() {
  const { data, error } = await supabase.from("atlas_client_production").select("*");
  if (error) throw error;
  return (data || []).map(rowToProduction);
}

module.exports = {
  save,
  findById,
  listForOwners,
  findByAppointmentId,
  listAllForPlatform
};
