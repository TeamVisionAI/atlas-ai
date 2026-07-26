/**
 * LC1 — Prospect ownership authorization middleware.
 */

const {
  canAccessProspect,
  hasPermission
} = require("../security/authorizationService");
const { auditFromRequest } = require("../security/auditLogService");
const {
  loadLegacyProspectByPhone,
  loadCoreProspectById
} = require("../security/prospectAccessService");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { PERMISSIONS } = require("../security/permissions");

function requireLegacyProspectAccess(options = {}) {
  const { write = false } = options;

  return async function legacyProspectAccess(req, res, next) {
    try {
      const phone = req.params.phone || req.params.prospectPhone;

      if (!phone) {
        return res.status(400).json({
          error: "PROSPECT_REQUIRED",
          message: "Prospect phone is required."
        });
      }

      const organizationId = getTenantOrganizationId(req);
      const prospect = await loadLegacyProspectByPhone(phone, organizationId);

      if (!prospect) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: "Prospect not found."
        });
      }

      const permission = write ? PERMISSIONS.PROSPECT_WRITE : PERMISSIONS.PROSPECT_READ;

      if (!hasPermission(req.authContext, permission)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "You do not have permission to perform this action."
        });
      }

      if (!canAccessProspect(req.authContext, prospect)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "You do not have access to this prospect."
        });
      }

      req.legacyProspect = prospect;

      if (!write) {
        auditFromRequest(req, {
          action: "prospect.viewed",
          targetType: "legacy_prospect",
          targetId: phone
        }).catch(() => {});
      }

      return next();
    } catch (error) {
      console.error("[requireLegacyProspectAccess]", error.message);
      return res.status(500).json({
        error: "AUTHORIZATION_ERROR",
        message: "Unable to authorize prospect access."
      });
    }
  };
}

function requireCoreProspectAccess(options = {}) {
  const { write = false } = options;

  return async function coreProspectAccess(req, res, next) {
    try {
      const prospectId = req.params.id || req.params.prospectId;

      if (!prospectId) {
        return res.status(400).json({
          error: "PROSPECT_REQUIRED",
          message: "Prospect id is required."
        });
      }

      const organizationId = getTenantOrganizationId(req);
      const prospect = await loadCoreProspectById(prospectId, organizationId);

      if (!prospect) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: "Prospect not found."
        });
      }

      const permission = write ? PERMISSIONS.PROSPECT_WRITE : PERMISSIONS.PROSPECT_READ;

      if (!hasPermission(req.authContext, permission)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "You do not have permission to perform this action."
        });
      }

      if (!canAccessProspect(req.authContext, prospect)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "You do not have access to this prospect."
        });
      }

      req.coreProspect = prospect;

      if (!write) {
        auditFromRequest(req, {
          action: "prospect.viewed",
          targetType: "core_prospect",
          targetId: prospectId
        }).catch(() => {});
      }

      return next();
    } catch (error) {
      console.error("[requireCoreProspectAccess]", error.message);
      return res.status(500).json({
        error: "AUTHORIZATION_ERROR",
        message: "Unable to authorize prospect access."
      });
    }
  };
}

module.exports = {
  requireLegacyProspectAccess,
  requireCoreProspectAccess
};
