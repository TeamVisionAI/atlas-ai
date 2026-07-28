/**
 * LC1.1 — Self-service account routes.
 */

const express = require("express");
const router = express.Router();
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { handleProfilePhotoUpload } = require("../middleware/profilePhotoUpload");
const accountService = require("../services/accountService");

router.use(requireAtlasUser);

function auditMeta(req) {
  return {
    userId: req.authContext.userId,
    userEmail: req.authContext.email,
    organizationId: req.authContext.organizationId,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.get("/profile", async (req, res) => {
  try {
    const profile = await accountService.getProfile(req.authContext.userId);
    res.json({ profile });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch("/profile", async (req, res) => {
  try {
    const profile = await accountService.updateProfile(
      req.authContext.userId,
      req.body,
      auditMeta(req)
    );
    res.json({ profile });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/photo", handleProfilePhotoUpload, async (req, res) => {
  try {
    const profile = await accountService.uploadPhoto(
      req.authContext.userId,
      req.file,
      auditMeta(req)
    );
    res.json({ profile });
  } catch (error) {
    console.error("[account/photo]", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "PHOTO_UPLOAD_FAILED",
      message: error.message || "Unable to upload profile photo."
    });
  }
});

router.delete("/photo", async (req, res) => {
  try {
    const profile = await accountService.removePhoto(req.authContext.userId, auditMeta(req));
    res.json({ profile });
  } catch (error) {
    console.error("[account/photo/delete]", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "PHOTO_REMOVE_FAILED",
      message: error.message || "Unable to remove profile photo."
    });
  }
});

router.post("/password/change", async (req, res) => {
  try {
    const result = await accountService.changePassword(
      req.authContext.userId,
      {
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword
      },
      auditMeta(req)
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/sessions", async (req, res) => {
  try {
    const sessions = await accountService.listActiveSessions(
      req.authContext.userId,
      req.atlasSessionToken
    );
    res.json({ sessions });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/sessions/logout-current", async (req, res) => {
  try {
    const result = await accountService.logoutCurrentSession(
      req.atlasSessionToken,
      auditMeta(req)
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/sessions/logout-all", async (req, res) => {
  try {
    const result = await accountService.logoutAllSessions(
      req.authContext.userId,
      auditMeta(req)
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router;
