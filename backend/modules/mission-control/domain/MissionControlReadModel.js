/**
 * Sprint 15.0 — Mission Control read model aggregate.
 * Projection-only state derived from Business Events.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");
const { createEmptyMetrics, applyEventToReadModel } = require("./MissionControlMetrics");

class MissionControlReadModel {
  /**
   * @param {Object} props
   */
  constructor(props = {}) {
    this.organizationId = props.organizationId || DEFAULT_ORGANIZATION_ID;
    this.updatedAt = props.updatedAt || new Date().toISOString();
    this.metrics = props.metrics || createEmptyMetrics();
    this.prospects = props.prospects || {};
  }

  static empty(organizationId = DEFAULT_ORGANIZATION_ID) {
    return new MissionControlReadModel({
      organizationId,
      updatedAt: new Date().toISOString(),
      metrics: createEmptyMetrics(),
      prospects: {}
    });
  }

  /**
   * @param {Object} event — BusinessEvent.toJSON()
   */
  applyEvent(event) {
    applyEventToReadModel(this, event);
    return this;
  }

  getMetrics() {
    return {
      organizationId: this.organizationId,
      updatedAt: this.updatedAt,
      ...this.metrics
    };
  }

  getSummary() {
    const activeProspectIds = Object.values(this.prospects)
      .filter((prospect) => prospect.isActive)
      .map((prospect) => prospect.prospectId);

    return {
      organizationId: this.organizationId,
      updatedAt: this.updatedAt,
      activeProspectCount: this.metrics.activeProspects,
      activeProspectIds,
      metrics: this.getMetrics()
    };
  }

  toJSON() {
    return {
      organizationId: this.organizationId,
      updatedAt: this.updatedAt,
      metrics: this.metrics,
      prospects: this.prospects
    };
  }

  /**
   * @param {Object} row — persisted aggregate snapshot
   */
  static fromSnapshot(row) {
    if (!row) {
      return MissionControlReadModel.empty();
    }

    return new MissionControlReadModel({
      organizationId: row.organizationId,
      updatedAt: row.updatedAt,
      metrics: row.metrics || createEmptyMetrics(),
      prospects: row.prospects || {}
    });
  }
}

module.exports = {
  MissionControlReadModel
};
