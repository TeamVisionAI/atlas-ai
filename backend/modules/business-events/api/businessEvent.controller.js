/**
 * Sprint 14.2 — Business Event REST controller (read-only).
 */

const { BusinessEventService } = require("../application/BusinessEventService");

function createBusinessEventController(service = new BusinessEventService()) {
  function handleError(res, error, context) {
    console.error(`[business-events/${context}]`, error.message);

    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "BUSINESS_EVENT_ERROR",
      message: error.message || "Unexpected business event error."
    });
  }

  return {
    async list(req, res) {
      try {
        const result = await service.list({
          prospectId: req.query.prospectId,
          eventType: req.query.eventType,
          correlationId: req.query.correlationId,
          from: req.query.from,
          to: req.query.to,
          organizationId: req.query.organizationId,
          limit: req.query.limit,
          offset: req.query.offset
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "list");
      }
    },

    async getById(req, res) {
      try {
        const event = await service.getById(req.params.id);
        return res.json({ event });
      } catch (error) {
        return handleError(res, error, "getById");
      }
    },

    async listByProspect(req, res) {
      try {
        const result = await service.listByProspect(req.params.id, {
          eventType: req.query.eventType,
          from: req.query.from,
          to: req.query.to,
          limit: req.query.limit,
          offset: req.query.offset
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "listByProspect");
      }
    }
  };
}

module.exports = {
  createBusinessEventController
};
