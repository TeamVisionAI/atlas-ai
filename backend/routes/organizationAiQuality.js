/**
 * BR-175 — tenant Admin AI Quality, own organization only.
 */

const express = require("express");
const { requireOrgAdmin } = require("../middleware/requireOrgAdmin");
const { isSuperAdmin } = require("../security/saasRoles");
const aiQualityService = require("../services/aiQualityService");

const router = express.Router();

// Parent /api/organization already authenticates. Apply org-admin per route
// so sibling paths (/branding, /settings, /notifications) stay reachable.

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.publicCode || error.message,
    message: error.message || "AI Quality request failed."
  });
}

function resolveTenantOrg(req) {
  if (req.controlPlaneOnly) {
    return null;
  }
  return (
    req.tenantContext?.organizationId ||
    req.authContext?.organizationId ||
    null
  );
}

function denyIfNoTenant(req, res) {
  const organizationId = resolveTenantOrg(req);
  if (!organizationId) {
    res.status(403).json({
      error: "TENANT_SCOPE_REQUIRED",
      message: isSuperAdmin(req.authContext?.saasRole)
        ? "Enter Support Mode to review one tenant, or use the platform AI Quality console."
        : "Tenant scope is required."
    });
    return null;
  }
  return organizationId;
}

router.get("/ai-quality/settings", requireOrgAdmin, async (req, res) => {
  const organizationId = denyIfNoTenant(req, res);
  if (!organizationId) {
    return undefined;
  }
  try {
    const store = aiQualityService.getStore();
    const tenant = (await store.getTenantSettings(organizationId)) || {
      organizationId,
      participationEnabled: false,
      mode: "OFF",
      sampleRate: 1
    };
    res.json({
      settings: aiQualityService.presentPlatformSettings(process.env),
      tenant
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/ai-quality/settings", requireOrgAdmin, async (req, res) => {
  const organizationId = denyIfNoTenant(req, res);
  if (!organizationId) {
    return undefined;
  }
  try {
    const tenant = await aiQualityService.updateTenantParticipation({
      organizationId,
      participationEnabled: req.body?.participationEnabled,
      mode: req.body?.mode,
      sampleRate: req.body?.sampleRate,
      actorUserId: req.authContext?.userId || null
    });
    res.json({ tenant });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/ai-quality/cases", requireOrgAdmin, async (req, res) => {
  const organizationId = denyIfNoTenant(req, res);
  if (!organizationId) {
    return undefined;
  }
  try {
    const cases = await aiQualityService.listCasesForScope({
      organizationId,
      signalType: req.query.signalType || null,
      tab: req.query.tab || null
    });
    res.json({ cases });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/ai-quality/cases/:id", requireOrgAdmin, async (req, res) => {
  const organizationId = denyIfNoTenant(req, res);
  if (!organizationId) {
    return undefined;
  }
  try {
    const qualityCase = await aiQualityService.getCaseForScope({
      caseId: req.params.id,
      organizationId,
      includeTurns: true
    });
    if (!qualityCase) {
      return res.status(404).json({ error: "QUALITY_CASE_NOT_FOUND" });
    }
    res.json({ case: qualityCase });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/ai-quality/cases/:id/review", requireOrgAdmin, async (req, res) => {
  const organizationId = denyIfNoTenant(req, res);
  if (!organizationId) {
    return undefined;
  }
  try {
    const result = await aiQualityService.reviewCase({
      caseId: req.params.id,
      organizationId,
      action: req.body?.action,
      notes: req.body?.notes || null,
      expectedBehavior: req.body?.expectedBehavior || {},
      reviewerUserId: req.authContext?.userId || null
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
