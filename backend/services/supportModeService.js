/**
 * Super Admin Support Mode — explicit tenant selection (not impersonation).
 * Active context is scoped to SUPER_ADMIN + authenticated session, not the admin globally.
 */

const { supabase } = require("./supabaseService");
const { writeAuditLog } = require("../security/auditLogService");
const platformTenantService = require("./platformTenantService");

const testMemoryStore = new Map();

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function isMissingSupportSessionsTable(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message || "");
  return (
    error.code === "42P01" ||
    message.includes("atlas_support_sessions") ||
    message.includes("Could not find the table")
  );
}

function useTestMemoryStore() {
  if (isProductionRuntime()) {
    return false;
  }

  return (
    process.env.NODE_ENV === "test" ||
    process.env.ATLAS_SUPPORT_SESSIONS_BACKEND === "memory"
  );
}

function supportModeUnavailableError() {
  const error = new Error("Support Mode is unavailable because session storage is not configured.");
  error.statusCode = 503;
  error.publicCode = "SUPPORT_MODE_UNAVAILABLE";
  return error;
}

function missingAuthSessionError() {
  const error = new Error("Support Mode requires an authenticated session identifier.");
  error.statusCode = 401;
  error.publicCode = "SUPPORT_MODE_SESSION_REQUIRED";
  return error;
}

function memoryKey(adminUserId, authSessionId) {
  return `${adminUserId}::${authSessionId}`;
}

async function fetchActiveSession(adminUserId, authSessionId) {
  if (!adminUserId || !authSessionId) {
    return null;
  }

  if (useTestMemoryStore()) {
    return testMemoryStore.get(memoryKey(adminUserId, authSessionId)) || null;
  }

  const { data, error } = await supabase
    .from("atlas_support_sessions")
    .select("id, admin_user_id, auth_session_id, organization_id, entered_at, exited_at")
    .eq("admin_user_id", adminUserId)
    .eq("auth_session_id", authSessionId)
    .is("exited_at", null)
    .order("entered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSupportSessionsTable(error)) {
      if (isProductionRuntime()) {
        throw supportModeUnavailableError();
      }

      return testMemoryStore.get(memoryKey(adminUserId, authSessionId)) || null;
    }

    throw error;
  }

  return data || null;
}

async function getActiveSupportSession(adminUserId, authSessionId) {
  if (!authSessionId) {
    return null;
  }

  const row = await fetchActiveSession(adminUserId, authSessionId);

  if (!row?.organization_id) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    enteredAt: row.entered_at,
    authSessionId: row.auth_session_id || authSessionId
  };
}

async function loadSupportContextForRequest(adminUserId, authSessionId) {
  try {
    return await getActiveSupportSession(adminUserId, authSessionId);
  } catch (error) {
    if (error.publicCode === "SUPPORT_MODE_UNAVAILABLE") {
      return null;
    }

    throw error;
  }
}

