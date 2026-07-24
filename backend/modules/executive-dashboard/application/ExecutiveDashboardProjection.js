/**
 * Sprint 15.1 — Executive Dashboard projection (Projection Framework).
 */

const { Projection } = require("../../projections/interfaces/Projection");
const { ExecutiveDashboardRepository } = require("../infrastructure/ExecutiveDashboardRepository");
const {
  PROJECTION_STATUS,
  projectExecutiveDashboardEvent
} = require("./projectExecutiveDashboardEvent");

const PROJECTION_NAME = "executive-dashboard";

class ExecutiveDashboardProjection extends Projection {
  /**
   * @param {Object} [deps]
   * @param {ExecutiveDashboardRepository} [deps.repository]
   */
  constructor(deps = {}) {
    super();
    this.repository = deps.repository || new ExecutiveDashboardRepository();
    this.failures = [];
  }

  name() {
    return PROJECTION_NAME;
  }

  async initialize() {
    return undefined;
  }

  async handle(businessEvent) {
    const result = await projectExecutiveDashboardEvent(businessEvent, this.repository);

    if (result.status === PROJECTION_STATUS.FAILED) {
      const failure = {
        eventId: result.businessEventId || businessEvent?.eventId,
        eventType: result.eventType || businessEvent?.eventType,
        prospectId: result.prospectId ?? businessEvent?.prospectId ?? null,
        message: result.error?.message || "Unknown projection failure.",
        timestamp: new Date().toISOString()
      };

      this.failures.push(failure);
      console.error("[ExecutiveDashboardProjection] projection failed", failure);

      return {
        success: false,
        ...result
      };
    }

    if (result.status === PROJECTION_STATUS.CREATED) {
      return { success: true, projected: true };
    }

    if (result.status === PROJECTION_STATUS.SKIPPED) {
      return { success: true, projected: false, skipped: true };
    }

    return {
      success: true,
      projected: false,
      ignored: true,
      reason: result.reason
    };
  }

  async replay(events, options = {}) {
    if (options.rebuild) {
      await this.repository.clear();
    }

    const summary = {
      eventsRead: events.length,
      eventsApplied: 0,
      eventsSkipped: 0,
      eventsIgnored: 0,
      failures: []
    };

    for (const businessEvent of events) {
      const result = await projectExecutiveDashboardEvent(businessEvent, this.repository, {
        skipIdempotencyCheck: options.rebuild === true
      });

      if (result.status === PROJECTION_STATUS.CREATED) {
        if (options.rebuild) {
          await this.repository.markEventProcessed(
            businessEvent.eventId,
            businessEvent.metadata?.organizationId
          );
        }

        summary.eventsApplied += 1;
        continue;
      }

      if (result.status === PROJECTION_STATUS.SKIPPED) {
        summary.eventsSkipped += 1;
        continue;
      }

      if (result.status === PROJECTION_STATUS.IGNORED) {
        summary.eventsIgnored += 1;
        continue;
      }

      summary.failures.push({
        eventId: result.businessEventId || businessEvent.eventId,
        eventType: result.eventType || businessEvent.eventType,
        prospectId: result.prospectId ?? businessEvent.prospectId ?? null,
        message: result.error?.message || "Unknown projection failure."
      });
    }

    return summary;
  }

  health() {
    return {
      name: this.name(),
      status: this.failures.length === 0 ? "ok" : "degraded",
      failureCount: this.failures.length
    };
  }
}

module.exports = {
  ExecutiveDashboardProjection,
  PROJECTION_NAME
};
