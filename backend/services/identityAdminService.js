/**
 * LC1.1 — Administrator user management service.
 */

const { supabase } = require("../services/supabaseService");
const { hashPassword } = require("../security/passwordService");
const { generateToken, hashToken } = require("../security/tokenService");
const { normalizeRole, normalizeStatus, USER_STATUSES, ROLES } = require("../security/roles");
const { writeAuditLog } = require("../security/auditLogService");
const { sendInvitationEmail } = require("../services/emailService");
const {
  findUserById,
  findUserByEmail,
  buildAdminUserSearchFilter,
  revokeAllSessionsForUser,
  sanitizeUser
} = require("../services/atlasUserService");
const { requestPasswordReset } = require("../services/authService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");
const { sanitizeListQuery } = require("../core/listQuerySanitizer");
const identityWriteService = require("./identityWriteService");

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function buildDisplayName(firstName, lastName, fallback = "") {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function presentAdminUser(row, extras = {}) {
  if (!row) {
    return null;
  }

  return {
    ...sanitizeUser(row),
    phone: row.phone || null,
    photo_url: row.photo_url || null,
    reports_to_user_id: row.reports_to_user_id || null,
    notification_preferences: row.notification_preferences || {},
    timezone: row.timezone || "America/New_York",
    preferred_language: row.preferred_language || "en",
    last_login_at: row.last_login_at || null,
    archived_at: row.archived_at || null,
    organization_name: extras.organizationName || null,
    division_name: extras.divisionName || null,
    reports_to_name: extras.reportsToName || null
  };
}

async function listUsers(query = {}, authContext) {
  const filters = sanitizeListQuery(query);
  const limit = Math.min(Number(filters.limit) || 25, 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const organizationId = await resolveWorkspaceOrganizationId(authContext);

  let dbQuery = supabase
    .from("atlas_users")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const normalizedStatus = filters.status ? normalizeStatus(filters.status) : null;

  if (normalizedStatus) {
    dbQuery = dbQuery.eq("status", normalizedStatus);
  }

  const normalizedRole = filters.role ? normalizeRole(filters.role) : null;

  if (normalizedRole) {
    dbQuery = dbQuery.eq("role", normalizedRole);
  }

  if (filters.q) {
    dbQuery = dbQuery.or(buildAdminUserSearchFilter(filters.q));
  }

  console.info("[admin/users/list]", {
    table: "atlas_users",
    organizationId,
    status: normalizedStatus,
    role: normalizedRole,
    search: filters.q || null,
    limit,
    offset
  });

  const { data, error, count } = await dbQuery;

  if (error) {
    console.error("[admin/users/list] query failed", {
      organizationId,
      code: error.code,
      message: error.message
    });
    throw error;
  }

  console.info("[admin/users/list] result", {
    organizationId,
    total: count ?? (data || []).length,
    returned: (data || []).length
  });

  const presented = (data || []).map((row) => presentAdminUser(row));

  try {
    const {
      attachSecuritiesSummaries
    } = require("../security/securitiesAccessService");
    const withSecurities = await attachSecuritiesSummaries(organizationId, presented);
    return {
      items: withSecurities,
      total: count ?? withSecurities.length,
      limit,
      offset
    };
  } catch (securitiesError) {
    console.error("[admin/users/list] securities summary attach failed", securitiesError.message);
    return {
      items: presented.map((user) => ({
        ...user,
        securities_access: {
          securities_access_status: "UNKNOWN",
          securities_access_verified: false,
          permitted_product_scope: [],
          registration_type: null,
          effective_from: null,
          effective_to: null,
          jurisdiction_scope: null,
          canAccessSecuritiesContent: false
        }
      })),
      total: count ?? presented.length,
      limit,
      offset
    };
  }
}

async function getUserById(userId, authContext) {
  const user = await findUserById(userId);
  const organizationId = await resolveWorkspaceOrganizationId(authContext);

  if (!user || String(user.organization_id) !== String(organizationId)) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const presented = presentAdminUser(user);

  try {
    const { getAdminSecuritiesSummary } = require("../security/securitiesAccessService");
    const securities_access = await getAdminSecuritiesSummary(organizationId, userId);
    return { ...presented, securities_access };
  } catch (securitiesError) {
    console.error("[admin/users/get] securities summary failed", securitiesError.message);
    return {
      ...presented,
      securities_access: {
        securities_access_status: "UNKNOWN",
        securities_access_verified: false,
        permitted_product_scope: [],
        registration_type: null,
        effective_from: null,
        effective_to: null,
        jurisdiction_scope: null,
        canAccessSecuritiesContent: false
      }
    };
  }
}

async function createUser(input, authContext, auditMeta = {}) {
  const email = String(input.email || "").trim().toLowerCase();
  const role = normalizeRole(input.role);

  if (!email || !role) {
    const error = new Error("Email and role are required.");
    error.statusCode = 400;
    throw error;
  }

  const existing = await findUserByEmail(email);

  if (existing) {
    const error = new Error("A user with this email already exists.");
    error.statusCode = 409;
    throw error;
  }

  const firstName = String(input.firstName || input.first_name || "").trim();
  const lastName = String(input.lastName || input.last_name || "").trim();
  const status = normalizeStatus(input.status) || USER_STATUSES.PENDING_INVITATION;

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
    status,
    timezone: input.timezone || "America/New_York",
    preferred_language: input.preferredLanguage || input.preferred_language || "en",
    notification_preferences: input.notificationPreferences || input.notification_preferences || {}
  });

  let invitation = null;

  if (status === USER_STATUSES.PENDING_INVITATION) {
    invitation = await createInvitationForUser(user.id, authContext.userId, auditMeta);
  }

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.created",
    targetType: "atlas_user",
    targetId: user.id,
    metadata: { role, status, email },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return {
    user: presentAdminUser(user),
    invitation
  };
}

