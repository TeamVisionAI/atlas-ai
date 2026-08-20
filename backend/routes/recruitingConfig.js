/**
 * C1 — Tenant-scoped recruiting configuration API.
 * Organization is taken from effective tenant context only.
 */

const express = require("express");
const recruitingConfigService = require("../services/recruitingConfigService");
const { requirePermission } = require("../middleware/requirePermission");
const { requireOrgAdmin } = require("../middleware/requireOrgAdmin");
const { PERMISSIONS } = require("../security/permissions");

const router = express.Router();

function auditMeta(req) {
  return {
    userId: req.tenantContext?.userId || req.authContext?.userId,
    userEmail: req.authContext?.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.get("/recruiting-config", requirePermission(PERMISSIONS.ORG_READ), async (req, res) => {
  try {
    const result = await recruitingConfigService.getRecruitingConfig(req.tenantContext.organizationId);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "RECRUITING_CONFIG_ERROR",
      message: error.message,
      details: error.details
    });
  }
});

router.patch("/recruiting-config", requireOrgAdmin, async (req, res) => {
  try {
    const result = await recruitingConfigService.updateRecruitingConfig(
      req.tenantContext.organizationId,
      req.body || {},
      auditMeta(req)
    );
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "RECRUITING_CONFIG_ERROR",
      message: error.message,
      details: error.details
    });
  }
});

module.exports = router;
