const express = require("express");
const timelineService = require("../services/timelineService");
const { TimelineOrganizationRequiredError } = timelineService;

const router = express.Router();

function resolveAuthenticatedOrganizationId(req) {
  // Authenticated tenant context only — never query/body org overrides.
  return req.authContext?.organizationId || null;
}

router.get("/:phone", async (req, res) => {
  try {
    const organizationId = resolveAuthenticatedOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Organization context required."
      });
    }

    const timeline = await timelineService.getConversationTimeline(
      req.params.phone,
      organizationId
    );

    return res.json(timeline);
  } catch (err) {
    console.error(err);

    if (err instanceof TimelineOrganizationRequiredError) {
      return res.status(err.statusCode).json({
        error: err.publicCode,
        message: err.message
      });
    }

    return res.status(err.statusCode || 500).json({
      error: err.publicCode || "TIMELINE_ERROR",
      message: err.message || "Unexpected timeline error."
    });
  }
});

module.exports = router;