/**
 * BR-184 — Today / Action Center routes.
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

/**
 * Reuse the canonical `req.authContext` from buildAuthContext + organizationGuard.
 * Implements BR-180 — filterProspectsForAuthContext / isActiveContext need status.
 * Do not invent a thinner actor shape. Do not hardcode status.
 */
function actorContext(req) {
  const context = req.authContext || {};
  return {
    ...context,
    userId: req.tenantContext?.userId || context.userId,
    organizationId: getTenantOrganizationId(req) || context.organizationId
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
      scope: req.query.scope,
      filter: req.query.filter
    });
    res.json(payload);
  } catch (error) {
    console.error("[today]", error.message);
    sendError(res, error);
  }
});

module.exports = router;
module.exports.actorContext = actorContext;
