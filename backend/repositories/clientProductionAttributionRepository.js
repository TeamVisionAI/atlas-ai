const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");

function rowToAttribution(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productionId: row.production_id,
    agentUserId: row.agent_user_id || null,
    participantDisplayName: row.participant_display_name || null,
    splitPercent: row.split_percent == null ? null : Number(row.split_percent),
    creditedAmount: row.credited_amount == null ? null : Number(row.credited_amount),
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at
  };
}

function attributionToRow(record) {
  return {
    id: record.id || crypto.randomUUID(),
    organization_id: record.organizationId,
    production_id: record.productionId,
    agent_user_id: record.agentUserId || null,
    participant_display_name: record.participantDisplayName || null,
    split_percent: record.splitPercent ?? null,
    credited_amount: record.creditedAmount ?? null,
    created_by_user_id: record.createdByUserId || null,
    created_at: record.createdAt || new Date().toISOString()
  };
}

async function save(record) {
  const row = attributionToRow(record);
  const { data, error } = await supabase
    .from("atlas_client_production_attributions")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToAttribution(data);
}

async function listForProduction(productionId, organizationId) {
  if (!productionId) return [];
  let query = supabase
    .from("atlas_client_production_attributions")
    .select("*")
    .eq("production_id", productionId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToAttribution);
}

async function listForOrganization(organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from("atlas_client_production_attributions")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data || []).map(rowToAttribution);
}

module.exports = {
  rowToAttribution,
  attributionToRow,
  save,
  listForProduction,
  listForOrganization
};
