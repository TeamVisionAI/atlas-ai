/**
 * Sprint 17.0 — Read-only platform status API for Knowledge Hub dashboard.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { getPlatformStatus } = require("../services/platformStatusService");

const router = express.Router();

router.use(requireAtlasUser);

router.get("/", async (req, res) => {
  try {
    const forceRefresh =
      req.query.refresh === "1" ||
      req.query.refresh === "true" ||
      req.query.force === "1" ||
      req.query.force === "true";

    const payload = getPlatformStatus({ forceRefresh });
    res.json(payload);
  } catch (error) {
    console.error("[platform-status]", error.message);
    res.status(500).json({
      ok: false,
      error: "PLATFORM_STATUS_FAILED",
      message: "Unable to load platform status.",
      warnings: [error.message]
    });
  }
});

module.exports = router;