async function createInvitationForUser(userId, invitedBy, auditMeta = {}) {
  const user = await findUserById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  await supabase.from("atlas_invitation_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: invitedBy || null
  });

  await sendInvitationEmail({
    email: user.email,
    firstName: user.first_name,
    token: rawToken,
    expiresAt
  }).catch((emailError) => {
    console.error("[invitation-email]", emailError.message);
  });

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: invitedBy,
    action: "user.invitation_sent",
    targetType: "atlas_user",
    targetId: userId,
    metadata: { email: user.email, expiresAt },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return { expiresAt, delivered: true };
}

async function updateUser(userId, input, authContext, auditMeta = {}) {
  const existing = await getUserById(userId, authContext);
  const patch = {
    updated_at: new Date().toISOString()
  };

  if (input.firstName !== undefined || input.first_name !== undefined) {
    patch.first_name = String(input.firstName || input.first_name || "").trim();
  }

  if (input.lastName !== undefined || input.last_name !== undefined) {
    patch.last_name = String(input.lastName || input.last_name || "").trim();
  }

  if (patch.first_name !== undefined || patch.last_name !== undefined) {
    patch.display_name = buildDisplayName(
      patch.first_name ?? existing.first_name,
      patch.last_name ?? existing.last_name,
      existing.email
    );
  }

  if (input.phone !== undefined) {
    patch.phone = input.phone || null;
  }

  if (input.divisionId !== undefined || input.division_id !== undefined) {
    patch.division_id = input.divisionId || input.division_id || null;
  }

  if (input.reportsToUserId !== undefined || input.reports_to_user_id !== undefined) {
    patch.reports_to_user_id = input.reportsToUserId || input.reports_to_user_id || null;
  }

  if (input.timezone !== undefined) {
    patch.timezone = input.timezone;
  }

  if (input.preferredLanguage !== undefined || input.preferred_language !== undefined) {
    patch.preferred_language = input.preferredLanguage || input.preferred_language;
  }

  if (input.notificationPreferences !== undefined || input.notification_preferences !== undefined) {
    patch.notification_preferences =
      input.notificationPreferences || input.notification_preferences || {};
  }

  if (input.repId !== undefined || input.rep_id !== undefined) {
    const rawRepId = input.repId ?? input.rep_id;
    patch.rep_id = rawRepId === "" || rawRepId === null ? null : rawRepId;
  }

  const previousRole = existing.role;

  if (input.role !== undefined) {
    const role = normalizeRole(input.role);

    if (!role) {
      const error = new Error("Invalid role.");
      error.statusCode = 400;
      throw error;
    }

    patch.role = role;
  }

  const data = await identityWriteService.updateUser(userId, patch);

  if (patch.role && patch.role !== previousRole) {
    await writeAuditLog({
      organizationId: data.organization_id,
      userId: authContext.userId,
      userEmail: authContext.email,
      action: "user.role_changed",
      targetType: "atlas_user",
      targetId: userId,
      metadata: { previousRole, newRole: patch.role },
      ipAddress: auditMeta.ipAddress,
      userAgent: auditMeta.userAgent
    });
  }

  await writeAuditLog({
    organizationId: data.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.updated",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return presentAdminUser(data);
}

async function setUserStatus(userId, status, authContext, auditMeta = {}) {
  const user = await getUserById(userId, authContext);
  const normalizedStatus = normalizeStatus(status);

  if (!normalizedStatus) {
    const error = new Error("Invalid status.");
    error.statusCode = 400;
    throw error;
  }

  const patch = {
    status: normalizedStatus,
    updated_at: new Date().toISOString()
  };

  if (normalizedStatus === USER_STATUSES.ARCHIVED) {
    patch.archived_at = new Date().toISOString();
    await revokeAllSessionsForUser(userId);
  }

  if (normalizedStatus === USER_STATUSES.ACTIVE) {
    patch.archived_at = null;
  }

  const data = await identityWriteService.updateUser(userId, patch);

  const actionMap = {
    [USER_STATUSES.SUSPENDED]: "user.suspended",
    [USER_STATUSES.ACTIVE]: "user.reactivated",
    [USER_STATUSES.ARCHIVED]: "user.archived"
  };

  await writeAuditLog({
    organizationId: data.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: actionMap[normalizedStatus] || "user.status_changed",
    targetType: "atlas_user",
    targetId: userId,
    metadata: { previousStatus: user.status, newStatus: normalizedStatus },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return presentAdminUser(data);
}

async function forcePasswordReset(userId, authContext, auditMeta = {}) {
  const user = await findUserById(userId);
  const organizationId = await resolveWorkspaceOrganizationId(authContext);

  if (!user || String(user.organization_id) !== String(organizationId)) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  await requestPasswordReset(user.email, auditMeta);

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.password_reset_forced",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return { success: true };
}

async function forceLogout(userId, authContext, auditMeta = {}) {
  const user = await getUserById(userId, authContext);
  await revokeAllSessionsForUser(userId);

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.session_revoked",
    targetType: "atlas_user",
    targetId: userId,
    metadata: { scope: "all_devices" },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return { success: true };
}

async function transferOwnership({ fromUserId, toUserId }, authContext, auditMeta = {}) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    const error = new Error("Valid fromUserId and toUserId are required.");
    error.statusCode = 400;
    throw error;
  }

  await getUserById(fromUserId, authContext);
  await getUserById(toUserId, authContext);

  const orgId = await resolveWorkspaceOrganizationId(authContext);

  const { data: legacyProspects, error: legacyError } = await supabase
    .from("prospects")
    .update({
      owner_user_id: toUserId,
      created_by_user_id: toUserId
    })
    .eq("organization_id", orgId)
    .eq("owner_user_id", fromUserId)
    .select("phone");

  if (legacyError) {
    throw legacyError;
  }

  const { data: coreProspects, error: coreError } = await supabase
    .from("atlas_core_prospects")
    .update({
      owner_user_id: toUserId,
      assigned_agent_id: toUserId
    })
    .eq("organization_id", orgId)
    .or(`owner_user_id.eq.${fromUserId},assigned_agent_id.eq.${fromUserId}`)
    .select("id");

  if (coreError) {
    throw coreError;
  }

  await writeAuditLog({
    organizationId: orgId,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "user.ownership_transferred",
    targetType: "atlas_user",
    targetId: fromUserId,
    metadata: {
      fromUserId,
      toUserId,
      legacyProspects: (legacyProspects || []).length,
      coreProspects: (coreProspects || []).length
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return {
    legacyProspectsTransferred: (legacyProspects || []).length,
    coreProspectsTransferred: (coreProspects || []).length
  };
}

async function getUserLoginHistory(userId, authContext, query = {}) {
  await getUserById(userId, authContext);

  const limit = Math.min(Number(query.limit) || 50, 200);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const { data: history, error: historyError, count } = await supabase
    .from("atlas_login_history")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (historyError) {
    throw historyError;
  }

  const { data: auditRows, error: auditError } = await supabase
    .from("atlas_audit_log")
    .select("*")
    .eq("target_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (auditError) {
    throw auditError;
  }

  return {
    loginHistory: history || [],
    auditEvents: auditRows || [],
    total: count ?? (history || []).length,
    limit,
    offset
  };
}

async function resendInvitation(userId, authContext, auditMeta = {}) {
  const user = await getUserById(userId, authContext);

  if (user.status !== USER_STATUSES.PENDING_INVITATION) {
    const error = new Error("User is not pending invitation.");
    error.statusCode = 400;
    throw error;
  }

  const invitation = await createInvitationForUser(userId, authContext.userId, auditMeta);
  return { success: true, invitation };
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  setUserStatus,
  forcePasswordReset,
  forceLogout,
  transferOwnership,
  getUserLoginHistory,
  resendInvitation,
  presentAdminUser
};
