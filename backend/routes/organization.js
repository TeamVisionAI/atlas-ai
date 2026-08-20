const express = require("express");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");
const { protectedRoute } = require("../middleware/protectedRoute");
const { getOrganizationBranding } = require("../services/organizationBrandingService");
const recruitingConfigRoutes = require("./recruitingConfig");
const organizationBillingRoutes = require("./organizationBilling");

const router = express.Router();

router.use(...protectedRoute());
router.use(recruitingConfigRoutes);
router.use(organizationBillingRoutes);

router.get("/settings", (req, res) => {
  res.json(getOrganizationSettings());
});

router.get("/branding", async (req, res) => {
  try {
    const branding = await getOrganizationBranding(req.tenantContext.organizationId);
    return res.json(branding);
  } catch (error) {
    console.error("[organization/branding]", error.message);
    return res.status(500).json({ error: "BRANDING_UNAVAILABLE" });
  }
});

module.exports = router;
