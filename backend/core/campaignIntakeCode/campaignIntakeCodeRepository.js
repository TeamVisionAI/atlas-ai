/**
 * BR-147 — Campaign intake code persistence (Supabase + in-memory for tests).
 */

const { supabase } = require("../../services/supabaseService");
const { INTAKE_CODE_STATUS } = require("./constants");

function mapCodeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    whatsappPhoneNumberId: row.whatsapp_phone_number_id,
    code: row.code,
    campaignName: row.campaign_name,
    purpose: row.purpose,
    language: row.language,
    status: row.status,
    metaCampaignId: row.meta_campaign_id,
    metaAdsetId: row.meta_adset_id,
    metaAdId: row.meta_ad_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    retiredAt: row.retired_at,
    metadata: row.metadata || {}
  };
}

function mapAttributionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignIntakeCodeId: row.campaign_intake_code_id,
    prospectId: row.prospect_id,
    prospectPhone: row.prospect_phone,
    providerMessageId: row.provider_message_id,
    phoneNumberId: row.phone_number_id,
    matchedCode: row.matched_code,
    campaignName: row.campaign_name,
    purpose: row.purpose,
    ownerUserId: row.owner_user_id,
    eligibilityDecision: row.eligibility_decision,
    matchedAt: row.matched_at,
    metadata: row.metadata || {}
  };
}

function createMemoryCampaignIntakeCodeRepository(seed = {}) {
  const codes = new Map();
  for (const [key, row] of Object.entries(seed.codes || {})) {
    const record = row.organizationId ? row : mapCodeRow(row);
    codes.set(String(record.code).toUpperCase(), record);
    codes.set(record.id, record);
    if (key !== record.code.toUpperCase() && key !== record.id) {
      codes.set(key, record);
    }
  }
  const attributions = new Map(Object.entries(seed.attributions || {}));

  return {
    kind: "memory",
    async createCode(row) {
      const record = mapCodeRow(row);
      codes.set(record.code.toUpperCase(), record);
      codes.set(record.id, record);
      return record;
    },
    async getByCode({ organizationId, whatsappPhoneNumberId, code }) {
      const record = codes.get(String(code).toUpperCase());
      if (!record) return null;
      const mapped = record.organizationId ? record : mapCodeRow(record);
      if (mapped.organizationId !== organizationId) return null;
      if (mapped.whatsappPhoneNumberId !== whatsappPhoneNumberId) return null;
      return mapped;
    },
    async listByOrganization(organizationId, { ownerUserId = null } = {}) {
      const rows = [];
      const seen = new Set();
      for (const record of codes.values()) {
        if (!record?.id || seen.has(record.id)) continue;
        if (record.organizationId !== organizationId) continue;
        if (ownerUserId && record.ownerUserId !== ownerUserId) continue;
        seen.add(record.id);
        rows.push(record);
      }
      return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async getById(organizationId, id) {
      const record = codes.get(id);
      if (!record || record.organizationId !== organizationId) return null;
      return record;
    },
    async updateCode(organizationId, id, patch) {
      const existing = await this.getById(organizationId, id);
      if (!existing) return null;
      const next = { ...existing, ...patch };
      codes.set(existing.code.toUpperCase(), next);
      codes.set(existing.id, next);
      return next;
    },
    async insertAttribution(row) {
      const key = `${row.organization_id}:${row.provider_message_id}`;
      if (attributions.has(key)) {
        const existing = attributions.get(key);
        return { row: existing.organizationId ? existing : mapAttributionRow(existing), idempotent: true };
      }
      const record = mapAttributionRow({
        id: row.id || `attr-${attributions.size + 1}`,
        organization_id: row.organization_id,
        campaign_intake_code_id: row.campaign_intake_code_id,
        prospect_id: row.prospect_id,
        prospect_phone: row.prospect_phone,
        provider_message_id: row.provider_message_id,
        phone_number_id: row.phone_number_id,
        matched_code: row.matched_code,
        campaign_name: row.campaign_name,
        purpose: row.purpose,
        owner_user_id: row.owner_user_id,
        eligibility_decision: row.eligibility_decision,
        matched_at: row.matched_at || new Date().toISOString(),
        metadata: row.metadata || {}
      });
      attributions.set(key, record);
      return { row: record, idempotent: false };
    }
  };
}

function createSupabaseCampaignIntakeCodeRepository() {
  return {
    kind: "supabase",
    async createCode(row) {
      const { data, error } = await supabase
        .from("campaign_intake_codes")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return mapCodeRow(data);
    },
    async getByCode({ organizationId, whatsappPhoneNumberId, code }) {
      const { data, error } = await supabase
        .from("campaign_intake_codes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("whatsapp_phone_number_id", whatsappPhoneNumberId)
        .eq("code", String(code).toUpperCase())
        .maybeSingle();
      if (error) throw error;
      return mapCodeRow(data);
    },
    async listByOrganization(organizationId, { ownerUserId = null } = {}) {
      let query = supabase
        .from("campaign_intake_codes")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (ownerUserId) {
        query = query.eq("owner_user_id", ownerUserId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapCodeRow);
    },
    async getById(organizationId, id) {
      const { data, error } = await supabase
        .from("campaign_intake_codes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return mapCodeRow(data);
    },
    async updateCode(organizationId, id, patch) {
      const { data, error } = await supabase
        .from("campaign_intake_codes")
        .update(patch)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return mapCodeRow(data);
    },
    async insertAttribution(row) {
      const { data, error } = await supabase
        .from("campaign_intake_attributions")
        .insert(row)
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          const { data: existing } = await supabase
            .from("campaign_intake_attributions")
            .select("*")
            .eq("organization_id", row.organization_id)
            .eq("provider_message_id", row.provider_message_id)
            .maybeSingle();
          return { row: mapAttributionRow(existing), idempotent: true };
        }
        throw error;
      }
      return { row: mapAttributionRow(data), idempotent: false };
    }
  };
}

function createCampaignIntakeCodeRepository(options = {}) {
  if (options.repository) return options.repository;
  if (options.kind === "memory" || process.env.CAMPAIGN_INTAKE_REPOSITORY === "memory") {
    return createMemoryCampaignIntakeCodeRepository(options.seed || {});
  }
  return createSupabaseCampaignIntakeCodeRepository();
}

module.exports = {
  createCampaignIntakeCodeRepository,
  createMemoryCampaignIntakeCodeRepository,
  mapCodeRow,
  mapAttributionRow,
  INTAKE_CODE_STATUS
};
