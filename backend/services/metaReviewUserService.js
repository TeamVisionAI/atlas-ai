/**
 * Meta App Review — create and manage demo users without invitation email.
 * Available only when META_REVIEW_MODE=true; does not alter production invitation flow.
 */

const { supabase } = require("./supabaseService");
const { hashPassword } = require("../security/passwordService");
const { normalizeRole, USER_STATUSES } = require("../security/roles");
const { writeAuditLog } = require("../security/auditLogService");
const { findUserByEmail, findUserById, revokeAllSessionsForUser } = require("./atlasUserService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");
const identityWriteService = require("./identityWriteService");
const { presentAdminUser } = require("./identityAdminService");
const {
  syncMetaReviewDemoProspectsToLegacy
} = require("./metaReviewLegacyProspectBridge");

const REVIEW_USER_FLAG = "meta_review_user";

function isMetaReviewUser(user) {
  return user?.profile_settings?.[REVIEW_USER_FLAG] === true;
}

function presentReviewUser(row) {
  if (!row) {
    return null;
  }

  return {
    ...presentAdminUser(row),
    meta_review_user: isMetaReviewUser(row)
  };
}

function buildReviewProfileSettings(existingSettings = {}) {
  return {
    ...existingSettings,
    [REVIEW_USER_FLAG]: true
  };
}

function assertPassword(password) {
  hashPassword(password);
}

async function assertSameOrganization(user, authContext) {
  const organizationId = await resolveWorkspaceOrganizationId(authContext);

  if (!user || String(user.organization_id) !== String(organizationId)) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }
}

async function listReviewUsers(authContext) {
  const organizationId = await resolveWorkspaceOrganizationId(authContext);

  const { data, error } = await supabase
    .from("atlas_users")
    .select("*")
    .eq("organization_id", organizationId)
    .contains("profile_settings", { [REVIEW_USER_FLAG]: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return {
    items: (data || []).map((row) => presentReviewUser(row)),
    total: (data || []).length
  };
}

async function activateReviewUserRecord(existing, input, authContext, auditMeta = {}) {
  await assertSameOrganization(existing, authContext);

  if (existing.status === USER_STATUSES.ARCHIVED) {
    const error = new Error("Archived users cannot be activated through review mode.");
    error.statusCode = 400;
    throw error;
  }

  if (existing.status === USER_STATUSES.ACTIVE && isMetaReviewUser(existing)) {
    const error = new Error("Review user already exists. Use reset password instead.");
    error.statusCode = 409;
    throw error;
  }

  if (existing.status === USER_STATUSES.ACTIVE && !isMetaReviewUser(existing)) {
    const error = new Error("A production user with this email already exists.");
    error.statusCode = 409;
    throw error;
  }

  const password = String(input.password || "");
  assertPassword(password);

  const firstName = String(input.firstName || input.first_name || existing.first_name || "").trim();
  const lastName = String(input.lastName || input.last_name || existing.last_name || "").trim();
  const role = normalizeRole(input.role) || existing.role;

  const user = await identityWriteService.updateUser(existing.id, {
    first_name: firstName,
    last_name: lastName,
    role,
    rep_id: input.repId ?? input.rep_id ?? existing.rep_id ?? null,
    phone: input.phone !== undefined ? input.phone || null : existing.phone || null,
    status: USER_STATUSES.ACTIVE,
    password_hash: hashPassword(password),
    profile_settings: buildReviewProfileSettings(existing.profile_settings || {})
  });

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.review_activated",
    targetType: "atlas_user",
    targetId: user.id,
    metadata: { email: user.email, previousStatus: existing.status },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  await syncMetaReviewDemoProspectsToLegacy(user).catch((error) => {
    console.error("[meta-review] Legacy demo prospect bridge failed:", error.message);
  });

  return presentReviewUser(user);
}

async function createReviewUser(input, authContext, auditMeta = {}) {
  const email = String(input.email || "").trim().toLowerCase();
  const role = normalizeRole(input.role);
  const password = String(input.password || "");

  if (!email || !role) {
    const error = new Error("Email, role, and password are required.");
    error.statusCode = 400;
    throw error;
  }

  assertPassword(password);

  const existing = await findUserByEmail(email);

  if (existing) {
    const user = await activateReviewUserRecord(existing, input, authContext, auditMeta);
    return { user, created: false, activated: true };
  }

  const firstName = String(input.firstName || input.first_name || "").trim();
  const lastName = String(input.lastName || input.last_name || "").trim();
  const organizationId = await resolveWorkspaceOrganizationId(authContext);

  const user = await identityWriteService.createUser({
    email,
    first_name: firstName,
    last_name: lastName,
    rep_id: input.repId ?? input.rep_id ?? null,
    phone: input.phone || null,
    organization_id: input.organizationId || organizationId || DEFAULT_ORGANIZATION_ID,
    division_id: input.divisionId || input.division_id || null,
    reports_to_user_id: input.reportsToUserId || input.reports_to_user_id || null,
    role,
    status: USER_STATUSES.ACTIVE,
    password_hash: hashPassword(password),
    timezone: input.timezone || "America/New_York",
    preferred_language: input.preferredLanguage || input.preferred_language || "en",
    notification_preferences: input.notificationPreferences || input.notification_preferences || {},
    profile_settings: buildReviewProfileSettings()
  });

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.review_created",
    targetType: "atlas_user",
    targetId: user.id,
    metadata: { role, email },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  await syncMetaReviewDemoProspectsToLegacy(user).catch((error) => {
    console.error("[meta-review] Legacy demo prospect bridge failed:", error.message);
  });

  return {
    user: presentReviewUser(user),
    created: true
  };
}

async function resetReviewUserPassword(userId, password, authContext, auditMeta = {}) {
  const existing = await findUserById(userId);
  await assertSameOrganization(existing, authContext);

  if (!isMetaReviewUser(existing)) {
    const error = new Error("Only Meta review users can be reset through this action.");
    error.statusCode = 403;
    throw error;
  }

  assertPassword(password);

  const user = await identityWriteService.changePassword(userId, hashPassword(password));
  await revokeAllSessionsForUser(userId);

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.review_password_reset",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return {
    user: presentReviewUser(user),
    success: true
  };
}

async function getReviewUserById(userId, authContext) {
  const user = await findUserById(userId);
  await assertSameOrganization(user, authContext);

  if (!isMetaReviewUser(user)) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return presentReviewUser(user);
}

module.exports = {
  REVIEW_USER_FLAG,
  isMetaReviewUser,
  listReviewUsers,
  createReviewUser,
  resetReviewUserPassword,
  getReviewUserById,
  presentReviewUser
};
