/**
 * BR-179 — Client Workspace V1 routes.
 * Personal queue by default. Team scope only when hierarchy already allows it.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyClients,
  emptyClientDetail
} = require("../core/operationalControlPlane");
const clientWorkspaceApplicationService = require("../application/clientWorkspaceApplicationService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function actorContext(req) {
  return {
    userId: req.tenantContext?.userId || req.authContext?.userId,
    organizationId: getTenantOrganizationId(req),
    role: req.authContext?.role,
    hierarchyMode: req.authContext?.hierarchyMode,
    hierarchyUserIds: req.authContext?.hierarchyUserIds
  };
}

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.publicCode || error.code || "CLIENT_WORKSPACE_FAILED",
    message: error.message
  });
}

router.get("/", operationalControlPlaneEmpty(emptyClients), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await clientWorkspaceApplicationService.listClients({
      organizationId,
      authContext: actorContext(req),
      search: req.query.q,
      scope: req.query.scope
    });
    res.json(payload);
  } catch (error) {
    console.error("[clients]", error.message);
    sendError(res, error);
  }
});

router.get("/:id", operationalControlPlaneEmpty(emptyClientDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await clientWorkspaceApplicationService.getClient(req.params.id, {
      organizationId,
      authContext: actorContext(req)
    });
    res.json(payload);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/notes", operationalControlPlaneEmpty(emptyClientDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const client = await clientWorkspaceApplicationService.addNote(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, client });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/status", operationalControlPlaneEmpty(emptyClientDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const client = await clientWorkspaceApplicationService.updateStatus(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, client });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
