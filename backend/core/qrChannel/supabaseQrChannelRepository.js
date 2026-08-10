/**
 * Supabase persistence for QR Channel Phase 1.
 */

const { supabase } = require("../../services/supabaseService");
const { OPEN_SCAN_STATUSES, SCAN_STATUS } = require("./constants");

function createSupabaseQrChannelRepository(client = supabase) {
  return {
    async findCampaignByTokenHash(tokenHash) {
      const { data, error } = await client
        .from("qr_campaigns")
        .select("*")
        .eq("public_token_hash", tokenHash)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async findCampaignByOrgAndKey(orgId, campaignKey) {
      const { data, error } = await client
        .from("qr_campaigns")
        .select("*")
        .eq("org_id", orgId)
        .eq("campaign_key", campaignKey)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async findCampaignById(id) {
      const { data, error } = await client
        .from("qr_campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async insertCampaign(row) {
      const { data, error } = await client
        .from("qr_campaigns")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async findScanById(id) {
      const { data, error } = await client
        .from("qr_scans")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async insertScan(row) {
      const { data, error } = await client
        .from("qr_scans")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async updateScan(id, patch) {
      const { data, error } = await client
        .from("qr_scans")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async listOpenScansForOrgPhone(orgId, phoneNormalized) {
      const { data, error } = await client
        .from("qr_scans")
        .select("*")
        .eq("org_id", orgId)
        .eq("bound_phone_normalized", phoneNormalized)
        .in("status", [...OPEN_SCAN_STATUSES]);
      if (error) throw error;
      return data || [];
    },

    async supersedeOpenScansExcept({ orgId, phoneNormalized, exceptScanId }) {
      const { data, error } = await client
        .from("qr_scans")
        .update({
          status: SCAN_STATUS.SUPERSEDED,
          updated_at: new Date().toISOString()
        })
        .eq("org_id", orgId)
        .eq("bound_phone_normalized", phoneNormalized)
        .in("status", [...OPEN_SCAN_STATUSES])
        .neq("id", exceptScanId)
        .select("id");
      if (error) throw error;
      return (data || []).length;
    }
  };
}

module.exports = {
  createSupabaseQrChannelRepository
};
