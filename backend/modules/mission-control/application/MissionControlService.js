/**
 * Sprint 15.0 — Mission Control read API service.
 */

const { MissionControlRepository } = require("../infrastructure/MissionControlRepository");

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    const error = new Error("organizationId is required for Mission Control reads.");
    error.statusCode = 403;
    error.publicCode = "TENANT_CONTEXT_REQUIRED";
    throw error;
  }

  return organizationId;
}

class MissionControlService {
  /**
   * @param {Object} [deps]
   * @param {MissionControlRepository} [deps.repository]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new MissionControlRepository();
  }

  /**
   * @param {Object} [filters]
   */
  async getReadModel(filters = {}) {
    const organizationId = requireOrganizationId(filters.organizationId);
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.toJSON();
  }

  /**
   * @param {Object} [filters]
   */
  async getSummary(filters = {}) {
    const organizationId = requireOrganizationId(filters.organizationId);
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getSummary();
  }

  /**
   * @param {Object} [filters]
   */
  async getMetrics(filters = {}) {
    const organizationId = requireOrganizationId(filters.organizationId);
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getMetrics();
  }
}

module.exports = {
  MissionControlService
};
