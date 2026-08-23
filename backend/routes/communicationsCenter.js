/**
 * Communications Center — read-only prospect communications aggregation.
 * Canonical route: GET /api/prospects/:id/communications
 */

const {
  getProspectCommunications
} = require("../application/communicationsCenterApplicationService");
const {
  sanitizeCommunicationsCenterResponse
} = require("../core/communicationsCenterSanitizer");
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
        limit: req.query.limit,
        projection: req.query.projection,
        before: req.query.before
      }
    });

    res.json(timeline);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error("[communications-center]", "request_failed");
    const safeMessage =
      status === 404
        ? "Communications Center prospect not found"
        : "Failed to load communications timeline";
    res.status(status).json(
      sanitizeCommunicationsCenterResponse({
        error: error.publicCode || "COMMUNICATIONS_CENTER_FAILED",
        message: safeMessage
      })
    );
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
