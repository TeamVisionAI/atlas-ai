const express = require("express");
const { protectedRoute } = require("../middleware/protectedRoute");
const { getOrganizationBranding } = require("../services/organizationBrandingService");
const {
  loadTenantOperationalIdentity,
  presentOrganizationSettingsFromIdentity
} = require("../core/tenantOperationalIdentity");
const recruitingConfigRoutes = require("./recruitingConfig");
const organizationBillingRoutes = require("./organizationBilling");
const organizationAiQualityRoutes = require("./organizationAiQuality");

const router = express.Router();

router.use(...protectedRoute());
router.use(recruitingConfigRoutes);
router.use(organizationBillingRoutes);
router.use(organizationAiQualityRoutes);

router.get("/settings", async (req, res) => {
  try {
    const organizationId = req.tenantContext?.organizationId || null;
    if (req.controlPlaneOnly || !organizationId) {
      return res.json({
        organizationName: null,
        timezone: null,
        office: null,
        businessHours: null,
        templates: {},
        controlPlane: true
      });
    }
    const identity = await loadTenantOperationalIdentity(organizationId);
    return res.json(presentOrganizationSettingsFromIdentity(identity, organizationId));
  } catch (error) {
    console.error("[organization/settings]", error.message);
    return res.status(500).json({ error: "ORGANIZATION_SETTINGS_UNAVAILABLE" });
  }
});

router.get("/branding", async (req, res) => {
  try {
    if (req.controlPlaneOnly || !req.tenantContext?.organizationId) {
      return res.json({ name: null, controlPlane: true });
    }
    const branding = await getOrganizationBranding(req.tenantContext.organizationId);
    return res.json(branding);
  } catch (error) {
    console.error("[organization/branding]", error.message);
    return res.status(500).json({ error: "BRANDING_UNAVAILABLE" });
  }
});

module.exports = router;
