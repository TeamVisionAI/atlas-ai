/**
 * Sprint 14.1 — Prospect Engine routes (API layer).
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { createProspectController } = require("./prospect.controller");
const { ProspectApplicationService } = require("../application/ProspectApplicationService");

function createProspectRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new ProspectApplicationService(deps);
  const controller = createProspectController(service);

  router.use(requireAtlasUser);

  router.post("/merge", controller.merge.bind(controller));
  router.get("/", controller.list.bind(controller));
  router.post("/", controller.create.bind(controller));

  if (deps.prospectEventsHandler) {
    router.get("/:id/events", deps.prospectEventsHandler);
  }

  router.get("/:id", controller.getById.bind(controller));
  router.patch("/:id", controller.update.bind(controller));
  router.post("/:id/archive", controller.archive.bind(controller));
  router.post("/:id/restore", controller.restore.bind(controller));
  router.post("/:id/assign", controller.assign.bind(controller));

  return router;
}

module.exports = createProspectRoutes;
