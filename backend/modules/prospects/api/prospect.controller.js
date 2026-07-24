/**
 * Sprint 14.1 — Prospect REST controller (API layer).
 */

const {
  ProspectApplicationService,
  actorFromRequest
} = require("../application/ProspectApplicationService");

function createProspectController(service = new ProspectApplicationService()) {
  function handleError(res, error, context) {
    console.error(`[prospects/${context}]`, error.message);

    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "PROSPECT_ERROR",
      message: error.message || "Unexpected prospect error."
    });
  }

  return {
    async create(req, res) {
      try {
        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.createProspect(req.body, actor);
        return res.status(201).json({ prospect });
      } catch (error) {
        return handleError(res, error, "create");
      }
    },

    async list(req, res) {
      try {
        const result = await service.listProspects({
          q: req.query.q,
          lifecycleState: req.query.lifecycleState,
          limit: req.query.limit,
          offset: req.query.offset,
          organizationId: req.query.organizationId
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "list");
      }
    },

    async getById(req, res) {
      try {
        const prospect = await service.getProspect(req.params.id);
        return res.json({ prospect });
      } catch (error) {
        return handleError(res, error, "getById");
      }
    },

    async update(req, res) {
      try {
        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.updateProspect(req.params.id, req.body, actor);
        return res.json({ prospect });
      } catch (error) {
        return handleError(res, error, "update");
      }
    },

    async archive(req, res) {
      try {
        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.archiveProspect(req.params.id, actor);
        return res.json({ prospect });
      } catch (error) {
        return handleError(res, error, "archive");
      }
    },

    async restore(req, res) {
      try {
        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.restoreProspect(req.params.id, actor);
        return res.json({ prospect });
      } catch (error) {
        return handleError(res, error, "restore");
      }
    },

    async assign(req, res) {
      try {
        const actor = actorFromRequest(req.atlasUser);
        const prospect = await service.assignProspect(req.params.id, req.body, actor);
        return res.json({ prospect });
      } catch (error) {
        return handleError(res, error, "assign");
      }
    },

    async merge(req, res) {
      try {
        const actor = actorFromRequest(req.atlasUser);
        const result = await service.mergeProspects(req.body, actor);
        return res.json(result);
      } catch (error) {
        return handleError(res, error, "merge");
      }
    }
  };
}

module.exports = {
  createProspectController
};
