/**
 * BR-074 — Canonical firm-verified securities access authority.
 * Content access and verification authority are independent capabilities.
 */

const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");
const { findUserById } = require("../services/atlasUserService");
const { writeAuditLog, auditFromRequest } = require("./auditLogService");
const { hasExplicitUserPermission } = require("./explicitUserPermissionService");
const repository = require("./securitiesAccessRepository");
const {
  SECURITIES_ACCESS_STATUS,
  SECURITIES_VERIFY_PERMISSION,
  VERIFICATION_SOURCE,
  SECURITIES_CHANGE_ACTIONS,
  SECURITIES_AUDIT_ACTIONS,
  isCanonicalSecuritiesAccessStatus
} = require("./securitiesAccessConstants");

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null || value === "") {
    return [];
  }
  return [value];
}

function scopeIncludes(authorizedScopes, requestedScope) {
  if (requestedScope == null || requestedScope === "") {
    return true;
  }

  const authorized = asArray(authorizedScopes).map((item) => String(item).toUpperCase());
  if (authorized.length === 0) {
    return false;
  }

  return authorized.includes(String(requestedScope).toUpperCase());
}

function hasCompleteVerificationMetadata(row) {
  if (!row || !row.verification_source || !row.verified_at) {
    return false;
  }

  // One-time org bootstrap records the technical operator on the bootstrap lock,
  // not as a peer verifier (there is none yet). Normal MANUAL verification still
  // requires verified_by.
  if (row.verification_source === VERIFICATION_SOURCE.INITIAL_FIRM_AUTHORITY_BOOTSTRAP) {
    return true;
  }

  return Boolean(row.verified_by);
}

function isWithinEffectiveWindow(row, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);

  if (row.effective_from && Date.parse(row.effective_from) > nowMs) {
    return false;
  }

  if (row.effective_to && Date.parse(row.effective_to) < nowMs) {
    return false;
  }

  return true;
}

/**
 * Runtime authority for named securities content.
 * Always loads current DB authorization — never trusts session cache alone.
 */
async function canAccessSecuritiesContent(userContext, options = {}) {
  const {
    now = new Date(),
    requiredProductScope = null,
    requiredPrincipalScope = null,
    findAuthorization = repository.findAuthorization,
    organizationId: explicitOrgId = null,
    userId: explicitUserId = null
  } = options;

  const userId = explicitUserId || userContext?.userId || userContext?.id;
  const organizationId =
    explicitOrgId ||
    userContext?.organizationId ||
    userContext?.organization_id ||
    null;

  if (!userId || !organizationId) {
    return false;
  }

  const row = await findAuthorization(organizationId, userId);

  if (!row || row.deleted_at) {
    return false;
  }

  if (row.securities_access_status !== SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE) {
    return false;
  }

  if (!hasCompleteVerificationMetadata(row)) {
    return false;
  }

  if (!isWithinEffectiveWindow(row, now)) {
    return false;
  }

  if (requiredProductScope && !scopeIncludes(row.permitted_product_scope, requiredProductScope)) {
    return false;
  }

  if (requiredPrincipalScope && !scopeIncludes(row.principal_scope, requiredPrincipalScope)) {
    return false;
  }

  return true;
}

async function canVerifySecuritiesAuthorization(actorContext, options = {}) {
  const {
    now = new Date(),
    hasExplicitPermission = hasExplicitUserPermission
  } = options;

  const userId = actorContext?.userId || actorContext?.id;
  const organizationId =
    actorContext?.organizationId ||
    actorContext?.organization_id ||
    (actorContext ? await resolveWorkspaceOrganizationId(actorContext) : null);

  if (!userId || !organizationId) {
    return false;
  }

  return hasExplicitPermission({
    organizationId,
    userId,
    permissionCode: SECURITIES_VERIFY_PERMISSION,
    now
  });
}

function buildUnknownSummary() {
  return {
    securities_access_status: SECURITIES_ACCESS_STATUS.UNKNOWN,
    securities_access_verified: false,
    permitted_product_scope: [],
    registration_type: null,
    effective_from: null,
    effective_to: null,
    jurisdiction_scope: null,
    canAccessSecuritiesContent: false
  };
}

