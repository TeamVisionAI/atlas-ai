/**
 * BR-147 — Campaign intake code CRUD for Settings / Lead Sources.
 */

const { randomUUID } = require("crypto");
const { hasPermission } = require("../../security/authorizationService");
const { PERMISSIONS } = require("../../security/permissions");
const { normalizeRole } = require("../../security/roles");
const { INTAKE_CODE_STATUS, INTAKE_CODE_PURPOSE } = require("./constants");
const {
  buildIntakeCode,
  buildPrefilledMessage,
  normalizePurpose
} = require("./intakeCodeGenerator");
const {
  createCampaignIntakeCodeRepository
} = require("./campaignIntakeCodeRepository");
const { getWhatsAppConnection } = require("../../repositories/metaWhatsAppConnectionRepository");

const REASON = Object.freeze({
  OK: "OK",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  WHATSAPP_NOT_CONNECTED: "WHATSAPP_NOT_CONNECTED"
});

function isAdministrator(user) {
  return normalizeRole(user?.role) === "administrator";
}

function canManageAllCodes(authContext) {
  return (
    isAdministrator(authContext?.user) ||
    hasPermission(authContext, PERMISSIONS.ORG_WRITE) ||
    hasPermission(authContext, PERMISSIONS.PROSPECT_ASSIGN)
  );
}

function canAccessCodes(authContext) {
  return (
    canManageAllCodes(authContext) ||
    hasPermission(authContext, PERMISSIONS.PROSPECT_WRITE)
  );
}

function createCampaignIntakeCodeManagerService(options = {}) {
  const repository =
    options.repository || createCampaignIntakeCodeRepository(options);

  async function resolveWhatsAppAsset(organizationId, phoneNumberId = null) {
    const connection = await getWhatsAppConnection(organizationId);
    if (!connection || connection.status !== "connected") {
      return { ok: false, reason: REASON.WHATSAPP_NOT_CONNECTED };
    }
    const resolvedPhoneNumberId =
      phoneNumberId || connection.phone_number_id || null;
    if (!resolvedPhoneNumberId) {
      return { ok: false, reason: REASON.VALIDATION, message: "Missing WhatsApp phone_number_id" };
    }
    return {
      ok: true,
      phoneNumberId: resolvedPhoneNumberId,
      displayPhoneNumber: connection.display_phone_number || null
    };
  }

  async function listCodes(authContext) {
    if (!canAccessCodes(authContext)) {
      return { ok: false, reason: REASON.FORBIDDEN, status: 403 };
    }
    const ownerUserId = canManageAllCodes(authContext)
      ? null
      : authContext.user?.id || null;
    const codes = await repository.listByOrganization(authContext.organizationId, {
      ownerUserId
    });
    return {
      ok: true,
      codes: codes.map((row) => ({
        ...row,
        prefilledMessage: buildPrefilledMessage(row.code, row.language)
      })),
      canManageAll: canManageAllCodes(authContext)
    };
  }

  async function createCode(authContext, input = {}) {
    if (!canManageAllCodes(authContext)) {
      return { ok: false, reason: REASON.FORBIDDEN, status: 403 };
    }

    const campaignName = String(input.campaignName || input.campaign_name || "").trim();
    if (!campaignName) {
      return {
        ok: false,
        reason: REASON.VALIDATION,
        message: "campaignName is required"
      };
    }

    const purpose = normalizePurpose(input.purpose);
    const language = input.language ? String(input.language).trim() : null;
    const ownerUserId = input.ownerUserId || input.owner_user_id || authContext.user?.id || null;

    const asset = await resolveWhatsAppAsset(
      authContext.organizationId,
      input.whatsappPhoneNumberId || input.whatsapp_phone_number_id || null
    );
    if (!asset.ok) {
      return { ok: false, reason: asset.reason, status: 400, message: asset.message };
    }

    let code = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = buildIntakeCode({ purpose });
      const existing = await repository.getByCode({
        organizationId: authContext.organizationId,
        whatsappPhoneNumberId: asset.phoneNumberId,
        code: candidate
      });
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return {
        ok: false,
        reason: REASON.VALIDATION,
        message: "Failed to generate unique intake code"
      };
    }

    const record = await repository.createCode({
      id: randomUUID(),
      organization_id: authContext.organizationId,
      owner_user_id: ownerUserId,
      whatsapp_phone_number_id: asset.phoneNumberId,
      code,
      campaign_name: campaignName,
      purpose,
      language,
      status: INTAKE_CODE_STATUS.ACTIVE,
      meta_campaign_id: input.metaCampaignId || null,
      meta_adset_id: input.metaAdsetId || null,
      meta_ad_id: input.metaAdId || null,
      created_by_user_id: authContext.user?.id || null,
      metadata: input.metadata || {}
    });

    const prefilledMessage = buildPrefilledMessage(code, language);
    return {
      ok: true,
      code: record,
      prefilledMessage,
      displayPhoneNumber: asset.displayPhoneNumber
    };
  }

  async function updateStatus(authContext, id, status) {
    if (!canManageAllCodes(authContext)) {
      return { ok: false, reason: REASON.FORBIDDEN, status: 403 };
    }
    const existing = await repository.getById(authContext.organizationId, id);
    if (!existing) {
      return { ok: false, reason: REASON.NOT_FOUND, status: 404 };
    }
    const patch = { status };
    if (status === INTAKE_CODE_STATUS.RETIRED) {
      patch.retired_at = new Date().toISOString();
    }
    const updated = await repository.updateCode(authContext.organizationId, id, patch);
    return {
      ok: true,
      code: {
        ...updated,
        prefilledMessage: buildPrefilledMessage(updated.code, updated.language)
      }
    };
  }

  async function getCode(authContext, id) {
    if (!canAccessCodes(authContext)) {
      return { ok: false, reason: REASON.FORBIDDEN, status: 403 };
    }
    const record = await repository.getById(authContext.organizationId, id);
    if (!record) {
      return { ok: false, reason: REASON.NOT_FOUND, status: 404 };
    }
    if (
      !canManageAllCodes(authContext) &&
      record.ownerUserId !== authContext.user?.id
    ) {
      return { ok: false, reason: REASON.FORBIDDEN, status: 403 };
    }
    return {
      ok: true,
      code: {
        ...record,
        prefilledMessage: buildPrefilledMessage(record.code, record.language)
      }
    };
  }

  return {
    repository,
    listCodes,
    createCode,
    getCode,
    pauseCode: (auth, id) => updateStatus(auth, id, INTAKE_CODE_STATUS.PAUSED),
    reactivateCode: (auth, id) => updateStatus(auth, id, INTAKE_CODE_STATUS.ACTIVE),
    retireCode: (auth, id) => updateStatus(auth, id, INTAKE_CODE_STATUS.RETIRED),
    canManageAllCodes,
    canAccessCodes,
    REASON,
    PURPOSES: INTAKE_CODE_PURPOSE
  };
}

module.exports = {
  createCampaignIntakeCodeManagerService,
  REASON
};
