/**
 * BR-145 — Platform tenant billing API (Super Admin only).
 */

const express = require("express");
const tenantBillingService = require("../services/tenantBillingService");

const router = express.Router({ mergeParams: true });

function auditMeta(req) {
  return {
    userId: req.authContext?.userId,
    userEmail: req.authContext?.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.get("/billing", async (req, res) => {
  try {
    const billing = await tenantBillingService.getBilling(req.params.id);
    return res.json({ billing });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "BILLING_ERROR",
      message: error.message || "Unable to load billing."
    });
  }
});

router.patch("/billing", async (req, res) => {
  try {
    const billing = await tenantBillingService.updateBilling(
      req.params.id,
      req.body || {},
      auditMeta(req)
    );
    return res.json({ billing });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "BILLING_ERROR",
      message: error.message || "Unable to update billing."
    });
  }
});

router.post("/billing/extend-trial", async (req, res) => {
  try {
    const billing = await tenantBillingService.extendTrial(
      req.params.id,
      req.body?.days,
      auditMeta(req)
    );
    return res.json({ billing });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "BILLING_ERROR",
      message: error.message || "Unable to extend trial."
    });
  }
});

router.post("/billing/mark-paid", async (req, res) => {
  try {
    const billing = await tenantBillingService.markPaid(
      req.params.id,
      req.body || {},
      auditMeta(req)
    );
    return res.json({ billing });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "BILLING_ERROR",
      message: error.message || "Unable to record payment."
    });
  }
});

module.exports = router;
