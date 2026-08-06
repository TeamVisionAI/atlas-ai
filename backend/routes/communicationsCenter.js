/**
 * Communications Center — read-only prospect communications aggregation.
 */

const express = require("express");
const {
  buildCommunicationsCenterTimeline
} = require("../core/communicationsCenterReadModel");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireLegacyProspectAccess } = require("../middleware/requireProspectAccess");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function rejectSimulatorProspect(phone, res) {
  if (!isProductionProspect(phone)) {
    res.status(404).json({ error: "Communications Center prospect not found" });
    return true;
  }

  return false;
}

/**
 * GET /api/communications-center/:phone
 * Chronological unified communications + operational events for a prospect.
 */
router.get("/:phone", requireLegacyProspectAccess(), async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const prospect = req.legacyProspect || {};
    const organizationId =
      req.tenantContext?.organizationId || prospect.organization_id || null;

    const timeline = await buildCommunicationsCenterTimeline({
      phone: req.params.phone,
      organizationId,
      prospectId: prospect.id || prospect.prospect_id || null,
      prospectDisplayName: prospect.full_name || prospect.name || null,
      timezone: req.query.timezone || "America/New_York",
      limit: req.query.limit
    });

    res.json(timeline);
  } catch (error) {
    console.error("[communications-center]", error.message);
    res.status(500).json({ error: "Failed to load communications timeline" });
  }
});

module.exports = router;
