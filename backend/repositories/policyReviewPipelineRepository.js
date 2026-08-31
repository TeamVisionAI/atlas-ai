/**
 * BR-186 — atlas_policy_review_pipeline persistence.
 * Service-role only. Isolation is enforced in the application service.
 * List reads use explicit columns and owner/client bounds — no org-wide select("*").
 */

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { POLICY_REVIEW_LIST_COLUMNS, POLICY_REVIEW_STAGES } = require("../core/policyReviewPipeline");

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    ownerUserId: row.owner_user_id,
    contactId: row.contact_id || null,
    serviceCaseId: row.service_case_id || null,
    appointmentId: row.appointment_id || null,
    documentRequestId: row.document_request_id || null,
    productionId: row.production_id || null,
    linkedProspectId: row.linked_prospect_id || null,
    stage: row.stage || POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD,
    language: row.language || null,
    state: row.state || null,
    source: row.source || null,
    campaign: row.campaign || null,
    adId: row.ad_id || null,
    adsetId: row.adset_id || null,
    creativeId: row.creative_id || null,
    campaignIntakeCode: row.campaign_intake_code || null,
    stageTimestamps: row.stage_timestamps && typeof row.stage_timestamps === "object" ? row.stage_timestamps : {},
    carrierProductLabel: row.carrier_product_label || null,
    monthlyPremium: row.monthly_premium == null ? null : Number(row.monthly_premium),
    annualizedPremium: row.annualized_premium == null ? null : Number(row.annualized_premium),
    submissionDate: row.submission_date || null,
    placedDate: row.placed_date || null,
    commissionLevelPct: row.commission_level_pct == null ? null : Number(row.commission_level_pct),
    paidAdvanceFactorPct: row.paid_advance_factor_pct == null ? null : Number(row.paid_advance_factor_pct),
    estimatedTakeHome: row.estimated_take_home == null ? null : Number(row.estimated_take_home),
    actualPaidCommission: row.actual_paid_commission == null ? null : Number(row.actual_paid_commission),
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: Array.isArray(row.history) ? row.history : []
  };
}

function recordToRow(record) {
  return {
    id: record.id || crypto.randomUUID(),
    organization_id: record.organizationId,
    client_id: record.clientId,
    owner_user_id: record.ownerUserId,
    contact_id: record.contactId || null,
    service_case_id: record.serviceCaseId || null,
    appointment_id: record.appointmentId || null,
    document_request_id: record.documentRequestId || null,
    production_id: record.productionId || null,
    linked_prospect_id: record.linkedProspectId || null,
    stage: record.stage || POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD,
    language: record.language || null,
    state: record.state || null,
    source: record.source || null,
    campaign: record.campaign || null,
    ad_id: record.adId || null,
    adset_id: record.adsetId || null,
    creative_id: record.creativeId || null,
    campaign_intake_code: record.campaignIntakeCode || null,
    stage_timestamps: record.stageTimestamps || {},
    carrier_product_label: record.carrierProductLabel || null,
    monthly_premium: record.monthlyPremium,
    annualized_premium: record.annualizedPremium,
    submission_date: record.submissionDate || null,
    placed_date: record.placedDate || null,
    commission_level_pct: record.commissionLevelPct,
    paid_advance_factor_pct: record.paidAdvanceFactorPct,
    estimated_take_home: record.estimatedTakeHome,
    actual_paid_commission: record.actualPaidCommission,
    created_by_user_id: record.createdByUserId || null,
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
    history: record.history || []
  };
}

function defaultToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id || null,
    commissionLevelPct: row.commission_level_pct == null ? null : Number(row.commission_level_pct),
    paidAdvanceFactorPct: row.paid_advance_factor_pct == null ? null : Number(row.paid_advance_factor_pct),
    updatedAt: row.updated_at
  };
}

async function save(record) {
  const row = recordToRow(record);
  const { data, error } = await supabase
    .from("atlas_policy_review_pipeline")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToRecord(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_policy_review_pipeline").select("*").eq("id", id);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToRecord(data);
}

async function listForOwners({ organizationId, ownerUserIds, clientId } = {}) {
  if (!organizationId) return [];
  if (Array.isArray(ownerUserIds) && ownerUserIds.length === 0) return [];
  let query = supabase
    .from("atlas_policy_review_pipeline")
    .select(POLICY_REVIEW_LIST_COLUMNS.join(","))
    .eq("organization_id", organizationId);
  if (clientId) query = query.eq("client_id", clientId);
  if (ownerUserIds?.length === 1) {
    query = query.eq("owner_user_id", ownerUserIds[0]);
  } else if (Array.isArray(ownerUserIds) && ownerUserIds.length > 1) {
    query = query.in("owner_user_id", ownerUserIds);
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToRecord);
}

async function saveCommissionDefault(record) {
  const payload = {
    organization_id: record.organizationId,
    user_id: record.userId || null,
    commission_level_pct: record.commissionLevelPct,
    paid_advance_factor_pct: record.paidAdvanceFactorPct,
    updated_at: record.updatedAt || new Date().toISOString()
  };
  const existing = await listCommissionDefaults(record.organizationId);
  const match = existing.find((item) => String(item.userId || "") === String(record.userId || ""));
  if (match?.id) payload.id = match.id;
  const { data, error } = await supabase
    .from("atlas_policy_review_commission_defaults")
    .upsert(payload)
    .select("id, organization_id, user_id, commission_level_pct, paid_advance_factor_pct, updated_at")
    .single();
  if (error) throw error;
  return defaultToRecord(data);
}

async function listCommissionDefaults(organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from("atlas_policy_review_commission_defaults")
    .select("id, organization_id, user_id, commission_level_pct, paid_advance_factor_pct, updated_at")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data || []).map(defaultToRecord);
}

module.exports = {
  save,
  findById,
  listForOwners,
  saveCommissionDefault,
  listCommissionDefaults
};
