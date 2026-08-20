/**
 * BR-145 — Tenant-scoped read-only billing summary.
 */

const express = require("express");
const tenantBillingService = require("../services/tenantBillingService");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();

router.get("/billing", requirePermission("billing:access"), async (req, res) => {
  try {
    const billing = await tenantBillingService.getTenantSafeBilling(
      req.tenantContext.organizationId
    );
    return res.json({ billing });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "BILLING_ERROR",
      message: error.message || "Unable to load billing."
    });
  }
});

module.exports = router;
