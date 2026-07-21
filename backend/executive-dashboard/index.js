/**
 * Sprint 12.6 — Executive Dashboard public exports.
 */

const { ExecutiveDashboardService } = require("./ExecutiveDashboardService");
const { MetricsEngine } = require("./MetricsEngine");
const { DailyStatistics } = require("./DailyStatistics");

/**
 * @param {Object} options
 * @param {import('../communication/events/EventBus').EventBus} options.eventBus
 */
function createExecutiveDashboardService(options = {}) {
  if (!options.eventBus) {
    throw new Error("ExecutiveDashboardService requires eventBus");
  }

  return new ExecutiveDashboardService({
    eventBus: options.eventBus
  });
}

let singleton = null;

function getExecutiveDashboardService(eventBus) {
  if (!singleton) {
    singleton = createExecutiveDashboardService({ eventBus });
  }

  return singleton;
}

function resetExecutiveDashboardService() {
  if (singleton) {
    singleton.unsubscribe();
  }

  singleton = null;
}

module.exports = {
  ExecutiveDashboardService,
  MetricsEngine,
  DailyStatistics,
  createExecutiveDashboardService,
  getExecutiveDashboardService,
  resetExecutiveDashboardService
};
