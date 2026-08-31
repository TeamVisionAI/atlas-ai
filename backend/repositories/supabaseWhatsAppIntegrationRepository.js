/**
 * Sprint 20.1 + BR-147 — WhatsApp integration repository.
 * Supports legacy organization-owned rows (user_id NULL) and personal rows.
 */

const { supabase } = require("../services/supabaseService");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");
const { metaLogger } = require("../core/meta/metaLogger");
const { assertRepositoryImplementation } = require("./metaConnectionRepositoryInterface");

function isMissingWhatsAppIntegrationsTable(error) {
  if (!error) {
    return false;
  }

  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    String(error.message || "").includes("whatsapp_integrations")
  );
}

function rowToRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id || null,
    organization_id: row.organization_id,
    user_id: row.user_id || null,
    business_id: row.business_id,
    waba_id: row.waba_id,
    phone_number_id: row.phone_number_id,
    display_phone_number: row.display_phone_number,
    business_name: row.business_name,
    verified_name: row.business_name,
    connection_type: row.connection_type,
    status: row.status,
    access_token_encrypted: row.access_token_encrypted,
    last_health_status: row.last_health_status,
    last_health_checked_at: row.last_health_checked_at,
    connected_at: row.connected_at,
    last_sync_at: row.last_sync_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    meta_ad_destination_automation_enabled:
      row.meta_ad_destination_automation_enabled === true,
    metaAdDestinationAutomationEnabled:
      row.meta_ad_destination_automation_enabled === true
  };
}

function resolveMetaAdDestinationFlag(record, existing) {
  if (
    record &&
    Object.prototype.hasOwnProperty.call(record, "metaAdDestinationAutomationEnabled")
  ) {
    return record.metaAdDestinationAutomationEnabled === true;
  }
  if (
    record &&
    Object.prototype.hasOwnProperty.call(record, "meta_ad_destination_automation_enabled")
  ) {
    return record.meta_ad_destination_automation_enabled === true;
  }
  return (
    existing?.metaAdDestinationAutomationEnabled === true ||
    existing?.meta_ad_destination_automation_enabled === true
  );
}

function createSupabaseWhatsAppIntegrationRepository(options = {}) {
  const tokenEncryption = options.tokenEncryption || createTokenEncryption();

  /** Legacy org-owned channel (user_id IS NULL). */
  async function getConnection(organizationId) {
    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .select("*")
      .eq("organization_id", organizationId)
      .is("user_id", null)
      .maybeSingle();

    if (error) {
      if (isMissingWhatsAppIntegrationsTable(error)) {
        return null;
      }

      throw error;
    }

    return rowToRecord(data);
  }

  async function getUserConnection(organizationId, userId) {
    if (!organizationId || !userId) {
      return null;
    }

    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingWhatsAppIntegrationsTable(error)) {
        return null;
      }

      throw error;
    }

    return rowToRecord(data);
  }

  /**
   * Phone Number ID → connected row (org + optional owner user).
   * Ambiguous multi-match fails closed.
   */
  async function findConnectionByPhoneNumberId(phoneNumberId) {
    const id = String(phoneNumberId || "").trim();
    if (!id) {
      return null;
    }

    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .select("*")
      .eq("phone_number_id", id)
      .eq("status", "connected");

    if (error) {
      if (isMissingWhatsAppIntegrationsTable(error)) {
        return null;
      }

      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      return null;
    }

    if (rows.length > 1) {
      const err = new Error("WhatsApp phone_number_id maps to multiple connected owners.");
      err.code = "WHATSAPP_PHONE_ID_AMBIGUOUS";
      err.publicCode = "WHATSAPP_PHONE_ID_AMBIGUOUS";
      err.statusCode = 503;
      throw err;
    }

    return rowToRecord(rows[0]);
  }

  async function saveConnection(organizationId, record) {
    const now = new Date().toISOString();
    const ownerUserId = record.user_id || record.userId || null;
    const existing = ownerUserId
      ? await getUserConnection(organizationId, ownerUserId)
      : await getConnection(organizationId);
    const encryptedToken = tokenEncryption.encrypt(record.access_token);

    const payload = {
      organization_id: organizationId,
      user_id: ownerUserId,
      business_id: record.business_id || null,
      waba_id: record.waba_id,
      phone_number_id: record.phone_number_id,
      display_phone_number: record.display_phone_number || null,
      business_name: record.business_name || record.verified_name || null,
      connection_type: record.connection_type || "whatsapp_business_app",
      status: record.status || "connected",
      access_token_encrypted: encryptedToken,
      last_health_status: record.last_health_status || existing?.last_health_status || "healthy",
      last_health_checked_at: record.last_health_checked_at || now,
      connected_at: record.connected_at || existing?.connected_at || now,
      last_sync_at: record.last_sync_at || now,
      updated_at: now,
      meta_ad_destination_automation_enabled: resolveMetaAdDestinationFlag(
        record,
        existing
      )
    };

    let data;
    let error;

    if (existing?.id) {
      ({ data, error } = await supabase
        .from("whatsapp_integrations")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single());
    } else {
      ({ data, error } = await supabase
        .from("whatsapp_integrations")
        .insert(payload)
        .select("*")
        .single());
    }

    if (error) {
      throw error;
    }

    metaLogger.info("whatsapp_integration_saved", {
      organizationId,
      userId: ownerUserId,
      wabaId: payload.waba_id,
      phoneNumberId: payload.phone_number_id,
      ownership: ownerUserId ? "personal" : "organization",
      storageKind: "supabase"
    });

    return rowToRecord(data);
  }

  async function getDecryptedAccessToken(organizationId, userId = null) {
    const connection = userId
      ? await getUserConnection(organizationId, userId)
      : await getConnection(organizationId);

    if (!connection?.access_token_encrypted || connection.status !== "connected") {
      return null;
    }

    return tokenEncryption.decrypt(connection.access_token_encrypted);
  }

  async function updateConnection(organizationId, patch = {}) {
    const ownerUserId = patch.user_id || patch.userId || null;
    const existing = ownerUserId
      ? await getUserConnection(organizationId, ownerUserId)
      : await getConnection(organizationId);

    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const payload = {
      ...patch,
      updated_at: now,
      last_sync_at: patch.last_sync_at || now
    };

    if (
      Object.prototype.hasOwnProperty.call(patch, "metaAdDestinationAutomationEnabled") ||
      Object.prototype.hasOwnProperty.call(patch, "meta_ad_destination_automation_enabled")
    ) {
      payload.meta_ad_destination_automation_enabled = resolveMetaAdDestinationFlag(
        patch,
        existing
      );
    }

    delete payload.access_token;
    delete payload.organization_id;
    delete payload.userId;
    delete payload.metaAdDestinationAutomationEnabled;

    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return rowToRecord(data);
  }

  async function disconnectConnection(organizationId, userId = null) {
    const now = new Date().toISOString();
    const existing = userId
      ? await getUserConnection(organizationId, userId)
      : await getConnection(organizationId);

    if (!existing?.id) {
      return null;
    }

    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        last_health_status: "disconnected",
        last_health_checked_at: now,
        updated_at: now,
        last_sync_at: now
      })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return rowToRecord(data);
  }

  function getStorageKind() {
    return "supabase";
  }

  return assertRepositoryImplementation({
    saveConnection,
    getConnection,
    getUserConnection,
    findConnectionByPhoneNumberId,
    getDecryptedAccessToken,
    updateConnection,
    disconnectConnection,
    getStorageKind
  });
}

module.exports = {
  createSupabaseWhatsAppIntegrationRepository
};
