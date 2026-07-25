/**
 * Sprint 10.1 — Quick Capture and session routes.
 */

const express = require("express");
const router = express.Router();
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
const { auditFromRequest } = require("../security/auditLogService");

router.post("/prospects/quick-capture", requireAtlasUser, async (req, res) => {
  try {
    const result = await createQuickCaptureProspect(req.body, req.atlasUser);

    if (result.status >= 200 && result.status < 300) {
      auditFromRequest(req, {
        action: "prospect.updated",
        targetType: "legacy_prospect",
        targetId: result.body?.prospect?.phone || null,
        metadata: { operation: "quick_capture" }
      }).catch(() => {});
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[quick-capture]", error.message);
    return res.status(500).json({
      error: "QUICK_CAPTURE_FAILED",
      message: "Unable to save prospect."
    });
  }
});

module.exports = router;
