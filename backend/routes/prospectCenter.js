/**
 * Sprint 10.3 — Prospect Center routes (thin API).
 * Sprint 19 — Tenant-scoped via organizationGuard.
 * Authorization — BR-165 default mine workspace; oversight via workspaceScope.
 */

const express = require("express");
const { buildProspectCenterReadModel } = require("../core/prospectCenterReadModel");
const { loadProductionProspects } = require("../core/executiveDashboardReadModel");
const {
  resolveWorkspaceListScope,
  isProspectInWorkspaceListScope
} = require("../security/authorizationService");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  isSupportModeActive,
  isControlPlaneRequest,
  isGlobalSuperAdminControlPlane
} = require("../core/effectiveOrganizationContext");
const {
  buildProspectReport,
  toCsv
} = require("../core/prospectReportReadModel");
const {
  operationalControlPlaneEmpty,
  emptyProspectCenter,
  emptyProspectReport
} = require("../core/operationalControlPlane");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/", operationalControlPlaneEmpty(emptyProspectCenter), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const listScope = resolveWorkspaceListScope(
      req.authContext,
      req.query.workspaceScope
    );
    const productionProspects = await loadProductionProspects(organizationId, {
      listScope
    });
    const prospects = productionProspects.filter((prospect) =>
      isProspectInWorkspaceListScope(prospect, listScope)
    );

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

function reportFiltersFromQuery(query = {}) {
  return {
    lifecycle: query.lifecycle || "all",
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null,
    ownerUserId: query.ownerUserId || null,
    milestone: query.milestone || null,
    source: query.source || null,
    appointmentStatus: query.appointmentStatus || null
  };
}

async function loadProspectReport(req, { forExport = false } = {}) {
  const organizationId = getTenantOrganizationId(req);
  return buildProspectReport({
    organizationId,
    authContext: req.authContext,
    supportModeActive: isSupportModeActive(req),
    filters: reportFiltersFromQuery(req.query),
    limit: req.query.limit,
    offset: req.query.offset,
    forExport
  });
}

router.get("/report", operationalControlPlaneEmpty(emptyProspectReport), async (req, res) => {
  try {
    const payload = await loadProspectReport(req, {
      forExport: req.query.export === "1" || req.query.export === "true"
    });
    res.json(payload);
  } catch (error) {
    console.error("[prospect-center] report", error.message);
    res.status(error.statusCode || 500).json({
      error: error.code || error.publicCode || "Failed to load prospect report",
      message: error.message
    });
  }
});

router.get("/report.csv", (req, res, next) => {
  if (
    !isControlPlaneRequest(req) &&
    !isGlobalSuperAdminControlPlane(req.authContext, req.supportContext)
  ) {
    return next();
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.send(toCsv([]));
}, async (req, res) => {
  try {
    const payload = await loadProspectReport(req, { forExport: true });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="atlas-prospect-report-${payload.organizationId || "empty"}.csv"`
    );
    res.send(toCsv(payload.items || []));
  } catch (error) {
    console.error("[prospect-center] report.csv", error.message);
    res.status(error.statusCode || 500).json({
      error: error.code || error.publicCode || "Failed to export prospect report",
      message: error.message
    });
  }
});

module.exports = router;
