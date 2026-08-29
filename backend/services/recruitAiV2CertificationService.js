/**
 * BR-169 — Super Admin tenant certification + tenant Admin user grants.
 */

const { supabase } = require("./supabaseService");
const { writeAuditLog } = require("../security/auditLogService");
const {
  deriveLifecycleStatusFromOrg,
  TENANT_STATUS
} = require("../core/tenantLifecycle");
const {
  emptyGrant,
  grantAuthorizesAuthoring,
  grantAuthorizesExecution
} = require("../core/recruitAiV2/v2CertificationGrants");

function isTableMissing(error) {
  const message = String(error?.message || error?.details || error || "");
  const code = String(error?.code || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message) ||
    /schema cache/i.test(message)
  );
}

function presentTenantGrant(row = null, lifecycleStatus = null) {
  const certified = Boolean(row?.certified);
  const enabled = Boolean(row?.enabled) && certified;
  return {
    certified,
    certifiedAt: row?.certified_at || null,
    certifiedByUserId: row?.certified_by_user_id || null,
    enabled,
    enabledAt: row?.enabled_at || null,
    enabledByUserId: row?.enabled_by_user_id || null,
    lifecycleStatus: lifecycleStatus || null,
    suspended: lifecycleStatus === TENANT_STATUS.SUSPENDED,
    updatedAt: row?.updated_at || null
  };
}

function presentUserGrant(row = null) {
  return {
    authoringEnabled: Boolean(row?.authoring_enabled),
    executionEnabled: Boolean(row?.execution_enabled),
    updatedAt: row?.updated_at || null,
    updatedByUserId: row?.updated_by_user_id || null
  };
}

async function writeAudit(action, { organizationId, userId, targetId, metadata }) {
  await writeAuditLog({
    organizationId,
    userId,
    action,
    targetType: targetId ? "user" : "organization",
    targetId: targetId || organizationId,
    result: "success",
    metadata: metadata || {}
  });
}

async function loadOrganizationLifecycle(organizationId) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id,status,is_active,subscription_status")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return { lifecycleStatus: null, suspended: false, exists: false };
  }
  const lifecycleStatus = deriveLifecycleStatusFromOrg(data);
  return {
    lifecycleStatus,
    suspended: lifecycleStatus === TENANT_STATUS.SUSPENDED,
    exists: true
  };
}

async function getTenantGrant(organizationId) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    return presentTenantGrant(null, null);
  }

  const lifecycle = await loadOrganizationLifecycle(orgId).catch(() => ({
    lifecycleStatus: null,
    suspended: false,
    exists: true
  }));

  const { data, error } = await supabase
    .from("recruit_ai_v2_tenant_grants")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    if (isTableMissing(error)) {
      return presentTenantGrant(null, lifecycle.lifecycleStatus);
    }
    throw error;
  }

  return presentTenantGrant(data, lifecycle.lifecycleStatus);
}

async function getUserGrant(organizationId, userId) {
  const orgId = String(organizationId || "").trim();
  const uid = String(userId || "").trim();
  if (!orgId || !uid) {
    return presentUserGrant(null);
  }

  const { data, error } = await supabase
    .from("recruit_ai_v2_user_grants")
    .select("*")
    .eq("organization_id", orgId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    if (isTableMissing(error)) {
      return presentUserGrant(null);
    }
    throw error;
  }

  return presentUserGrant(data);
}

/**
 * Snapshot consumed by live authoring / execution resolvers.
 */
const GRANT_LOOKUP_TIMEOUT_MS = 2000;

async function loadRecruitAiV2EligibilityGrant({
  organizationId,
  userId
} = {}) {
  const orgId = String(organizationId || "").trim();
  const uid = String(userId || "").trim();
  if (!orgId) {
    return emptyGrant();
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return emptyGrant({ source: "lookup_unavailable" });
  }

  try {
    const loaded = Promise.all([
      getTenantGrant(orgId),
      uid ? getUserGrant(orgId, uid) : Promise.resolve(presentUserGrant(null))
    ]).then(([tenant, user]) =>
      emptyGrant({
        tenantCertified: tenant.certified,
        tenantEnabled: tenant.enabled,
        tenantSuspended: tenant.suspended,
        authoringEnabled: user.authoringEnabled,
        executionEnabled: user.executionEnabled,
        source: "durable"
      })
    );
    const timedOut = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("GRANT_LOOKUP_TIMEOUT")), GRANT_LOOKUP_TIMEOUT_MS);
    });
    return await Promise.race([loaded, timedOut]);
  } catch (error) {
    if (isTableMissing(error)) {
      return emptyGrant();
    }
    return emptyGrant({ source: "lookup_failed" });
  }
}

