/**
 * Read-only TikTok LIVE engagements (BR-230).
 * Mount: /api/tiktok-live-engagements
 * Session auth + tenant guard. No writes.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyTiktokLiveEngagements
} = require("../core/operationalControlPlane");
const { listTiktokLiveEngagements } = require("../core/tikfinity/tikfinityLiveEventService");

function createTiktokLiveEngagementsRouter(dependencies = {}) {
  const router = express.Router();

  router.use(requireAtlasUser);
  router.use(organizationGuard());

  router.get("/", operationalControlPlaneEmpty(emptyTiktokLiveEngagements), async (req, res) => {
    try {
      const organizationId = getTenantOrganizationId(req);
      const payload = await listTiktokLiveEngagements(
        { organizationId, limit: req.query.limit },
        { engagementStore: dependencies.engagementStore }
      );
      return res.json(payload);
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        error: error.publicCode || "ENGAGEMENT_LIST_FAILED",
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createTiktokLiveEngagementsRouter;
module.exports.createTiktokLiveEngagementsRouter = createTiktokLiveEngagementsRouter;
