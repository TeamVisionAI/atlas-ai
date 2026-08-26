/**
 * Sprint 10.3 — Prospect Center routes (thin API).
 * Sprint 19 — Tenant-scoped via organizationGuard.
 * Authorization — same pipeline as GET /api/dashboard (filterProspectsForAuthContext in route).
 */

const express = require("express");
const { buildProspectCenterReadModel } = require("../core/prospectCenterReadModel");
const { loadProductionProspects } = require("../core/executiveDashboardReadModel");
const { filterProspectsForAuthContext } = require("../security/authorizationService");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyProspectCenter
} = require("../core/operationalControlPlane");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/", operationalControlPlaneEmpty(emptyProspectCenter), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const productionProspects = await loadProductionProspects(organizationId);
    const prospects = filterProspectsForAuthContext(req.authContext, productionProspects);

    const payload = await buildProspectCenterReadModel({
      filter: req.query.filter,
      search: req.query.q,
      organizationId,
      prospects
    });

    res.json(payload);
  } catch (error) {
    console.error("[prospect-center]", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "Failed to load prospect center",
      message: error.message
    });
  }
});

module.exports = router;