async function upsertTenantGrant(organizationId, patch, actor = {}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    const error = new Error("organizationId is required");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }

  const lifecycle = await loadOrganizationLifecycle(orgId);
  if (!lifecycle.exists) {
    const error = new Error("Organization not found");
    error.statusCode = 404;
    error.publicCode = "ORGANIZATION_NOT_FOUND";
    throw error;
  }

  const current = await getTenantGrant(orgId);
  const now = new Date().toISOString();
  const actorId = actor.userId || null;

  let certified = current.certified;
  let certifiedAt = current.certifiedAt;
  let certifiedByUserId = current.certifiedByUserId;
  let enabled = current.enabled;
  let enabledAt = current.enabledAt;
  let enabledByUserId = current.enabledByUserId;

  if (patch.certified === true && !certified) {
    certified = true;
    certifiedAt = now;
    certifiedByUserId = actorId;
  } else if (patch.certified === false && certified) {
    certified = false;
    certifiedAt = null;
    certifiedByUserId = null;
    enabled = false;
    enabledAt = null;
    enabledByUserId = null;
  }

  if (patch.enabled === true) {
    if (!certified) {
      const error = new Error("Tenant must be certified before Recruit AI v2 can be enabled");
      error.statusCode = 409;
      error.publicCode = "RECRUIT_AI_V2_NOT_CERTIFIED";
      throw error;
    }
    if (!enabled) {
      enabled = true;
      enabledAt = now;
      enabledByUserId = actorId;
    }
  } else if (patch.enabled === false && enabled) {
    enabled = false;
    enabledAt = null;
    enabledByUserId = null;
  }

  const payload = {
    organization_id: orgId,
    certified,
    certified_at: certifiedAt,
    certified_by_user_id: certifiedByUserId,
    enabled,
    enabled_at: enabledAt,
    enabled_by_user_id: enabledByUserId,
    updated_at: now
  };

  const { data, error } = await supabase
    .from("recruit_ai_v2_tenant_grants")
    .upsert(payload, { onConflict: "organization_id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  if (certified !== current.certified) {
    await writeAudit(
      certified ? "recruit_ai_v2.tenant_certified" : "recruit_ai_v2.tenant_uncertified",
      {
        organizationId: orgId,
        userId: actorId,
        metadata: { certified, enabled }
      }
    );
  }
  if (enabled !== current.enabled) {
    await writeAudit(
      enabled ? "recruit_ai_v2.tenant_enabled" : "recruit_ai_v2.tenant_disabled",
      {
        organizationId: orgId,
        userId: actorId,
        metadata: { certified, enabled }
      }
    );
  }

  return presentTenantGrant(data, lifecycle.lifecycleStatus);
}

async function assertUserInOrganization(organizationId, userId) {
  const { data, error } = await supabase
    .from("atlas_users")
    .select("id,organization_id,status")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data || String(data.organization_id) !== String(organizationId)) {
    const err = new Error("User is not in this organization");
    err.statusCode = 404;
    err.publicCode = "USER_NOT_FOUND";
    throw err;
  }
  return data;
}

async function upsertUserGrant({
  organizationId,
  userId,
  authoringEnabled,
  executionEnabled,
  actor = {},
  requireTenantEnabled = true
} = {}) {
  const orgId = String(organizationId || "").trim();
  const uid = String(userId || "").trim();
  if (!orgId || !uid) {
    const error = new Error("organizationId and userId are required");
    error.statusCode = 400;
    error.publicCode = "SCOPE_REQUIRED";
    throw error;
  }

  if (requireTenantEnabled) {
    const tenant = await getTenantGrant(orgId);
    if (tenant.suspended) {
      const error = new Error("Suspended tenants cannot change Recruit AI v2 grants");
      error.statusCode = 403;
      error.publicCode = "TENANT_SUSPENDED";
      throw error;
    }
    if (!tenant.certified || !tenant.enabled) {
      const error = new Error(
        "Recruit AI v2 user grants require a certified and enabled tenant"
      );
      error.statusCode = 409;
      error.publicCode = "RECRUIT_AI_V2_TENANT_NOT_ENABLED";
      throw error;
    }
  }

  await assertUserInOrganization(orgId, uid);
  const current = await getUserGrant(orgId, uid);
  const now = new Date().toISOString();

  const nextAuthoring =
    authoringEnabled === undefined ? current.authoringEnabled : Boolean(authoringEnabled);
  const nextExecution =
    executionEnabled === undefined ? current.executionEnabled : Boolean(executionEnabled);

  const payload = {
    organization_id: orgId,
    user_id: uid,
    authoring_enabled: nextAuthoring,
    execution_enabled: nextExecution,
    updated_by_user_id: actor.userId || null,
    updated_at: now
  };

  const { data, error } = await supabase
    .from("recruit_ai_v2_user_grants")
    .upsert(payload, { onConflict: "organization_id,user_id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  if (nextAuthoring !== current.authoringEnabled) {
    await writeAudit("recruit_ai_v2.user_authoring_updated", {
      organizationId: orgId,
      userId: actor.userId || null,
      targetId: uid,
      metadata: { authoringEnabled: nextAuthoring, executionEnabled: nextExecution }
    });
  }
  if (nextExecution !== current.executionEnabled) {
    await writeAudit("recruit_ai_v2.user_execution_updated", {
      organizationId: orgId,
      userId: actor.userId || null,
      targetId: uid,
      metadata: { authoringEnabled: nextAuthoring, executionEnabled: nextExecution }
    });
  }

  return presentUserGrant(data);
}

async function getTenantV2Status(organizationId) {
  const tenant = await getTenantGrant(organizationId);
  return {
    tenant,
    canManageUserGrants: tenant.certified && tenant.enabled && !tenant.suspended,
    grantAuthorizesAuthoring,
    grantAuthorizesExecution
  };
}

module.exports = {
  presentTenantGrant,
  presentUserGrant,
  getTenantGrant,
  getUserGrant,
  getTenantV2Status,
  loadRecruitAiV2EligibilityGrant,
  upsertTenantGrant,
  upsertUserGrant,
  assertUserInOrganization,
  isTableMissing
};
