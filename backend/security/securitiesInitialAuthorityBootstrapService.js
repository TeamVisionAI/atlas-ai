/**
 * BR-074 — Controlled one-time initial securities authority bootstrap.
 *
 * Distinguishes:
 * 1) Granting securities:verify (authority to verify others)
 * 2) Establishing the first VERIFIED_ACTIVE authorization for that authority
 *
 * This is NOT a normal application route. Self-verification remains forbidden
 * on Admin Users / HTTP APIs. Bootstrap may establish the first authority only
 * when the organization has no verifier and no prior authorization for the target.
 */

const {
  SECURITIES_VERIFY_PERMISSION,
  VERIFICATION_SOURCE,
  BOOTSTRAP_EVIDENCE_SOURCE,
  ALL_BOOTSTRAP_EVIDENCE_SOURCES,
  SECURITIES_ACCESS_STATUS,
  SECURITIES_CHANGE_ACTIONS,
  SECURITIES_AUDIT_ACTIONS
} = require("./securitiesAccessConstants");

function httpLikeError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value == null || value === "") {
    return [];
  }
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sanitizeReason(reason) {
  const text = String(reason || "").trim().slice(0, 200);
  return text || null;
}

function sanitizeEvidenceReference(value) {
  const text = String(value || "").trim().slice(0, 120);
  return text || null;
}

function requireIsoDate(value, fieldName) {
  if (!value) {
    throw httpLikeError(`${fieldName} is required.`, "BOOTSTRAP_EVIDENCE_INCOMPLETE");
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw httpLikeError(`${fieldName} must be a valid ISO date.`, "BOOTSTRAP_INVALID_DATE");
  }
  return new Date(ms).toISOString();
}

/**
 * Validate bootstrap input without side effects.
 */
function validateBootstrapInput(input = {}) {
  const organizationId = String(input.organizationId || "").trim();
  const targetUserId = String(input.targetUserId || "").trim();
  const technicalActor = String(input.technicalActor || "").trim();
  const reason = sanitizeReason(input.reason);
  const evidenceSource = String(input.evidenceSource || "").trim().toUpperCase();
  const evidenceReference = sanitizeEvidenceReference(input.evidenceReference);
  const verificationSource =
    String(input.verificationSource || VERIFICATION_SOURCE.INITIAL_FIRM_AUTHORITY_BOOTSTRAP)
      .trim()
      .toUpperCase();
  const permittedProductScope = asArray(input.permittedProductScope);
  const jurisdictionScope = asArray(input.jurisdictionScope);
  const principalScope = asArray(input.principalScope);

  if (!organizationId || !targetUserId) {
    throw httpLikeError(
      "organizationId and targetUserId are required.",
      "BOOTSTRAP_IDS_REQUIRED"
    );
  }

  if (!technicalActor) {
    throw httpLikeError("technicalActor is required.", "BOOTSTRAP_ACTOR_REQUIRED");
  }

  if (!reason) {
    throw httpLikeError("reason is required.", "BOOTSTRAP_REASON_REQUIRED");
  }

  if (verificationSource !== VERIFICATION_SOURCE.INITIAL_FIRM_AUTHORITY_BOOTSTRAP) {
    throw httpLikeError(
      "verificationSource must be INITIAL_FIRM_AUTHORITY_BOOTSTRAP.",
      "BOOTSTRAP_INVALID_SOURCE"
    );
  }

  if (!ALL_BOOTSTRAP_EVIDENCE_SOURCES.includes(evidenceSource)) {
    throw httpLikeError(
      `evidenceSource must be one of: ${ALL_BOOTSTRAP_EVIDENCE_SOURCES.join(", ")}.`,
      "BOOTSTRAP_EVIDENCE_INCOMPLETE"
    );
  }

  if (!evidenceReference) {
    throw httpLikeError(
      "evidenceReference is required (short sanitized firm-internal label only).",
      "BOOTSTRAP_EVIDENCE_INCOMPLETE"
    );
  }

  const evidenceVerifiedAt = requireIsoDate(input.evidenceVerifiedAt, "evidenceVerifiedAt");
  const effectiveFrom = requireIsoDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = input.effectiveTo
    ? requireIsoDate(input.effectiveTo, "effectiveTo")
    : null;

  if (effectiveTo && Date.parse(effectiveTo) < Date.parse(effectiveFrom)) {
    throw httpLikeError(
      "effectiveTo must be on or after effectiveFrom.",
      "BOOTSTRAP_INVALID_DATES"
    );
  }

  if (permittedProductScope.length === 0) {
    throw httpLikeError(
      "permittedProductScope is required.",
      "BOOTSTRAP_SCOPE_REQUIRED"
    );
  }

  return {
    organizationId,
    targetUserId,
    technicalActor,
    reason,
    verificationSource,
    evidenceSource,
    evidenceReference,
    evidenceVerifiedAt,
    effectiveFrom,
    effectiveTo,
    permittedProductScope,
    jurisdictionScope: jurisdictionScope.length ? jurisdictionScope : null,
    principalScope,
    registrationType: input.registrationType ? String(input.registrationType).trim() : null,
    dryRun: input.dryRun === true
  };
}

