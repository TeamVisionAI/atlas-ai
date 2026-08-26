/**
 * Sprint 15.1 — Executive Dashboard read-only API routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { organizationGuard } = require("../../../middleware/organizationGuard");
const { requirePermission } = require("../../../middleware/requirePermission");
const { PERMISSIONS } = require("../../../security/permissions");
const { createExecutiveDashboardController } = require("./executiveDashboard.controller");
const { ExecutiveDashboardService } = require("../application/ExecutiveDashboardService");
const {
  operationalControlPlaneEmpty,
  emptyExecutiveDashboard
} = require("../../../core/operationalControlPlane");

function createExecutiveDashboardRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new ExecutiveDashboardService(deps);
  const controller = createExecutiveDashboardController(service);

  router.use(requireAtlasUser);
  router.use(organizationGuard());
  router.use(requirePermission(PERMISSIONS.DASHBOARD_EXECUTIVE));

  router.get("/", operationalControlPlaneEmpty(emptyExecutiveDashboard), controller.getReadModel.bind(controller));
  router.get("/summary", operationalControlPlaneEmpty(emptyExecutiveDashboard), controller.getSummary.bind(controller));
  router.get("/trends", operationalControlPlaneEmpty(emptyExecutiveDashboard), controller.getTrends.bind(controller));
  router.get("/kpis", operationalControlPlaneEmpty(emptyExecutiveDashboard), controller.getKpis.bind(controller));

  return router;
}

module.exports = createExecutiveDashboardRoutes;
