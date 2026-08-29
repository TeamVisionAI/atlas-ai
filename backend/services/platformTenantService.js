/**
 * Platform tenant provisioning — super-admin only.
 * Lifecycle/billing writes delegate to tenantBillingService (BR-145).
 */

const { supabase } = require("./supabaseService");
const { writeAuditLog } = require("../security/auditLogService");
const identityAdminService = require("./identityAdminService");
const { ROLES } = require("../security/roles");
const {
  FIRST_ADMIN_STATUSES,
  resolveFirstAdminFromLoadedUsers,
  hasAssignedFirstAdmin
} = require("../core/platformTenantFirstAdmin");
const tenantBillingService = require("./tenantBillingService");
const {
  TENANT_STATUS,
  ALL_TENANT_STATUSES,
  normalizeTenantStatus,
  mapTenantStatusToOrganizationFields,
  deriveLifecycleStatusFromOrg,
  isTenantOperational
} = require("../core/tenantLifecycle");
const {
  isTeamVisionSeedTenant,
  assertTeamVisionNotDestructible
} = require("../core/teamVisionSeedTenant");

function slugifyOrganizationName(name) {
  return String(name || "organization")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "organization";
}

function deriveLifecycleStatus(row = {}, subscriptionRow = null) {
  if (subscriptionRow) {
    return tenantBillingService.deriveBillingLifecycle(row, subscriptionRow);
  }

  return deriveLifecycleStatusFromOrg(row);
}