function createDefaultDeps() {
  const { supabase } = require("../services/supabaseService");
  const repository = require("./securitiesAccessRepository");
  const { writeAuditLog } = require("./auditLogService");

  return {
    findOrganization: async (organizationId) => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    findUser: async (userId) => {
      const { data, error } = await supabase
        .from("atlas_users")
        .select("id, organization_id, email, role, status")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    findBootstrapLock: async (organizationId) => {
      const { data, error } = await supabase
        .from("atlas_organization_securities_authority_bootstrap")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) {
        if (error.code === "42P01") return null;
        throw error;
      }
      return data;
    },
    listOrgUserIds: async (organizationId) => {
      const { data, error } = await supabase
        .from("atlas_users")
        .select("id")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data || []).map((row) => row.id);
    },
    listActiveVerifyGrants: async (userIds, now = new Date()) => {
      if (!userIds.length) return [];
      const { data, error } = await supabase
        .from("user_permissions")
        .select("user_id, permission_code, granted, expires_at")
        .eq("permission_code", SECURITIES_VERIFY_PERMISSION)
        .eq("granted", true)
        .in("user_id", userIds);
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      const nowMs = now.getTime();
      return (data || []).filter(
        (row) => !row.expires_at || Date.parse(row.expires_at) >= nowMs
      );
    },
    findAuthorization: repository.findAuthorization,
    grantVerifyPermission: async ({ userId, technicalActor, reason }) => {
      const { data, error } = await supabase
        .from("user_permissions")
        .upsert(
          {
            user_id: userId,
            permission_code: SECURITIES_VERIFY_PERMISSION,
            granted: true,
            granted_by: null,
            reason: reason,
            expires_at: null
          },
          { onConflict: "user_id,permission_code" }
        )
        .select("*")
        .single();
      if (error) throw error;
      return { ...data, technicalActor };
    },
    upsertAuthorization: repository.upsertAuthorization,
    appendHistory: repository.appendHistory,
    insertBootstrapLock: async (row) => {
      const { data, error } = await supabase
        .from("atlas_organization_securities_authority_bootstrap")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    writeAuditLog,
    now: () => new Date()
  };
}

/**
 * Execute (or dry-run) the one-time initial authority bootstrap.
 */
