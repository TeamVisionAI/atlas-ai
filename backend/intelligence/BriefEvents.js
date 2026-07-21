/**
 * Release 1.3 — Daily Brief event constants.
 */

const BriefEvent = Object.freeze({
  GENERATED: "brief.generated",
  FAILED: "brief.failed",
  PUBLISHED: "brief.published",
  METRICS_COLLECTED: "brief.metrics.collected",
  INSIGHTS_GENERATED: "brief.insights.generated",
  RECOMMENDATIONS_GENERATED: "brief.recommendations.generated"
});

module.exports = {
  BriefEvent
};
