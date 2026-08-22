/**
 * Sprint 14.1 / LC1 — Prospect REST controller (API layer).
 */

const {
  ProspectApplicationService,
  actorFromRequest
} = require("../application/ProspectApplicationService");
const {
  canAccessProspect,
  getProspectListScope,
  hasPermission
} = require("../../../security/authorizationService");
const { resolveTenantOrganizationId } = require("../../../services/tenantContextService");
const { auditFromRequest } = require("../../../security/auditLogService");
const {
  sanitizeProspectResponse,
  sanitizeProspectList
} = require("../../../security/piiFilter");
const { PERMISSIONS } = require("../../../security/permissions");
const prospectAccessService = require("../../../security/prospectAccessService");

function createProspectController(service = new ProspectApplicationService()) {
  function handleError(res, error, context) {
    console.error(`[prospects/${context}]`, error.message);

    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "PROSPECT_ERROR",
      message: error.message || "Unexpected prospect error."
    });
  }

  function deny(res, message = "You do not have permission to perform this action.") {
    return res.status(403).json({
      error: "FORBIDDEN",
      message
    });
  }

  function resolveOrganizationId(req) {
    return resolveTenantOrganizationId(req, req.query.organizationId);
  }

  function stripBodyOrganization(input = {}) {
    const body = { ...input };
    delete body.organizationId;
    delete body.organization_id;
    return body;
  }

  function notFound(res) {
    return res.status(404).json({
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    });
  }

  async function authorizeProspectAccess(req, res, prospectId, { write = false } = {}) {
    const permission = write ? PERMISSIONS.PROSPECT_WRITE : PERMISSIONS.PROSPECT_READ;

    if (!hasPermission(req.authContext, permission)) {
      deny(res);
      return null;
    }

    const organizationId = resolveOrganizationId(req);
    const prospect = await prospectAccessService.loadCoreProspectById(prospectId, organizationId);

    if (!prospect) {
      notFound(res);
      return null;
    }

    const effectiveContext = {
      ...req.authContext,
      organizationId
    };

    if (!canAccessProspect(effectiveContext, prospect)) {
      deny(res, "You do not have access to this prospect.");
      return null;
    }

    return { prospect, organizationId };
  }

  return {
    async create(req, res) {
      try {
        if (!hasPermission(req.authContext, PERMISSIONS.PROSPECT_WRITE)) {
          return deny(res);
        }

        const organizationId = resolveOrganizationId(req);
        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.createProspect(
          organizationId,
          stripBodyOrganization(req.body),
          actor
        );

        auditFromRequest(req, {
          action: "prospect.updated",
          targetType: "core_prospect",
          targetId: prospect.prospectId,
          metadata: { operation: "create" }
        }).catch(() => {});

        return res.status(201).json({
          prospect: sanitizeProspectResponse(prospect, req.authContext.role)
        });
      } catch (error) {
        return handleError(res, error, "create");
      }
    },

    async list(req, res) {
      try {
        if (!hasPermission(req.authContext, PERMISSIONS.PROSPECT_READ)) {
          return deny(res);
        }

        const scope = getProspectListScope(req.authContext);

        if (scope.denied) {
          return deny(res);
        }

        const result = await service.listProspects({
          q: req.query.q,
          lifecycleState: req.query.lifecycleState,
          limit: req.query.limit,
          offset: req.query.offset,
          organizationId: resolveOrganizationId(req),
          ownerUserId: scope.ownerUserId,
          ownerUserIds: scope.ownerUserIds,
          divisionId: scope.divisionId
        });

        return res.json({
          items: sanitizeProspectList(result.items, req.authContext.role),
          total: result.total
        });
      } catch (error) {
        return handleError(res, error, "list");
      }
    },

    async getById(req, res) {
      try {
        const authorized = await authorizeProspectAccess(req, res, req.params.id);

        if (!authorized) {
          return;
        }

        const prospect = await service.getProspect(req.params.id, authorized.organizationId);

        auditFromRequest(req, {
          action: "prospect.viewed",
          targetType: "core_prospect",
          targetId: req.params.id
        }).catch(() => {});

        return res.json({
          prospect: sanitizeProspectResponse(prospect, req.authContext.role)
        });
      } catch (error) {
        return handleError(res, error, "getById");
      }
    },

    async update(req, res) {
      try {
        const authorized = await authorizeProspectAccess(req, res, req.params.id, {
          write: true
        });

        if (!authorized) {
          return;
        }

        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.updateProspect(
          req.params.id,
          authorized.organizationId,
          req.body,
          actor
        );

        auditFromRequest(req, {
          action: "prospect.updated",
          targetType: "core_prospect",
          targetId: req.params.id
        }).catch(() => {});

        return res.json({
          prospect: sanitizeProspectResponse(prospect, req.authContext.role)
        });
      } catch (error) {
        return handleError(res, error, "update");
      }
    },

    async archive(req, res) {
      try {
        const authorized = await authorizeProspectAccess(req, res, req.params.id, {
          write: true
        });

        if (!authorized) {
          return;
        }

        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.archiveProspect(
          req.params.id,
          authorized.organizationId,
          actor
        );

        auditFromRequest(req, {
          action: "prospect.updated",
          targetType: "core_prospect",
          targetId: req.params.id,
          metadata: { operation: "archive" }
        }).catch(() => {});

        return res.json({
          prospect: sanitizeProspectResponse(prospect, req.authContext.role)
        });
      } catch (error) {
        return handleError(res, error, "archive");
      }
    },

    async restore(req, res) {
      try {
        const authorized = await authorizeProspectAccess(req, res, req.params.id, {
          write: true
        });

        if (!authorized) {
          return;
        }

        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.restoreProspect(
          req.params.id,
          authorized.organizationId,
          actor
        );

        return res.json({
          prospect: sanitizeProspectResponse(prospect, req.authContext.role)
        });
      } catch (error) {
        return handleError(res, error, "restore");
      }
    },

    async assign(req, res) {
      try {
        if (!hasPermission(req.authContext, PERMISSIONS.PROSPECT_ASSIGN)) {
          return deny(res);
        }

        const authorized = await authorizeProspectAccess(req, res, req.params.id, {
          write: true
        });

        if (!authorized) {
          return;
        }

        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.assignProspect(
          req.params.id,
          authorized.organizationId,
          req.body,
          actor
        );

        auditFromRequest(req, {
          action: "lead.assigned",
          targetType: "core_prospect",
          targetId: req.params.id,
          metadata: {
            assignedAgentId: req.body?.assignedAgentId || null
          }
        }).catch(() => {});

        return res.json({
          prospect: sanitizeProspectResponse(prospect, req.authContext.role)
        });
      } catch (error) {
        return handleError(res, error, "assign");
      }
    },

    async merge(req, res) {
      try {
        if (!hasPermission(req.authContext, PERMISSIONS.PROSPECT_ASSIGN)) {
          return deny(res);
        }

        const organizationId = resolveOrganizationId(req);
        const { survivorId, mergedId } = req.body || {};

        if (!survivorId || !mergedId) {
          return res.status(400).json({
            error: "VALIDATION_ERROR",
            message: "survivorId and mergedId are required."
          });
        }

        const survivor = await prospectAccessService.loadCoreProspectById(
          survivorId,
          organizationId
        );
        const merged = await prospectAccessService.loadCoreProspectById(mergedId, organizationId);

        if (!survivor || !merged) {
          return notFound(res);
        }

        const effectiveContext = {
          ...req.authContext,
          organizationId
        };

        if (
          !canAccessProspect(effectiveContext, survivor) ||
          !canAccessProspect(effectiveContext, merged)
        ) {
          return deny(res, "You do not have access to this prospect.");
        }

        const actor = actorFromRequest(req.atlasUser);
        const result = await service.mergeProspects(
          organizationId,
          { survivorId, mergedId },
          actor
        );

        return res.json({
          survivor: sanitizeProspectResponse(result.survivor, req.authContext.role),
          merged: sanitizeProspectResponse(result.merged, req.authContext.role)
        });
      } catch (error) {
        return handleError(res, error, "merge");
      }
    }
  };
}

module.exports = {
  createProspectController
};
