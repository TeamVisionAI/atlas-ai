/**
 * Sprint 15.1 — Executive Dashboard read model aggregate.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");
const { createEmptyMetrics, applyEventToReadModel } = require("./ExecutiveDashboardMetrics");

class ExecutiveDashboardReadModel {
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
    return new ExecutiveDashboardReadModel({
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
    return {
      organizationId: this.organizationId,
      updatedAt: this.updatedAt,
      organizationSummary: this.metrics.organizationSummary,
      prospectConversion: this.metrics.prospectConversion,
      interviewCompletion: this.metrics.interviewCompletion,
      leadSourceDistribution: this.metrics.leadSourceDistribution
    };
  }

  getTrends() {
    return {
      organizationId: this.organizationId,
      updatedAt: this.updatedAt,
      productionTrends: this.metrics.productionTrends
    };
  }

  getKpis() {
    return {
      organizationId: this.organizationId,
      updatedAt: this.updatedAt,
      kpis: this.metrics.kpis
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
   * @param {Object} row
   */
  static fromSnapshot(row) {
    if (!row) {
      return ExecutiveDashboardReadModel.empty();
    }

    return new ExecutiveDashboardReadModel({
      organizationId: row.organizationId,
      updatedAt: row.updatedAt,
      metrics: row.metrics || createEmptyMetrics(),
      prospects: row.prospects || {}
    });
  }
}

module.exports = {
  ExecutiveDashboardReadModel
};
