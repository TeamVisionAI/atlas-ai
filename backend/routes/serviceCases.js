/**
 * BR-182 — Client Service / Policy Review routes.
 * Personal queue by default. Team scope only when hierarchy already allows it.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyServiceCases,
  emptyServiceCaseDetail
} = require("../core/operationalControlPlane");
const clientServiceApplicationService = require("../application/clientServiceApplicationService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function actorContext(req) {
  return {
    ...req.authContext,
    userId: req.tenantContext?.userId || req.authContext?.userId,
    organizationId: getTenantOrganizationId(req),
    role: req.authContext?.role,
    hierarchyMode: req.authContext?.hierarchyMode,
    hierarchyUserIds: req.authContext?.hierarchyUserIds
  };
}

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.publicCode || error.code || "CLIENT_SERVICE_FAILED",
    message: error.message
  });
}

router.get("/", operationalControlPlaneEmpty(emptyServiceCases), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await clientServiceApplicationService.listServiceCases({
      organizationId,
      authContext: actorContext(req),
      scope: req.query.scope,
      search: req.query.q,
      status: req.query.status,
      serviceType: req.query.serviceType || req.query.type,
      clientId: req.query.clientId,
      ownerUserId: req.query.ownerUserId,
      due: req.query.due
    });
    res.json(payload);
  } catch (error) {
    console.error("[service-cases]", error.message);
    sendError(res, error);
  }
});

router.post("/", operationalControlPlaneEmpty(emptyServiceCases), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientServiceApplicationService.createServiceCase(
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.status(201).json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id", operationalControlPlaneEmpty(emptyServiceCaseDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientServiceApplicationService.getServiceCase(req.params.id, {
      organizationId,
      authContext: actorContext(req)
    });
    res.json(record);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/:id", operationalControlPlaneEmpty(emptyServiceCaseDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientServiceApplicationService.updateServiceCase(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/status", operationalControlPlaneEmpty(emptyServiceCaseDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientServiceApplicationService.updateStatus(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/follow-up", operationalControlPlaneEmpty(emptyServiceCaseDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await clientServiceApplicationService.createClientFollowUp(
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
