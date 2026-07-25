/**
 * Sprint 15.1 — Executive Dashboard REST controller (read-only).
 */

const { ExecutiveDashboardService } = require("../application/ExecutiveDashboardService");
const { resolveTenantOrganizationId } = require("../../../services/tenantContextService");

function createExecutiveDashboardController(service = new ExecutiveDashboardService()) {
  function handleError(res, error, context) {
    console.error(`[executive-dashboard/${context}]`, error.message);

    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "EXECUTIVE_DASHBOARD_ERROR",
      message: error.message || "Unexpected executive dashboard error."
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

    async getTrends(req, res) {
      try {
        const result = await service.getTrends({
          organizationId: resolveTenantOrganizationId(req, req.query.organizationId)
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "getTrends");
      }
    },

    async getKpis(req, res) {
      try {
        const result = await service.getKpis({
          organizationId: resolveTenantOrganizationId(req, req.query.organizationId)
        });

        return res.json(result);
      } catch (error) {
        return handleError(res, error, "getKpis");
      }
    }
  };
}

module.exports = {
  createExecutiveDashboardController
};
