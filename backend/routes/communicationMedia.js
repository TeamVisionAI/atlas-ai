/**
 * Signed playback for inbound communication media (BR-140).
 * GET /api/prospects/:id/communications/media/:mediaId/playback
 */

"use strict";

const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireProspectAccessById } = require("../middleware/requireProspectAccess");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  createCommunicationMediaPlayback
} = require("../core/communicationMedia/communicationMediaPlaybackService");

async function communicationMediaPlaybackHandler(req, res) {
  try {
    const prospect = req.authorizedProspect;
    const organizationId =
      getTenantOrganizationId(req) ||
      prospect?.organization_id ||
      prospect?.organizationId ||
      null;

    const payload = await createCommunicationMediaPlayback({
      organizationId,
      prospectId: req.params.id,
      mediaId: req.params.mediaId,
      authorizedProspect: prospect
    });

    res.json(payload);
  } catch (error) {
    const status = error.statusCode || 500;
    const publicCode = error.publicCode || "MEDIA_PLAYBACK_FAILED";
    const safeMessage =
      status === 404
        ? "Media not found"
        : status === 403
          ? "You do not have access to this media."
          : publicCode === "MEDIA_PREPARING"
            ? "Preparing audio"
            : publicCode === "MEDIA_UNSUPPORTED_BROWSER"
              ? "Voice message unavailable in this browser"
              : status === 409
                ? "Voice message unavailable"
                : "Failed to create playback URL";
    res.status(status).json({
      error: publicCode,
      message: safeMessage
    });
  }
}

const communicationMediaPlaybackStack = [
  requireAtlasUser,
  organizationGuard(),
  requireProspectAccessById(),
  communicationMediaPlaybackHandler
];

module.exports = {
  communicationMediaPlaybackHandler,
  communicationMediaPlaybackStack
};
