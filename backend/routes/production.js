/**
 * BR-181 — Client Production / Activity routes.
 * Personal queue by default. Team scope only when hierarchy already allows it.
 * Does not create recruiting prospects or change Today.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyProduction,
  emptyProductionDetail
} = require("../core/operationalControlPlane");
const clientProductionApplicationService = require("../application/clientProductionApplicationService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function actorContext(req) {
  return {
    ...req.authContext,
    userId: req.tenantContext?.userId || req.authContext?.userId,
    organizationId: getTenantOrganizationId(req),
    role: req.authContext?.role,
    saasRole: req.authContext?.saasRole,
    hierarchyMode: req.authContext?.hierarchyMode,
    hierarchyUserIds: req.authContext?.hierarchyUserIds,
    controlPlaneOnly: req.controlPlaneOnly === true,
    supportModeOrganizationId: req.supportContext?.organizationId || null
  };
}

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.publicCode || error.code || "CLIENT_PRODUCTION_FAILED",
    message: error.message
  });
}

router.get("/kpis", operationalControlPlaneEmpty(emptyProduction), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await clientProductionApplicationService.summarizeProductionKpis({
      organizationId,
      authContext: actorContext(req),
      scope: req.query.scope,
      from: req.query.from,
      to: req.query.to
    });
    res.json(payload);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/", operationalControlPlaneEmpty(emptyProduction), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await clientProductionApplicationService.listProduction({
      organizationId,
      authContext: actorContext(req),
      scope: req.query.scope,
      search: req.query.q,
      status: req.query.status,
      activityType: req.query.activityType,
      clientId: req.query.clientId,
      ownerUserId: req.query.ownerUserId,
      from: req.query.from,
      to: req.query.to
    });
    res.json(payload);
  } catch (error) {
    console.error("[production]", error.message);
    sendError(res, error);
  }
});

router.post("/", operationalControlPlaneEmpty(emptyProduction), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientProductionApplicationService.createProduction(
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.status(201).json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id", operationalControlPlaneEmpty(emptyProductionDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientProductionApplicationService.getProduction(req.params.id, {
      organizationId,
      authContext: actorContext(req)
    });
    res.json(record);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/:id", operationalControlPlaneEmpty(emptyProductionDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientProductionApplicationService.updateProduction(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/status", operationalControlPlaneEmpty(emptyProductionDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientProductionApplicationService.updateStatus(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/follow-up", operationalControlPlaneEmpty(emptyProductionDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await clientProductionApplicationService.createClientFollowUp(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.status(201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