async function enterSupportMode(adminUserId, organizationId, authSessionId, auditMeta = {}) {
  if (!authSessionId) {
    throw missingAuthSessionError();
  }

  const tenant = await platformTenantService.getTenant(organizationId);

  if (!tenant) {
    const error = new Error("Organization not found.");
    error.statusCode = 404;
    error.publicCode = "ORGANIZATION_NOT_FOUND";
    throw error;
  }

  if (tenant.lifecycleStatus === platformTenantService.TENANT_STATUS.SUSPENDED) {
    const error = new Error("Support Mode is not available for suspended tenants.");
    error.statusCode = 403;
    error.publicCode = "TENANT_SUSPENDED";
    throw error;
  }

  const enteredAt = new Date().toISOString();

  if (useTestMemoryStore()) {
    testMemoryStore.set(memoryKey(adminUserId, authSessionId), {
      id: `memory-${adminUserId}-${authSessionId}`,
      admin_user_id: adminUserId,
      auth_session_id: authSessionId,
      organization_id: organizationId,
      entered_at: enteredAt,
      exited_at: null
    });
  } else {
    const { error: closeError } = await supabase
      .from("atlas_support_sessions")
      .update({ exited_at: enteredAt })
      .eq("admin_user_id", adminUserId)
      .eq("auth_session_id", authSessionId)
      .is("exited_at", null);

    if (closeError && isMissingSupportSessionsTable(closeError)) {
      if (isProductionRuntime()) {
        throw supportModeUnavailableError();
      }
    } else if (closeError) {
      throw closeError;
    }

    const { error: insertError } = await supabase.from("atlas_support_sessions").insert({
      admin_user_id: adminUserId,
      auth_session_id: authSessionId,
      organization_id: organizationId,
      entered_at: enteredAt
    });

    if (insertError) {
      if (isMissingSupportSessionsTable(insertError)) {
        if (isProductionRuntime()) {
          throw supportModeUnavailableError();
        }

        testMemoryStore.set(memoryKey(adminUserId, authSessionId), {
          id: `memory-${adminUserId}-${authSessionId}`,
          admin_user_id: adminUserId,
          auth_session_id: authSessionId,
          organization_id: organizationId,
          entered_at: enteredAt,
          exited_at: null
        });
      } else {
        throw insertError;
      }
    }
  }

  await writeAuditLog({
    organizationId,
    userId: adminUserId,
    userEmail: auditMeta.userEmail || null,
    action: "support_mode.entered",
    targetType: "organization",
    targetId: organizationId,
    metadata: {
      supportMode: true,
      supportOrganizationId: organizationId,
      adminUserId,
      authSessionId,
      enteredAt
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return {
    organizationId,
    organizationName: tenant.name,
    enteredAt,
    lifecycleStatus: tenant.lifecycleStatus,
    authSessionId
  };
}

async function exitSupportMode(adminUserId, authSessionId, auditMeta = {}) {
  if (!authSessionId) {
    throw missingAuthSessionError();
  }

  const active = await fetchActiveSession(adminUserId, authSessionId);
  const exitedAt = new Date().toISOString();

  if (!active) {
    return { exited: false, organizationId: null };
  }

  if (useTestMemoryStore()) {
    testMemoryStore.delete(memoryKey(adminUserId, authSessionId));
  } else {
    const { error } = await supabase
      .from("atlas_support_sessions")
      .update({ exited_at: exitedAt })
      .eq("admin_user_id", adminUserId)
      .eq("auth_session_id", authSessionId)
      .is("exited_at", null);

    if (error && isMissingSupportSessionsTable(error)) {
      if (isProductionRuntime()) {
        throw supportModeUnavailableError();
      }

      testMemoryStore.delete(memoryKey(adminUserId, authSessionId));
    } else if (error) {
      throw error;
    }
  }

  await writeAuditLog({
    organizationId: active.organization_id,
    userId: adminUserId,
    userEmail: auditMeta.userEmail || null,
    action: "support_mode.exited",
    targetType: "organization",
    targetId: active.organization_id,
    metadata: {
      supportMode: true,
      supportOrganizationId: active.organization_id,
      adminUserId,
      authSessionId,
      enteredAt: active.entered_at,
      exitedAt
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return {
    exited: true,
    organizationId: active.organization_id,
    exitedAt
  };
}

async function getSupportModeStatus(adminUserId, authSessionId) {
  if (!authSessionId) {
    throw missingAuthSessionError();
  }

  const active = await getActiveSupportSession(adminUserId, authSessionId);

  if (!active) {
    return { active: false, organizationId: null, enteredAt: null, authSessionId };
  }

  const tenant = await platformTenantService.getTenant(active.organizationId);

  return {
    active: true,
    organizationId: active.organizationId,
    organizationName: tenant?.name || null,
    enteredAt: active.enteredAt,
    lifecycleStatus: tenant?.lifecycleStatus || null,
    authSessionId
  };
}

function __resetTestMemoryStoreForTests() {
  testMemoryStore.clear();
}

module.exports = {
  getActiveSupportSession,
  loadSupportContextForRequest,
  enterSupportMode,
  exitSupportMode,
  getSupportModeStatus,
  useTestMemoryStore,
  __resetTestMemoryStoreForTests
};