async function bootstrapInitialSecuritiesAuthority(rawInput = {}, deps = {}) {
  const resolved = { ...createDefaultDeps(), ...deps };
  const input = validateBootstrapInput(rawInput);
  const now = resolved.now();
  const nowIso = now.toISOString();

  const organization = await resolved.findOrganization(input.organizationId);
  if (!organization) {
    throw httpLikeError("Organization not found.", "BOOTSTRAP_ORG_NOT_FOUND", 404);
  }

  const target = await resolved.findUser(input.targetUserId);
  if (!target) {
    throw httpLikeError("Target user not found.", "BOOTSTRAP_USER_NOT_FOUND", 404);
  }

  if (String(target.organization_id) !== String(input.organizationId)) {
    throw httpLikeError(
      "Target user is not a member of the specified organization.",
      "BOOTSTRAP_CROSS_ORG_FORBIDDEN",
      403
    );
  }

  const existingLock = await resolved.findBootstrapLock(input.organizationId);
  if (existingLock) {
    throw httpLikeError(
      "Initial securities authority bootstrap already completed for this organization.",
      "BOOTSTRAP_ALREADY_COMPLETED",
      409
    );
  }

  const orgUserIds = await resolved.listOrgUserIds(input.organizationId);
  const activeVerifiers = await resolved.listActiveVerifyGrants(orgUserIds, now);
  if (activeVerifiers.length > 0) {
    throw httpLikeError(
      "An active securities:verify grant already exists in this organization.",
      "BOOTSTRAP_VERIFIER_EXISTS",
      409
    );
  }

  const existingAuth = await resolved.findAuthorization(
    input.organizationId,
    input.targetUserId
  );
  if (existingAuth && !existingAuth.deleted_at) {
    throw httpLikeError(
      "Target user already has a securities authorization row.",
      "BOOTSTRAP_AUTHORIZATION_EXISTS",
      409
    );
  }

  const plan = {
    ok: true,
    dryRun: input.dryRun,
    organizationId: input.organizationId,
    targetUserId: input.targetUserId,
    verificationSource: input.verificationSource,
    evidenceSource: input.evidenceSource,
    evidenceReference: input.evidenceReference,
    evidenceVerifiedAt: input.evidenceVerifiedAt,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    permittedProductScope: input.permittedProductScope,
    jurisdictionScope: input.jurisdictionScope,
    principalScope: input.principalScope,
    technicalActor: input.technicalActor,
    reason: input.reason,
    actions: [
      "grant_user_permission_securities_verify",
      "create_verified_active_authorization",
      "append_authorization_history",
      "write_audit_events",
      "insert_organization_bootstrap_lock"
    ],
    notes: [
      "Does not modify role_permissions.",
      "Does not create SUPER_ADMIN bypass.",
      "Normal self-verification remains forbidden on application routes.",
      "Exam completion alone is not sufficient evidence."
    ]
  };

  if (input.dryRun) {
    return { ...plan, written: false };
  }

  await resolved.grantVerifyPermission({
    userId: input.targetUserId,
    technicalActor: input.technicalActor,
    reason: `BR-074 initial authority bootstrap: ${input.reason}`
  });

  const authorizationPayload = {
    organization_id: input.organizationId,
    user_id: input.targetUserId,
    securities_access_status: SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE,
    registration_type: input.registrationType,
    permitted_product_scope: input.permittedProductScope,
    verification_source: VERIFICATION_SOURCE.INITIAL_FIRM_AUTHORITY_BOOTSTRAP,
    // No peer verifier exists yet; technical operator is recorded on the bootstrap lock.
    verified_by: null,
    verified_at: nowIso,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo,
    jurisdiction_scope: input.jurisdictionScope,
    principal_scope: input.principalScope,
    supervisory_restrictions: [],
    status_reason: input.reason,
    last_reviewed_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null
  };

  const saved = await resolved.upsertAuthorization(authorizationPayload);

  await resolved.appendHistory({
    organization_id: input.organizationId,
    user_id: input.targetUserId,
    authorization_id: saved.id,
    change_action: SECURITIES_CHANGE_ACTIONS.VERIFIED,
    previous_status: null,
    new_status: SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE,
    snapshot: {
      id: saved.id,
      securities_access_status: saved.securities_access_status,
      verification_source: saved.verification_source,
      permitted_product_scope: saved.permitted_product_scope,
      effective_from: saved.effective_from,
      effective_to: saved.effective_to,
      bootstrap: true
    },
    verification_source: saved.verification_source,
    verified_by: saved.verified_by,
    verified_at: saved.verified_at,
    effective_from: saved.effective_from,
    effective_to: saved.effective_to,
    permitted_product_scope: saved.permitted_product_scope,
    principal_scope: saved.principal_scope,
    jurisdiction_scope: saved.jurisdiction_scope,
    changed_by: null,
    changed_at: nowIso,
    reason_sanitized: input.reason
  });

  await resolved.writeAuditLog({
    organizationId: input.organizationId,
    userId: input.targetUserId,
    userEmail: target.email || null,
    action: SECURITIES_AUDIT_ACTIONS.VERIFY_GRANT,
    targetType: "user_permission",
    targetId: input.targetUserId,
    result: "success",
    metadata: {
      permissionCode: SECURITIES_VERIFY_PERMISSION,
      technicalActor: input.technicalActor,
      bootstrap: true
    }
  });

  await resolved.writeAuditLog({
    organizationId: input.organizationId,
    userId: input.targetUserId,
    userEmail: target.email || null,
    action: SECURITIES_AUDIT_ACTIONS.BOOTSTRAP,
    targetType: "securities_authorization",
    targetId: saved.id,
    result: "success",
    metadata: {
      technicalActor: input.technicalActor,
      verificationSource: input.verificationSource,
      evidenceSource: input.evidenceSource,
      evidenceReference: input.evidenceReference,
      evidenceVerifiedAt: input.evidenceVerifiedAt,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      permittedProductScope: input.permittedProductScope,
      reason: input.reason
    }
  });

  await resolved.writeAuditLog({
    organizationId: input.organizationId,
    userId: input.targetUserId,
    userEmail: target.email || null,
    action: SECURITIES_AUDIT_ACTIONS.VERIFIED,
    targetType: "securities_authorization",
    targetId: saved.id,
    result: "success",
    metadata: {
      technicalActor: input.technicalActor,
      bootstrap: true,
      newStatus: SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE
    }
  });

  const lock = await resolved.insertBootstrapLock({
    organization_id: input.organizationId,
    target_user_id: input.targetUserId,
    completed_at: nowIso,
    technical_actor: input.technicalActor,
    verification_source: input.verificationSource,
    evidence_source: input.evidenceSource,
    evidence_reference: input.evidenceReference,
    evidence_verified_at: input.evidenceVerifiedAt,
    authorization_id: saved.id,
    reason_sanitized: input.reason,
    metadata: {
      permittedProductScope: input.permittedProductScope,
      jurisdictionScope: input.jurisdictionScope,
      principalScope: input.principalScope
    },
    created_at: nowIso
  });

  return {
    ...plan,
    written: true,
    authorizationId: saved.id,
    bootstrapLockCompletedAt: lock.completed_at,
    securities_access_status: SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE,
    securities_verify_granted: true
  };
}

module.exports = {
  validateBootstrapInput,
  bootstrapInitialSecuritiesAuthority,
  BOOTSTRAP_EVIDENCE_SOURCE,
  VERIFICATION_SOURCE,
  SECURITIES_VERIFY_PERMISSION
};
