/**
 * Sprint 15.1 — Executive Dashboard read API service.
 */

const { ExecutiveDashboardRepository } = require("../infrastructure/ExecutiveDashboardRepository");
const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");

class ExecutiveDashboardService {
  /**
   * @param {Object} [deps]
   * @param {ExecutiveDashboardRepository} [deps.repository]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new ExecutiveDashboardRepository();
  }

  async getReadModel(filters = {}) {
    const organizationId = filters.organizationId || DEFAULT_ORGANIZATION_ID;
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.toJSON();
  }

  async getSummary(filters = {}) {
    const organizationId = filters.organizationId || DEFAULT_ORGANIZATION_ID;
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getSummary();
  }

  async getTrends(filters = {}) {
    const organizationId = filters.organizationId || DEFAULT_ORGANIZATION_ID;
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getTrends();
  }

  async getKpis(filters = {}) {
    const organizationId = filters.organizationId || DEFAULT_ORGANIZATION_ID;
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getKpis();
  }
}

module.exports = {
  ExecutiveDashboardService
};
