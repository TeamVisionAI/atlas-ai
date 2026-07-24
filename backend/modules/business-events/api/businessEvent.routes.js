/**
 * Sprint 14.2 — Business Event read-only API routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { createBusinessEventController } = require("./businessEvent.controller");
const { BusinessEventService } = require("../application/BusinessEventService");

function createBusinessEventRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new BusinessEventService(deps);
  const controller = createBusinessEventController(service);

  router.use(requireAtlasUser);

  router.get("/", controller.list.bind(controller));
  router.get("/:id", controller.getById.bind(controller));

  return router;
}

function createProspectEventsHandler(deps = {}) {
  const service = deps.service || new BusinessEventService(deps);
  const controller = createBusinessEventController(service);
  return controller.listByProspect.bind(controller);
}

module.exports = createBusinessEventRoutes;
module.exports.createProspectEventsHandler = createProspectEventsHandler;
