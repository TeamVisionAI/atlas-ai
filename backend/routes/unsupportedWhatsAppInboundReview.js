/**
 * BR-156 — Unsupported Meta WhatsApp inbound review API.
 * Mount: /api/unsupported-whatsapp-inbound-reviews
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  listPendingReviewsForRequest,
  dismissUnsupportedInboundReview,
  confirmUnsupportedInboundReview
} = require("../core/unsupportedWhatsAppInboundReview/unsupportedWhatsAppInboundReviewService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/pending", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const reviews = await listPendingReviewsForRequest({
      organizationId,
      authContext: req.authContext,
      limit: Number(req.query.limit) || 20
    });

    return res.json({
      reviews,
      count: reviews.length
    });
  } catch (error) {
    console.error("[unsupported-whatsapp-inbound-reviews/pending]", error.message);
    return res.status(500).json({
      error: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW_LIST_FAILED",
      message: error.message
    });
  }
});

router.post("/:reviewId/dismiss", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await dismissUnsupportedInboundReview({
      reviewId: req.params.reviewId,
      organizationId,
      authContext: req.authContext
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        error: result.reason || "DISMISS_FAILED"
      });
    }

    return res.json({
      ok: true,
      alreadyResolved: Boolean(result.alreadyResolved),
      review: result.review
    });
  } catch (error) {
    console.error("[unsupported-whatsapp-inbound-reviews/dismiss]", error.message);
    return res.status(500).json({
      error: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW_DISMISS_FAILED",
      message: error.message
    });
  }
});

router.post("/:reviewId/confirm", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await confirmUnsupportedInboundReview({
      reviewId: req.params.reviewId,
      organizationId,
      authContext: req.authContext,
      campaignCode: req.body?.campaignCode || req.body?.campaignIntakeCode || null
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        error: result.reason || "CONFIRM_FAILED",
        attribution: result.attribution || null
      });
    }

    return res.json({
      ok: true,
      alreadyResolved: Boolean(result.alreadyResolved),
      review: result.review,
      attribution: result.attribution || null
    });
  } catch (error) {
    console.error("[unsupported-whatsapp-inbound-reviews/confirm]", error.message);
    return res.status(500).json({
      error: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW_CONFIRM_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