function sanitizeAuthorizationSummary(row, canAccess) {
  if (!row) {
    return buildUnknownSummary();
  }

  return {
    securities_access_status: row.securities_access_status || SECURITIES_ACCESS_STATUS.UNKNOWN,
    securities_access_verified: canAccess === true,
    permitted_product_scope: asArray(row.permitted_product_scope),
    registration_type: row.registration_type || null,
    effective_from: row.effective_from || null,
    effective_to: row.effective_to || null,
    jurisdiction_scope: row.jurisdiction_scope ?? null,
    canAccessSecuritiesContent: canAccess === true
  };
}

async function getSecuritiesAccessSummary(userContext, options = {}) {
  const userId = options.userId || userContext?.userId || userContext?.id;
  const organizationId =
    options.organizationId ||
    userContext?.organizationId ||
    userContext?.organization_id;

  if (!userId || !organizationId) {
    return buildUnknownSummary();
  }

  const row = await (options.findAuthorization || repository.findAuthorization)(
    organizationId,
    userId
  );

  const canAccess = await canAccessSecuritiesContent(userContext, {
    ...options,
    userId,
    organizationId,
    findAuthorization: async () => row
  });

  return sanitizeAuthorizationSummary(row, canAccess);
}

async function getAdminSecuritiesSummary(organizationId, userId, options = {}) {
  return getSecuritiesAccessSummary(
    { userId, organizationId },
    { ...options, userId, organizationId }
  );
}

async function attachSecuritiesSummaries(organizationId, users = []) {
  const ids = users.map((user) => user.id).filter(Boolean);
  const rows = await repository.listAuthorizationsForUsers(organizationId, ids);
  const byUser = new Map(rows.map((row) => [String(row.user_id), row]));

  const results = [];
  for (const user of users) {
    const row = byUser.get(String(user.id)) || null;
    const canAccess = await canAccessSecuritiesContent(
      { userId: user.id, organizationId },
      { findAuthorization: async () => row }
    );
    results.push({
      ...user,
      securities_access: sanitizeAuthorizationSummary(row, canAccess)
    });
  }
  return results;
}

function resolveChangeAction(previousStatus, nextStatus, explicitAction) {
  if (explicitAction) {
    return explicitAction;
  }
  if (!previousStatus) {
    return SECURITIES_CHANGE_ACTIONS.CREATED;
  }
  if (nextStatus === SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE) {
    return SECURITIES_CHANGE_ACTIONS.VERIFIED;
  }
  if (nextStatus === SECURITIES_ACCESS_STATUS.RESTRICTED) {
    return SECURITIES_CHANGE_ACTIONS.RESTRICTED;
  }
  if (nextStatus === SECURITIES_ACCESS_STATUS.SUSPENDED) {
    return SECURITIES_CHANGE_ACTIONS.SUSPENDED;
  }
  if (nextStatus === SECURITIES_ACCESS_STATUS.EXPIRED) {
    return SECURITIES_CHANGE_ACTIONS.EXPIRED;
  }
  if (nextStatus === SECURITIES_ACCESS_STATUS.TERMINATED) {
    return SECURITIES_CHANGE_ACTIONS.TERMINATED;
  }
  if (nextStatus === SECURITIES_ACCESS_STATUS.PENDING_VERIFICATION) {
    return SECURITIES_CHANGE_ACTIONS.PENDING;
  }
  return SECURITIES_CHANGE_ACTIONS.UPDATED;
}

function auditActionForChange(changeAction) {
  switch (changeAction) {
    case SECURITIES_CHANGE_ACTIONS.CREATED:
      return SECURITIES_AUDIT_ACTIONS.CREATED;
    case SECURITIES_CHANGE_ACTIONS.VERIFIED:
      return SECURITIES_AUDIT_ACTIONS.VERIFIED;
    case SECURITIES_CHANGE_ACTIONS.REVOKED:
      return SECURITIES_AUDIT_ACTIONS.REVOKED;
    case SECURITIES_CHANGE_ACTIONS.EXPIRED:
      return SECURITIES_AUDIT_ACTIONS.EXPIRED;
    default:
      return SECURITIES_AUDIT_ACTIONS.UPDATED;
  }
}

function sanitizeReason(reason) {
  if (!reason) {
    return null;
  }
  const text = String(reason).trim().slice(0, 120);
  return text || null;
}

