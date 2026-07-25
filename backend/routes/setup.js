/**
 * LC1.1 Part 0 — Platform bootstrap routes (first-time setup).
 */

const express = require("express");
const router = express.Router();
const {
  getSetupStatus,
  completePlatformSetup
} = require("../services/platformSetupService");

router.get("/setup/status", async (req, res) => {
  try {
    const status = await getSetupStatus();
    res.json(status);
  } catch (error) {
    console.error("[setup/status]", error.message);
    res.status(500).json({ error: "SETUP_STATUS_FAILED" });
  }
});

router.post("/setup/complete", async (req, res) => {
  try {
    const result = await completePlatformSetup(req.body, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.status(201).json({
      setupCompletedAt: result.setupCompletedAt,
      organization: result.organization,
      user: result.user,
      token: result.session.token,
      expiresAt: result.session.expiresAt
    });
  } catch (error) {
    const status = error.statusCode || 500;

    if (status >= 500) {
      console.error("[setup/complete]", error.message);
    }

    res.status(status).json({
      error: error.publicCode || "SETUP_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
