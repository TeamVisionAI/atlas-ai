/**
 * Sprint 14.3 — Timeline read-only API routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { createTimelineController } = require("./timeline.controller");
const { TimelineService } = require("../application/TimelineService");

function createTimelineRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new TimelineService(deps);
  const controller = createTimelineController(service);

  router.use(requireAtlasUser);

  router.get("/", controller.list.bind(controller));

  return router;
}

function createProspectTimelineHandler(deps = {}) {
  const service = deps.service || new TimelineService(deps);
  const controller = createTimelineController(service);
  return controller.getProspectTimeline.bind(controller);
}

module.exports = createTimelineRoutes;
module.exports.createProspectTimelineHandler = createProspectTimelineHandler;
