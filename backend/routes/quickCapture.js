/**
 * Sprint 10.1 — Quick Capture and session routes.
 */

const express = require("express");
const router = express.Router();
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
const { bootstrapSession, findUserBySessionToken } = require("../services/atlasUserService");
const { extractBearerToken } = require("../middleware/requireAtlasUser");

router.post("/auth/session", async (req, res) => {
  try {
    const bootstrapToken = String(req.body?.bootstrapToken || "").trim();
    const expected = process.env.ATLAS_BOOTSTRAP_TOKEN;

    if (!expected || bootstrapToken !== expected) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Invalid bootstrap credentials."
      });
    }

    const result = await bootstrapSession();

    if (!result) {
      return res.status(500).json({
        error: "SESSION_ERROR",
        message: "Unable to create session."
      });
    }

    return res.status(201).json({
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      user: {
        id: result.user.id,
        display_name: result.user.display_name,
        email: result.user.email
      }
    });
  } catch (error) {
    console.error("[auth/session]", error.message);
    return res.status(500).json({ error: "SESSION_ERROR", message: error.message });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const user = await findUserBySessionToken(token);

    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    return res.json({
      id: user.id,
      display_name: user.display_name,
      email: user.email
    });
  } catch (error) {
    console.error("[auth/me]", error.message);
    return res.status(500).json({ error: "AUTH_ERROR" });
  }
});

router.post("/prospects/quick-capture", requireAtlasUser, async (req, res) => {
  try {
    const result = await createQuickCaptureProspect(req.body, req.atlasUser);
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
