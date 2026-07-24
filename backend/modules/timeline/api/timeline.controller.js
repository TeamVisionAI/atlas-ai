/**
 * Sprint 14.3 — Timeline REST controller (read-only).
 */

const { TimelineService } = require("../application/TimelineService");

function createTimelineController(service = new TimelineService()) {
  function handleError(res, error, context) {
    console.error(`[timeline/${context}]`, error.message);

    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "TIMELINE_ERROR",
      message: error.message || "Unexpected timeline error."
    });
  }

  return {
    async list(req, res) {
      try {
        const result = await service.search({
          prospectId: req.query.prospectId,
          entryType: req.query.entryType,
          eventType: req.query.eventType,
          organizationId: req.query.organizationId,
          q: req.query.q,
          limit: req.query.limit,
          offset: req.query.offset
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "list");
      }
    },

    async getProspectTimeline(req, res) {
      try {
        const result = await service.getByProspect(req.params.id, {
          entryType: req.query.entryType,
          eventType: req.query.eventType,
          limit: req.query.limit,
          offset: req.query.offset
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "getProspectTimeline");
      }
    }
  };
}

module.exports = {
  createTimelineController
};
