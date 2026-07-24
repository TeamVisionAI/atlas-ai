/**
 * Sprint 14.3.1 — Rebuild Timeline projection from persisted Business Events.
 * Sprint 14.4 — replay coordinated through ProjectionEngine when provided.
 */

const { SupabaseBusinessEventRepository } = require("../../business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { TimelineRepository } = require("../infrastructure/persistence/TimelineRepository");
const { PROJECTION_NAME } = require("./TimelineProjector");
const {
  PROJECTION_STATUS,
  projectBusinessEvent,
  sortBusinessEventsChronologically
} = require("./TimelineProjection");

const REPLAY_PAGE_SIZE = 100;

class TimelineReplayService {
  /**
   * @param {Object} deps
   * @param {import('../../projections/application/ProjectionEngine').ProjectionEngine} [deps.projectionEngine]
   * @param {import('./TimelineProjector').TimelineProjection} [deps.timelineProjection]
   * @param {SupabaseBusinessEventRepository} [deps.businessEventRepository]
   * @param {TimelineRepository} [deps.timelineRepository]
   */
  constructor(deps = {}) {
    this.projectionEngine = deps.projectionEngine || null;
    this.timelineProjection = deps.timelineProjection || null;
    this.businessEventRepository =
      deps.businessEventRepository || new SupabaseBusinessEventRepository();
    this.timelineRepository = deps.timelineRepository || new TimelineRepository();
  }

  /**
   * @param {Object} [filters]
   */
  async loadEventsChronologically(filters = {}) {
    const collected = [];
    let offset = 0;

    while (true) {
      const page = await this.businessEventRepository.search({
        prospectId: filters.prospectId,
        from: filters.from,
        to: filters.to,
        organizationId: filters.organizationId,
        limit: REPLAY_PAGE_SIZE,
        offset
      });

      collected.push(...page.items.map((event) => event.toJSON()));

      if (page.items.length < REPLAY_PAGE_SIZE) {
        break;
      }

      offset += REPLAY_PAGE_SIZE;
    }

    return sortBusinessEventsChronologically(collected);
  }

  /**
   * @param {Object} [options]
   */
  async replay(options = {}) {
    if (this.projectionEngine) {
      const engineResult = await this.projectionEngine.replay({
        projectionName: PROJECTION_NAME,
        prospectId: options.prospectId,
        from: options.from,
        to: options.to,
        organizationId: options.organizationId
      });

      return (
        engineResult.projections[PROJECTION_NAME] || {
          eventsRead: engineResult.eventsRead,
          entriesCreated: 0,
          entriesSkipped: 0,
          entriesIgnored: 0,
          failures: []
        }
      );
    }

    if (this.timelineProjection) {
      const events = await this.loadEventsChronologically(options);
      return this.timelineProjection.replay(events);
    }

    const events = await this.loadEventsChronologically(options);
    const summary = {
      eventsRead: 0,
      entriesCreated: 0,
      entriesSkipped: 0,
      entriesIgnored: 0,
      failures: []
    };

    for (const businessEvent of events) {
      summary.eventsRead += 1;

      const result = await projectBusinessEvent(businessEvent, this.timelineRepository);

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
}

module.exports = {
  TimelineReplayService,
  REPLAY_PAGE_SIZE
};
