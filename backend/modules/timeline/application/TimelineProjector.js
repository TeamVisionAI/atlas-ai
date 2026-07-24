/**
 * Sprint 14.4 — Timeline read-model projection (Projection Framework).
 * Sprint 14.3 — event projection logic preserved via TimelineProjection helpers.
 */

const { Projection } = require("../../projections/interfaces/Projection");
const { TimelineRepository } = require("../infrastructure/persistence/TimelineRepository");
const {
  PROJECTION_STATUS,
  projectBusinessEvent
} = require("./TimelineProjection");

const PROJECTION_NAME = "timeline";

class TimelineProjection extends Projection {
  /**
   * @param {Object} [deps]
   * @param {TimelineRepository} [deps.repository]
   */
  constructor(deps = {}) {
    super();
    this.repository = deps.repository || new TimelineRepository();
    this.failures = [];
  }

  name() {
    return PROJECTION_NAME;
  }

  async initialize() {
    return undefined;
  }

  /**
   * @param {Object} businessEvent
   */
  async handle(businessEvent) {
    const result = await projectBusinessEvent(businessEvent, this.repository);

    if (result.status === PROJECTION_STATUS.FAILED) {
      const failure = {
        eventId: result.businessEventId || businessEvent?.eventId,
        eventType: result.eventType || businessEvent?.eventType,
        prospectId: result.prospectId ?? businessEvent?.prospectId ?? null,
        message: result.error?.message || "Unknown projection failure.",
        timestamp: new Date().toISOString()
      };

      this.failures.push(failure);
      console.error("[TimelineProjection] projection failed", failure);

      return {
        success: false,
        ...result
      };
    }

    if (result.status === PROJECTION_STATUS.CREATED) {
      return {
        success: true,
        projected: true,
        entry: result.entry?.toJSON?.() || result.entry
      };
    }

    if (result.status === PROJECTION_STATUS.SKIPPED) {
      return {
        success: true,
        projected: false,
        skipped: true,
        entry: result.entry?.toJSON?.() || result.entry
      };
    }

    return {
      success: true,
      projected: false,
      ignored: true,
      reason: result.reason
    };
  }

  /**
   * @param {Object[]} events
   */
  async replay(events) {
    const summary = {
      eventsRead: events.length,
      entriesCreated: 0,
      entriesSkipped: 0,
      entriesIgnored: 0,
      failures: []
    };

    for (const businessEvent of events) {
      const result = await projectBusinessEvent(businessEvent, this.repository);

      if (result.status === PROJECTION_STATUS.CREATED) {
        summary.entriesCreated += 1;
        continue;
      }

      if (result.status === PROJECTION_STATUS.SKIPPED) {
        summary.entriesSkipped += 1;
        continue;
      }

      if (result.status === PROJECTION_STATUS.IGNORED) {
        summary.entriesIgnored += 1;
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

/** @deprecated Use TimelineProjection — kept for backward compatibility */
class TimelineProjector extends TimelineProjection {
  register() {
    throw new Error(
      "TimelineProjector.register() is deprecated. Register TimelineProjection with ProjectionEngine."
    );
  }

  unregister() {
    throw new Error(
      "TimelineProjector.unregister() is deprecated. Use ProjectionEngine.stop()."
    );
  }
}

module.exports = {
  TimelineProjection,
  TimelineProjector,
  PROJECTION_NAME
};
