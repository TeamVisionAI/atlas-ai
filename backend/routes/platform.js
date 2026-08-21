/**
 * Platform tenant provisioning + Support Mode (Super Admin only).
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const platformTenantService = require("../services/platformTenantService");
const supportModeService = require("../services/supportModeService");
const {
  resolveEffectiveOrganizationId
} = require("../core/effectiveOrganizationContext");

const platformBillingRoutes = require("./platformBilling");

const router = express.Router();

router.use(requireAtlasUser);
router.use(requireSuperAdmin);

function auditMeta(req) {
  return {
    userId: req.authContext?.userId,
    userEmail: req.authContext?.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.post("/tenants", async (req, res) => {
  try {
    const tenant = await platformTenantService.createTenant(req.body, auditMeta(req));
    res.status(201).json({ tenant });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to create tenant."
    });
  }
});

router.get("/tenants", async (req, res) => {
  try {
    const result = await platformTenantService.listTenants(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to list tenants."
    });
  }
});

router.get("/tenants/:id", async (req, res) => {
  try {
    const tenant = await platformTenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        error: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found."
      });
    }

    res.json({ tenant });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to load tenant."
    });
  }
});

router.patch("/tenants/:id/status", async (req, res) => {
  try {
    const lifecycleStatus = req.body.lifecycleStatus || req.body.status;
    const tenant = await platformTenantService.setTenantStatus(
      req.params.id,
      lifecycleStatus,
      auditMeta(req)
    );
    res.json({ tenant });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to update tenant status."
    });
  }
});

router.use("/tenants/:id", platformBillingRoutes);

router.get("/tenants/:id/features", async (req, res) => {
  try {
    const tenantFeatureService = require("../services/tenantFeatureService");
    const presentation =
      await tenantFeatureService.getTenantFeatureControlsPresentation(req.params.id);
    return res.json(presentation);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to load tenant features."
    });
  }
});

router.patch("/tenants/:id/features", async (req, res) => {
  try {
    const tenantFeatureService = require("../services/tenantFeatureService");
    const updated = await tenantFeatureService.updateTenantFeatures(
      req.params.id,
      req.body || {},
      auditMeta(req)
    );
    const presentation =
      await tenantFeatureService.getTenantFeatureControlsPresentation(req.params.id, {
        backfillSeedFromEnv: false
      });
    return res.json({
      ...presentation,
      features: updated.material,
      featuresRaw: updated.features
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to update tenant features."
    });
  }
});

router.post("/tenants/:id/admin", async (req, res) => {
  try {
    const result = await platformTenantService.provisionTenantAdmin(
      req.params.id,
      req.body,
      req.authContext,
      auditMeta(req)
    );
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to provision tenant admin."
    });
  }
});

router.post("/support-mode/enter", async (req, res) => {
  try {
    const organizationId = req.body.organizationId || req.body.organization_id;

    if (!organizationId) {
      return res.status(400).json({
        error: "ORGANIZATION_ID_REQUIRED",
        message: "organizationId is required."
      });
    }

    const support = await supportModeService.enterSupportMode(
      req.authContext.userId,
      organizationId,
      req.authSessionId,
      auditMeta(req)
    );

    const effectiveOrganizationId = resolveEffectiveOrganizationId(req.authContext, {
      organizationId: support.organizationId,
      enteredAt: support.enteredAt
    });

    res.json({
      support,
      effectiveOrganizationId,
      homeOrganizationId: req.authContext.organizationId
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to enter Support Mode."
    });
  }
});

router.post("/support-mode/exit", async (req, res) => {
  try {
    const result = await supportModeService.exitSupportMode(
      req.authContext.userId,
      req.authSessionId,
      auditMeta(req)
    );

    res.json({
      ...result,
      effectiveOrganizationId: req.authContext.organizationId
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to exit Support Mode."
    });
  }
});

router.get("/support-mode", async (req, res) => {
  try {
    const support = await supportModeService.getSupportModeStatus(
      req.authContext.userId,
      req.authSessionId
    );

    res.json({
      ...support,
      effectiveOrganizationId: resolveEffectiveOrganizationId(
        req.authContext,
        support.active
          ? { organizationId: support.organizationId, enteredAt: support.enteredAt }
          : null
      ),
      homeOrganizationId: req.authContext.organizationId
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to load Support Mode status."
    });
  }
});

module.exports = router;