function buildSnapshot(row) {
  if (!row) {
    return {};
  }

  return {
    id: row.id,
    securities_access_status: row.securities_access_status,
    registration_type: row.registration_type,
    permitted_product_scope: row.permitted_product_scope,
    verification_source: row.verification_source,
    verified_by: row.verified_by,
    verified_at: row.verified_at,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    jurisdiction_scope: row.jurisdiction_scope,
    principal_scope: row.principal_scope,
    last_reviewed_at: row.last_reviewed_at
  };
}

async function assertCanMutateAuthorization(actorContext, targetUserId) {
  const actorId = actorContext?.userId || actorContext?.id;

  // BR-074 — self-verification prohibition is evaluated before any DB lookup.
  if (!actorId || String(actorId) === String(targetUserId)) {
    const error = new Error("Representatives cannot verify or modify their own securities authorization.");
    error.statusCode = 403;
    error.publicCode = "SELF_VERIFICATION_FORBIDDEN";
    throw error;
  }

  const organizationId = await resolveWorkspaceOrganizationId(actorContext);

  const allowed = await canVerifySecuritiesAuthorization(actorContext);
  if (!allowed) {
    const error = new Error("Explicit securities:verify permission is required.");
    error.statusCode = 403;
    error.publicCode = "SECURITIES_VERIFY_FORBIDDEN";
    throw error;
  }

  const target = await findUserById(targetUserId);
  if (!target || String(target.organization_id) !== String(organizationId)) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    error.publicCode = "USER_NOT_FOUND";
    throw error;
  }

  return { organizationId, actorId, target };
}

/**
 * Create or update current securities authorization for another user.
 */
