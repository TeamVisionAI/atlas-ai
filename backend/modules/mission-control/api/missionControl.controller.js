/**
 * Sprint 15.0 — Mission Control REST controller (read-only).
 */

const { MissionControlService } = require("../application/MissionControlService");
const { resolveTenantOrganizationId } = require("../../../services/tenantContextService");

function createMissionControlController(service = new MissionControlService()) {
  function handleError(res, error, context) {
    console.error(`[mission-control/${context}]`, error.message);

    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "MISSION_CONTROL_ERROR",
      message: error.message || "Unexpected mission control error."
    });
  }

  return {
    async getReadModel(req, res) {
      try {
        const result = await service.getReadModel({
          organizationId: resolveTenantOrganizationId(req, req.query.organizationId)
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "getReadModel");
      }
    },

    async getSummary(req, res) {
      try {
        const result = await service.getSummary({
          organizationId: resolveTenantOrganizationId(req, req.query.organizationId)
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "getSummary");
      }
    },

    async getMetrics(req, res) {
      try {
        const result = await service.getMetrics({
          organizationId: resolveTenantOrganizationId(req, req.query.organizationId)
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "getMetrics");
      }
    }
  };
}

module.exports = {
  createMissionControlController
};