function presentTenant(row, subscriptionRow = null, firstAdmin = null) {
  if (!row) {
    return null;
  }

  const lifecycleStatus = deriveLifecycleStatus(row, subscriptionRow);
  const ownerUserId = row.owner_user_id || null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    lifecycleStatus,
    status: row.status,
    isActive: row.is_active !== false,
    isSeedTenant: isTeamVisionSeedTenant(row.id),
    subscriptionPlan: row.subscription_plan || subscriptionRow?.plan || null,
    plan: subscriptionRow?.plan || row.subscription_plan || null,
    subscriptionStatus: row.subscription_status || subscriptionRow?.status || null,
    monthlyPriceCents: subscriptionRow?.monthly_price_cents ?? null,
    currency: subscriptionRow?.currency || null,
    paymentMethod: subscriptionRow?.payment_method || null,
    trialStartsAt: subscriptionRow?.trial_starts_at || null,
    trialEndsAt: subscriptionRow?.trial_ends_at || null,
    lastPaidAt: subscriptionRow?.last_paid_at || null,
    nextDueAt: subscriptionRow?.next_due_at || null,
    ownerUserId,
    firstAdmin: firstAdmin || null,
    hasFirstAdmin: hasAssignedFirstAdmin({ ownerUserId, firstAdmin }),
    timezone: row.timezone || null,
    logoUrl: row.logo_url || null,
    primaryColor: row.primary_color || null,
    secondaryColor: row.secondary_color || null,
    website: row.website || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadFirstAdminSummaries(organizationRows = []) {
  const rows = organizationRows.filter((row) => row?.id);
  const byOrg = new Map();

  if (!rows.length) {
    return byOrg;
  }

  const organizationIds = rows.map((row) => row.id);
  const ownerIds = [...new Set(rows.map((row) => row.owner_user_id).filter(Boolean))];
  const loaded = [];

  if (ownerIds.length) {
    const { data, error } = await supabase
      .from("atlas_users")
      .select(
        "id, organization_id, first_name, last_name, display_name, email, status, role, business_rank, created_at"
      )
      .in("id", ownerIds);

    if (error) {
      throw error;
    }

    loaded.push(...(data || []));
  }

  const { data: candidates, error: candidateError } = await supabase
    .from("atlas_users")
    .select(
      "id, organization_id, first_name, last_name, display_name, email, status, role, business_rank, created_at"
    )
    .in("organization_id", organizationIds)
    .in("status", FIRST_ADMIN_STATUSES)
    .or("role.eq.administrator,business_rank.eq.RVP")
    .order("created_at", { ascending: true });

  if (candidateError) {
    throw candidateError;
  }

  loaded.push(...(candidates || []));

  for (const row of rows) {
    byOrg.set(
      row.id,
      resolveFirstAdminFromLoadedUsers({
        ownerUserId: row.owner_user_id,
        organizationId: row.id,
        users: loaded
      })
    );
  }

  return byOrg;
}

async function createTenant(input = {}, auditMeta = {}) {
  const name = String(input.name || "").trim();

  if (!name) {
    const error = new Error("Organization name is required.");
    error.statusCode = 400;
    throw error;
  }

  const lifecycleStatus = normalizeTenantStatus(input.status || input.lifecycleStatus);
  const slug = String(input.slug || slugifyOrganizationName(name)).trim().toLowerCase();

  if (isTeamVisionSeedTenant(input.id) || slug === "team-vision") {
    const error = new Error("Team Vision seed tenant already exists and cannot be recreated.");
    error.statusCode = 409;
    error.publicCode = "SEED_TENANT_PROTECTED";
    throw error;
  }
  const mapped = mapTenantStatusToOrganizationFields(lifecycleStatus);
  const now = new Date().toISOString();

  const insertRow = {
    name,
    slug,
    status: mapped.status,
    is_active: mapped.is_active,
    subscription_plan: input.subscriptionPlan || input.subscription_plan || "professional",
    subscription_status: mapped.subscription_status,
    timezone: input.timezone || "America/New_York",
    logo_url: input.logoUrl || input.logo_url || null,
    primary_color: input.primaryColor || input.primary_color || null,
    secondary_color: input.secondaryColor || input.secondary_color || null,
    website: input.website || null,
    updated_at: now
  };

  const { data, error } = await supabase.from("organizations").insert(insertRow).select("*").single();

  if (error) {
    if (error.code === "23505") {
      const conflict = new Error("Organization slug already exists.");
      conflict.statusCode = 409;
      conflict.publicCode = "ORGANIZATION_SLUG_CONFLICT";
      throw conflict;
    }

    throw error;
  }

  const { orgRow, subscriptionRow } = await tenantBillingService.initializeBillingForNewTenant(
    data.id,
    lifecycleStatus,
    data.created_at || now
  );

  await writeAuditLog({
    organizationId: data.id,
    userId: auditMeta.userId || null,
    userEmail: auditMeta.userEmail || null,
    action: "platform.tenant_created",
    targetType: "organization",
    targetId: data.id,
    metadata: {
      name,
      slug,
      lifecycleStatus
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  // RT2 — new non-seed tenants start with operational features explicitly OFF.
  try {
    const {
      initializeTenantFeaturesOff
    } = require("./tenantFeatureService");
    await initializeTenantFeaturesOff(data.id, auditMeta);
  } catch (featureError) {
    console.warn(
      "[platformTenantService] initializeTenantFeaturesOff failed:",
      featureError.message
    );
  }

  return presentTenant(orgRow || data, subscriptionRow);
}

async function listTenants(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);

  let dbQuery = supabase
    .from("organizations")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (query.q) {
    const needle = `%${String(query.q).trim()}%`;
    dbQuery = dbQuery.or(`name.ilike.${needle},slug.ilike.${needle}`);
  }

  const { data, error, count } = await dbQuery;

  if (error) {
    throw error;
  }

  const rows = data || [];
  const subscriptionsByOrgId = await loadSubscriptionSummaries(rows.map((row) => row.id));
  const firstAdminsByOrgId = await loadFirstAdminSummaries(rows);

  return {
    items: rows.map((row) =>
      presentTenant(
        row,
        subscriptionsByOrgId.get(row.id) || null,
        firstAdminsByOrgId.get(row.id) || null
      )
    ),
    total: count ?? rows.length,
    limit,
    offset
  };
}

async function loadSubscriptionSummaries(organizationIds = []) {
  const ids = organizationIds.filter(Boolean);

  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("organization_subscriptions")
    .select(
      "organization_id, plan, status, trial_starts_at, trial_ends_at, monthly_price_cents, currency, payment_method, last_paid_at, next_due_at"
    )
    .in("organization_id", ids);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((row) => [row.organization_id, row]));
}

async function getTenant(organizationId) {
  if (!organizationId) {
    return null;
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const { data: subscriptionRow } = await supabase
    .from("organization_subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const firstAdminsByOrgId = await loadFirstAdminSummaries([data]);
  const tenant = presentTenant(data, subscriptionRow, firstAdminsByOrgId.get(data.id) || null);

  try {
    const {
      getTenantFeatureControlsPresentation
    } = require("./tenantFeatureService");
    const featurePresentation = await getTenantFeatureControlsPresentation(
      organizationId,
      { lifecycleStatus: tenant.lifecycleStatus }
    );
    tenant.features = featurePresentation.features;
    tenant.featureControls = featurePresentation.controls;
  } catch {
    tenant.features = {
      recruitAiAuthoringEnabled: false,
      recruitAiExecutionEnabled: false,
      qrCampaignManagerEnabled: false
    };
    tenant.featureControls = [];
  }

  try {
    const {
      getTenantGrant
    } = require("./recruitAiV2CertificationService");
    tenant.recruitAiV2 = await getTenantGrant(organizationId);
  } catch {
    tenant.recruitAiV2 = {
      certified: false,
      enabled: false,
      suspended: tenant.lifecycleStatus === "SUSPENDED",
      lifecycleStatus: tenant.lifecycleStatus || null
    };
  }

  return tenant;
}

async function setTenantStatus(organizationId, lifecycleStatusInput, auditMeta = {}) {
  await tenantBillingService.setLifecycleStatus(organizationId, lifecycleStatusInput, auditMeta);
  return getTenant(organizationId);
}

async function assertTenantOperational(organizationId) {
  const tenant = await getTenant(organizationId);

  if (!tenant) {
    const error = new Error("Organization not found.");
    error.statusCode = 404;
    error.publicCode = "ORGANIZATION_NOT_FOUND";
    throw error;
  }

  if (!isTenantOperational(tenant.lifecycleStatus, {
    trialEndsAt: tenant.trialEndsAt,
    organizationId
  })) {
    const error = new Error("Tenant is suspended.");
    error.statusCode = 403;
    error.publicCode = "TENANT_SUSPENDED";
    throw error;
  }

  return tenant;
}

async function provisionTenantAdmin(organizationId, input = {}, authContext = {}, auditMeta = {}) {
  const tenant = await getTenant(organizationId);

  if (!tenant) {
    const error = new Error("Organization not found.");
    error.statusCode = 404;
    error.publicCode = "ORGANIZATION_NOT_FOUND";
    throw error;
  }

  if (hasAssignedFirstAdmin({ ownerUserId: tenant.ownerUserId, firstAdmin: tenant.firstAdmin })) {
    const error = new Error("This tenant already has a first admin assigned.");
    error.statusCode = 409;
    error.publicCode = "FIRST_ADMIN_ALREADY_ASSIGNED";
    throw error;
  }

  const result = await identityAdminService.createUser(
    {
      ...input,
      role: input.role || ROLES.ADMINISTRATOR,
      businessRank: input.businessRank || input.business_rank || "RVP",
      organizationId
    },
    authContext,
    auditMeta,
    { allowTargetOrganizationId: true }
  );

  if (result.user?.id) {
    await supabase
      .from("organizations")
      .update({
        owner_user_id: result.user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", organizationId);
  }

  await writeAuditLog({
    organizationId,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "platform.tenant_admin_provisioned",
    targetType: "atlas_user",
    targetId: result.user?.id || null,
    metadata: {
      email: result.user?.email || input.email,
      role: ROLES.ADMINISTRATOR
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return result;
}

function deleteTenant(organizationId) {
  assertTeamVisionNotDestructible(organizationId, "delete");
  const error = new Error("Tenant deletion is not implemented.");
  error.statusCode = 501;
  error.publicCode = "TENANT_DELETE_NOT_IMPLEMENTED";
  throw error;
}

function archiveTenant(organizationId) {
  assertTeamVisionNotDestructible(organizationId, "archive");
  const error = new Error("Tenant archive is not implemented.");
  error.statusCode = 501;
  error.publicCode = "TENANT_ARCHIVE_NOT_IMPLEMENTED";
  throw error;
}

function resetTenant(organizationId) {
  assertTeamVisionNotDestructible(organizationId, "reset");
  const error = new Error("Tenant reset is not implemented.");
  error.statusCode = 501;
  error.publicCode = "TENANT_RESET_NOT_IMPLEMENTED";
  throw error;
}

module.exports = {
  TENANT_STATUS,
  ALL_TENANT_STATUSES,
  slugifyOrganizationName,
  normalizeTenantStatus,
  deriveLifecycleStatus,
  mapTenantStatusToOrganizationFields,
  presentTenant,
  loadFirstAdminSummaries,
  isTenantOperational,
  createTenant,
  listTenants,
  getTenant,
  setTenantStatus,
  assertTenantOperational,
  provisionTenantAdmin,
  deleteTenant,
  archiveTenant,
  resetTenant
};
