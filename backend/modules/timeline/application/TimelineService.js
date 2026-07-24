/**
 * Sprint 14.3 — Timeline read service (query projection store).
 */

const { TimelineDomainError } = require("../domain/TimelineEntry");
const { TimelineRepository } = require("../infrastructure/persistence/TimelineRepository");

class TimelineService {
  /**
   * @param {Object} [deps]
   * @param {TimelineRepository} [deps.repository]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new TimelineRepository();
  }

  _present(entry) {
    return entry.toJSON();
  }

  async getByProspect(prospectId, filters = {}) {
    if (!prospectId) {
      throw new TimelineDomainError("prospectId is required.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    const result = await this.repository.findByProspect(prospectId, filters);

    return {
      items: result.items.map((entry) => this._present(entry)),
      total: result.total,
      limit: result.limit,
      offset: result.offset
    };
  }

  async getLatestForProspect(prospectId) {
    const entry = await this.repository.findLatest(prospectId);
    return entry ? this._present(entry) : null;
  }

  async search(filters = {}) {
    const result = await this.repository.search(filters);

    return {
      items: result.items.map((entry) => this._present(entry)),
      total: result.total,
      limit: result.limit,
      offset: result.offset
    };
  }

  async paginate(filters = {}) {
    return this.search(filters);
  }
}

module.exports = {
  TimelineService
};
