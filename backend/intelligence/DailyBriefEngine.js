/**
 * Release 1.3 — Daily Brief Engine orchestrator.
 */

const crypto = require("crypto");
const { BriefEvent } = require("./BriefEvents");
const briefStore = require("./BriefStore");
const { collectOrganizationSnapshot } = require("./OrganizationSnapshot");
const { collectMetrics } = require("./MetricsCollector");
const { analyzeTrends } = require("./TrendAnalyzer");
const { generateInsights } = require("./InsightGenerator");
const { determinePriorities } = require("./PriorityEngine");
const { generateRecommendations } = require("./RecommendationEngine");
const { buildDailyBrief } = require("./DailyBriefBuilder");
const { formatBrief } = require("./BriefFormatter");

class DailyBriefEngine {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
  }

  /**
   * Generate a daily brief for an organization.
   *
   * @param {string} organizationId
   * @param {Object} [options]
   * @param {Object} [options.organization]
   * @param {Object} [options.packageMetrics]
   * @param {Date} [options.referenceDate]
   */
  async generateDailyBrief(organizationId, options = {}) {
    const startedAt = Date.now();

    try {
      const snapshot = await collectOrganizationSnapshot({
        organizationId,
        organization: options.organization,
        packageMetrics: options.packageMetrics,
        referenceDate: options.referenceDate || new Date()
      });

      await briefStore.saveSnapshot({
        organizationId,
        snapshotId: crypto.randomUUID(),
        capturedAt: snapshot.capturedAt
      });

      const metrics = collectMetrics(snapshot);
      const history = await briefStore.listMetricsHistory(organizationId, 1);
      const trends = analyzeTrends(metrics, history);

      await briefStore.saveMetricsHistory({
        organizationId,
        date: metrics.date,
        ...metrics
      });

      this.eventBus?.emit(BriefEvent.METRICS_COLLECTED, {
        organizationId,
        metrics
      });

      const insights = generateInsights(snapshot, metrics, trends);

      this.eventBus?.emit(BriefEvent.INSIGHTS_GENERATED, {
        organizationId,
        count: insights.length
      });

      const priorities = determinePriorities(snapshot, metrics, insights);
      const recommendations = generateRecommendations(snapshot, metrics, priorities, insights);

      this.eventBus?.emit(BriefEvent.RECOMMENDATIONS_GENERATED, {
        organizationId,
        count: recommendations.length
      });

      const brief = buildDailyBrief({
        snapshot,
        metrics,
        trends,
        insights,
        priorities,
        recommendations,
        organizationVersion: snapshot.organization?.version || 1
      });

      brief.generationTimeMs = Date.now() - startedAt;

      await briefStore.saveBrief(organizationId, brief);

      this.eventBus?.emit(BriefEvent.GENERATED, {
        organizationId,
        briefId: brief.id,
        date: brief.date,
        generationTimeMs: brief.generationTimeMs
      });

      return brief;
    } catch (error) {
      await briefStore.recordFailure();

      this.eventBus?.emit(BriefEvent.FAILED, {
        organizationId,
        message: error.message
      });

      throw error;
    }
  }

  async getDailyBrief(organizationId, date) {
    return briefStore.getBrief(organizationId, date);
  }

  async getLatestBrief(organizationId) {
    return briefStore.getLatestBrief(organizationId);
  }

  formatBrief(brief, format = "json") {
    return formatBrief(brief, format);
  }

  async publishBrief(organizationId, date) {
    const brief = date
      ? await briefStore.getBrief(organizationId, date)
      : await briefStore.getLatestBrief(organizationId);

    if (!brief) {
      throw new Error("Brief not found");
    }

    this.eventBus?.emit(BriefEvent.PUBLISHED, {
      organizationId,
      briefId: brief.id,
      date: brief.date
    });

    return brief;
  }

  async getAnalytics() {
    return briefStore.getAnalytics();
  }
}

function createDailyBriefEngine(deps = {}) {
  return new DailyBriefEngine(deps);
}

function resetDailyBriefEngine() {
  briefStore.clearStore();
}

module.exports = {
  DailyBriefEngine,
  createDailyBriefEngine,
  resetDailyBriefEngine
};
