/**
 * Sprint 15.1 — Executive Dashboard read-only API routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { requirePermission } = require("../../../middleware/requirePermission");
const { PERMISSIONS } = require("../../../security/permissions");
const { createExecutiveDashboardController } = require("./executiveDashboard.controller");
const { ExecutiveDashboardService } = require("../application/ExecutiveDashboardService");

function createExecutiveDashboardRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new ExecutiveDashboardService(deps);
  const controller = createExecutiveDashboardController(service);

  router.use(requireAtlasUser);
  router.use(requirePermission(PERMISSIONS.DASHBOARD_EXECUTIVE));

  router.get("/", controller.getReadModel.bind(controller));
  router.get("/summary", controller.getSummary.bind(controller));
  router.get("/trends", controller.getTrends.bind(controller));
  router.get("/kpis", controller.getKpis.bind(controller));

  return router;
}

module.exports = createExecutiveDashboardRoutes;
