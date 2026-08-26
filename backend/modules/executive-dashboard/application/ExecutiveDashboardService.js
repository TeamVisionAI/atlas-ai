/**
 * Sprint 15.1 — Executive Dashboard read API service.
 */

const { ExecutiveDashboardRepository } = require("../infrastructure/ExecutiveDashboardRepository");

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    const error = new Error("organizationId is required for Executive Dashboard reads.");
    error.statusCode = 403;
    error.publicCode = "TENANT_CONTEXT_REQUIRED";
    throw error;
  }

  return organizationId;
}

class ExecutiveDashboardService {
  /**
   * @param {Object} [deps]
   * @param {ExecutiveDashboardRepository} [deps.repository]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new ExecutiveDashboardRepository();
  }

  async getReadModel(filters = {}) {
    const organizationId = requireOrganizationId(filters.organizationId);
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.toJSON();
  }

  async getSummary(filters = {}) {
    const organizationId = requireOrganizationId(filters.organizationId);
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getSummary();
  }

  async getTrends(filters = {}) {
    const organizationId = requireOrganizationId(filters.organizationId);
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getTrends();
  }

  async getKpis(filters = {}) {
    const organizationId = requireOrganizationId(filters.organizationId);
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getKpis();
  }
}

module.exports = {
  ExecutiveDashboardService
};
