/**
 * Meta App Review — administrator review/demo user management (no invitation email).
 */

const express = require("express");
const router = express.Router();
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { requirePermission } = require("../middleware/requirePermission");
const { requireMetaReviewMode } = require("../middleware/requireMetaReviewMode");
const { PERMISSIONS } = require("../security/permissions");
const metaReviewUserService = require("../services/metaReviewUserService");

router.use(requireMetaReviewMode);
router.use(requireAtlasUser);
router.use(requirePermission(PERMISSIONS.ADMIN_USERS));

function auditMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.get("/", async (req, res) => {
  try {
    const result = await metaReviewUserService.listReviewUsers(req.authContext);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const result = await metaReviewUserService.createReviewUser(
      req.body,
      req.authContext,
      auditMeta(req)
    );
    res.status(result.activated ? 200 : 201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = await metaReviewUserService.getReviewUserById(req.params.id, req.authContext);
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/:id/reset-password", async (req, res) => {
  try {
    const result = await metaReviewUserService.resetReviewUserPassword(
      req.params.id,
      req.body.password,
      req.authContext,
      auditMeta(req)
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

module.exports = router;
