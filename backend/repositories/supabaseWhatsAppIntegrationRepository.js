/**
 * Sprint 20.1 — Supabase-backed WhatsApp integration repository.
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
    organization_id: row.organization_id,
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
    updated_at: row.updated_at
  };
}

function createSupabaseWhatsAppIntegrationRepository(options = {}) {
  const tokenEncryption = options.tokenEncryption || createTokenEncryption();

  async function getConnection(organizationId) {
    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      if (isMissingWhatsAppIntegrationsTable(error)) {
        return null;
      }

      throw error;
    }

    return rowToRecord(data);
  }

  async function saveConnection(organizationId, record) {
    const now = new Date().toISOString();
    const existing = await getConnection(organizationId);
    const encryptedToken = tokenEncryption.encrypt(record.access_token);

    const payload = {
      organization_id: organizationId,
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
      updated_at: now
    };

    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .upsert(payload, { onConflict: "organization_id" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    metaLogger.info("whatsapp_integration_saved", {
      organizationId,
      wabaId: payload.waba_id,
      phoneNumberId: payload.phone_number_id,
      storageKind: "supabase"
    });

    return rowToRecord(data);
  }

  async function getDecryptedAccessToken(organizationId) {
    const connection = await getConnection(organizationId);

    if (!connection?.access_token_encrypted || connection.status !== "connected") {
      return null;
    }

    return tokenEncryption.decrypt(connection.access_token_encrypted);
  }

  async function updateConnection(organizationId, patch = {}) {
    const existing = await getConnection(organizationId);

    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const payload = {
      ...patch,
      updated_at: now,
      last_sync_at: patch.last_sync_at || now
    };

    delete payload.access_token;
    delete payload.organization_id;

    const { data, error } = await supabase
      .from("whatsapp_integrations")
      .update(payload)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return rowToRecord(data);
  }

  async function disconnectConnection(organizationId) {
    const now = new Date().toISOString();

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
      .eq("organization_id", organizationId)
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
    getDecryptedAccessToken,
    updateConnection,
    disconnectConnection,
    getStorageKind
  });
}

module.exports = {
  createSupabaseWhatsAppIntegrationRepository
};
