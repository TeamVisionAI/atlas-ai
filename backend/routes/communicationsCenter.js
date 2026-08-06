/**
 * Communications Center — read-only prospect communications aggregation.
 * Canonical route: GET /api/prospects/:id/communications
 */

const {
  getProspectCommunications
} = require("../application/communicationsCenterApplicationService");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireProspectAccessById } = require("../middleware/requireProspectAccess");
const { getTenantOrganizationId } = require("../services/tenantContextService");

/**
 * Express handler — mount with requireAtlasUser + organizationGuard + requireProspectAccessById.
 */
async function prospectCommunicationsHandler(req, res) {
  try {
    const prospect = req.authorizedProspect;
    const organizationId =
      getTenantOrganizationId(req) ||
      prospect?.organization_id ||
      prospect?.organizationId ||
      null;

    const timeline = await getProspectCommunications({
      prospect,
      prospectSource: req.authorizedProspectSource || "legacy",
      organizationId,
      query: {
        timezone: req.query.timezone,
        limit: req.query.limit
      }
    });

    res.json(timeline);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error("[communications-center]", error.message);
    res.status(status).json({
      error: error.publicCode || "COMMUNICATIONS_CENTER_FAILED",
      message:
        status === 404
          ? error.message
          : "Failed to load communications timeline"
    });
  }
}

const prospectCommunicationsStack = [
  requireAtlasUser,
  organizationGuard(),
  requireProspectAccessById(),
  prospectCommunicationsHandler
];

module.exports = {
  prospectCommunicationsHandler,
  prospectCommunicationsStack
};