async function upsertSecuritiesAuthorization(targetUserId, input = {}, actorContext, auditMeta = {}) {
  const { organizationId, actorId } = await assertCanMutateAuthorization(actorContext, targetUserId);
  const now = new Date();
  const nextStatus = String(input.securities_access_status || "").trim().toUpperCase();

  if (!isCanonicalSecuritiesAccessStatus(nextStatus)) {
    const error = new Error("Invalid securities_access_status.");
    error.statusCode = 400;
    error.publicCode = "INVALID_STATUS";
    throw error;
  }

  const previous = await repository.findAuthorization(organizationId, targetUserId);
  const isVerify = nextStatus === SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE;

  let verificationSource = input.verification_source || previous?.verification_source || null;
  let verifiedBy = previous?.verified_by || null;
  let verifiedAt = previous?.verified_at || null;

  if (isVerify) {
    verificationSource = VERIFICATION_SOURCE.MANUAL_FIRM_VERIFICATION;
    verifiedBy = actorId;
    verifiedAt = now.toISOString();
  }

  if (isVerify && (!verificationSource || !verifiedBy || !verifiedAt)) {
    const error = new Error("VERIFIED_ACTIVE requires complete verification metadata.");
    error.statusCode = 400;
    error.publicCode = "INCOMPLETE_VERIFICATION";
    throw error;
  }

  const effectiveFrom =
    input.effective_from !== undefined
      ? input.effective_from
      : previous?.effective_from || (isVerify ? now.toISOString() : null);
  const effectiveTo =
    input.effective_to !== undefined ? input.effective_to : previous?.effective_to || null;

  if (effectiveFrom && effectiveTo && Date.parse(effectiveTo) < Date.parse(effectiveFrom)) {
    const error = new Error("effective_to must be on or after effective_from.");
    error.statusCode = 400;
    error.publicCode = "INVALID_EFFECTIVE_DATES";
    throw error;
  }

  const payload = {
    organization_id: organizationId,
    user_id: targetUserId,
    securities_access_status: nextStatus,
    registration_type:
      input.registration_type !== undefined
        ? input.registration_type
        : previous?.registration_type || null,
    permitted_product_scope:
      input.permitted_product_scope !== undefined
        ? asArray(input.permitted_product_scope)
        : asArray(previous?.permitted_product_scope),
    verification_source: verificationSource,
    verified_by: verifiedBy,
    verified_at: verifiedAt,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    jurisdiction_scope:
      input.jurisdiction_scope !== undefined
        ? input.jurisdiction_scope
        : previous?.jurisdiction_scope ?? null,
    principal_scope:
      input.principal_scope !== undefined
        ? asArray(input.principal_scope)
        : asArray(previous?.principal_scope),
    supervisory_restrictions:
      input.supervisory_restrictions !== undefined
        ? asArray(input.supervisory_restrictions)
        : asArray(previous?.supervisory_restrictions),
    status_reason:
      input.status_reason !== undefined ? input.status_reason : previous?.status_reason || null,
    last_reviewed_at:
      input.record_review === true ? now.toISOString() : previous?.last_reviewed_at || null,
    updated_at: now.toISOString(),
    deleted_at: null
  };

  if (previous?.id) {
    payload.id = previous.id;
    payload.created_at = previous.created_at;
  } else {
    payload.created_at = now.toISOString();
  }

  const saved = await repository.upsertAuthorization(payload);
  const changeAction = resolveChangeAction(
    previous?.securities_access_status,
    nextStatus,
    input.change_action
  );

  await repository.appendHistory({
    organization_id: organizationId,
    user_id: targetUserId,
    authorization_id: saved.id,
    change_action: changeAction,
    previous_status: previous?.securities_access_status || null,
    new_status: nextStatus,
    snapshot: buildSnapshot(saved),
    verification_source: saved.verification_source,
    verified_by: saved.verified_by,
    verified_at: saved.verified_at,
    effective_from: saved.effective_from,
    effective_to: saved.effective_to,
    permitted_product_scope: saved.permitted_product_scope,
    principal_scope: saved.principal_scope,
    jurisdiction_scope: saved.jurisdiction_scope,
    changed_by: actorId,
    changed_at: now.toISOString(),
    reason_sanitized: sanitizeReason(input.status_reason || input.reason)
  });

  await writeAuditLog({
    organizationId,
    userId: actorId,
    userEmail: actorContext.email || null,
    action: auditActionForChange(changeAction),
    targetType: "securities_authorization",
    targetId: saved.id,
    result: "success",
    metadata: {
      targetUserId,
      previousStatus: previous?.securities_access_status || null,
      newStatus: nextStatus,
      changeAction,
      effectiveFrom: saved.effective_from,
      effectiveTo: saved.effective_to,
      verificationSource: saved.verification_source || null
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  const canAccess = await canAccessSecuritiesContent(
    { userId: targetUserId, organizationId },
    { findAuthorization: async () => saved }
  );

  return sanitizeAuthorizationSummary(saved, canAccess);
}

async function revokeSecuritiesAuthorization(targetUserId, actorContext, auditMeta = {}, reason = null) {
  return upsertSecuritiesAuthorization(
    targetUserId,
    {
      securities_access_status: SECURITIES_ACCESS_STATUS.TERMINATED,
      change_action: SECURITIES_CHANGE_ACTIONS.REVOKED,
      reason,
      status_reason: reason || "revoked"
    },
    actorContext,
    auditMeta
  );
}

const deniedAccessRecent = new Map();
const DENIED_AUDIT_COOLDOWN_MS = 60 * 1000;

async function recordContentAccessDenied(req, extra = {}) {
  const userId = req.authContext?.userId;
  const organizationId = req.authContext?.organizationId;
  const key = `${organizationId}:${userId}:${extra.resource || "probe"}`;
  const now = Date.now();
  const last = deniedAccessRecent.get(key) || 0;

  if (now - last < DENIED_AUDIT_COOLDOWN_MS) {
    return;
  }

  deniedAccessRecent.set(key, now);

  await auditFromRequest(req, {
    action: SECURITIES_AUDIT_ACTIONS.CONTENT_ACCESS_DENIED,
    targetType: "securities_content",
    targetId: extra.resource || "probe",
    result: "denied",
    metadata: {
      resource: extra.resource || "probe",
      status: extra.status || SECURITIES_ACCESS_STATUS.UNKNOWN
    }
  });
}

module.exports = {
  canAccessSecuritiesContent,
  canVerifySecuritiesAuthorization,
  getSecuritiesAccessSummary,
  getAdminSecuritiesSummary,
  attachSecuritiesSummaries,
  upsertSecuritiesAuthorization,
  revokeSecuritiesAuthorization,
  recordContentAccessDenied,
  sanitizeAuthorizationSummary,
  buildUnknownSummary,
  hasCompleteVerificationMetadata,
  isWithinEffectiveWindow,
  SECURITIES_ACCESS_STATUS,
  SECURITIES_VERIFY_PERMISSION,
  VERIFICATION_SOURCE
};
