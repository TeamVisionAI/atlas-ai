/**
 * Sprint 15.0 — Mission Control read-only API routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { organizationGuard } = require("../../../middleware/organizationGuard");
const { createMissionControlController } = require("./missionControl.controller");
const { MissionControlService } = require("../application/MissionControlService");
const {
  operationalControlPlaneEmpty,
  emptyMissionControlReadModel,
  emptyMissionControlSummary
} = require("../../../core/operationalControlPlane");

function createMissionControlRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new MissionControlService(deps);
  const controller = createMissionControlController(service);

  router.use(requireAtlasUser);
  router.use(organizationGuard());

  router.get("/", operationalControlPlaneEmpty(emptyMissionControlReadModel), controller.getReadModel.bind(controller));
  router.get("/summary", operationalControlPlaneEmpty(emptyMissionControlSummary), controller.getSummary.bind(controller));
  router.get("/metrics", operationalControlPlaneEmpty(emptyMissionControlSummary), controller.getMetrics.bind(controller));

  return router;
}

module.exports = createMissionControlRoutes;
