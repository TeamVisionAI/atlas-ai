/**
 * Release 1.3 — Daily Brief Engine exports.
 */

const { BriefEvent } = require("./BriefEvents");
const briefStore = require("./BriefStore");
const { collectOrganizationSnapshot, isToday } = require("./OrganizationSnapshot");
const { collectMetrics } = require("./MetricsCollector");
const { analyzeTrends, METRIC_KEYS } = require("./TrendAnalyzer");
const { generateInsights } = require("./InsightGenerator");
const { determinePriorities } = require("./PriorityEngine");
const { generateRecommendations } = require("./RecommendationEngine");
const { buildDailyBrief } = require("./DailyBriefBuilder");
const { formatBrief, formatAsJson, formatAsMarkdown } = require("./BriefFormatter");
const {
  DailyBriefEngine,
  createDailyBriefEngine,
  resetDailyBriefEngine
} = require("./DailyBriefEngine");

module.exports = {
  BriefEvent,
  briefStore,
  collectOrganizationSnapshot,
  isToday,
  collectMetrics,
  analyzeTrends,
  METRIC_KEYS,
  generateInsights,
  determinePriorities,
  generateRecommendations,
  buildDailyBrief,
  formatBrief,
  formatAsJson,
  formatAsMarkdown,
  DailyBriefEngine,
  createDailyBriefEngine,
  resetDailyBriefEngine
};
