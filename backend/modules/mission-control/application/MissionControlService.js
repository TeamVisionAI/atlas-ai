/**
 * Sprint 15.0 — Mission Control read API service.
 */

const { MissionControlRepository } = require("../infrastructure/MissionControlRepository");
const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");

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
    const organizationId = filters.organizationId || DEFAULT_ORGANIZATION_ID;
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.toJSON();
  }

  /**
   * @param {Object} [filters]
   */
  async getSummary(filters = {}) {
    const organizationId = filters.organizationId || DEFAULT_ORGANIZATION_ID;
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getSummary();
  }

  /**
   * @param {Object} [filters]
   */
  async getMetrics(filters = {}) {
    const organizationId = filters.organizationId || DEFAULT_ORGANIZATION_ID;
    const readModel = await this.repository.loadReadModel(organizationId);
    return readModel.getMetrics();
  }
}

module.exports = {
  MissionControlService
};
