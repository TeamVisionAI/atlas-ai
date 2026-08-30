/**
 * BR-180 — Today / Action Center routes.
 * Aggregation read model. My scope by default. Team only when hierarchy already allows it.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyToday
} = require("../core/operationalControlPlane");
const todayActionCenterApplicationService = require("../application/todayActionCenterApplicationService");

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
    error: error.publicCode || error.code || "TODAY_FAILED",
    message: error.message
  });
}

router.get("/", operationalControlPlaneEmpty(emptyToday), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await todayActionCenterApplicationService.getToday({
      organizationId,
      authContext: actorContext(req),
      scope: req.query.scope
    });
    res.json(payload);
  } catch (error) {
    console.error("[today]", error.message);
    sendError(res, error);
  }
});

module.exports = router;
