/**
 * Sprint 14.4 — Coordinates all read-model projections from Business Events.
 */

const { SupabaseBusinessEventRepository } = require("../../business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { sortBusinessEventsChronologically } = require("../../timeline/application/TimelineProjection");
const { ProjectionRegistry } = require("./ProjectionRegistry");
const { ProjectionLifecycle, PROJECTION_STATES } = require("./ProjectionLifecycle");

const REPLAY_PAGE_SIZE = 100;

class ProjectionEngine {
  /**
   * @param {Object} deps
   * @param {import('../../business-events/application/InProcessEventPublisher').InProcessEventPublisher} deps.publisher
   * @param {SupabaseBusinessEventRepository} [deps.businessEventRepository]
   * @param {ProjectionRegistry} [deps.registry]
   */
  constructor(deps = {}) {
    if (!deps.publisher) {
      throw new Error("ProjectionEngine requires a Business Event publisher.");
    }

    this.publisher = deps.publisher;
    this.businessEventRepository =
      deps.businessEventRepository || new SupabaseBusinessEventRepository();
    this.registry = deps.registry || new ProjectionRegistry();
    this.lifecycle = new ProjectionLifecycle();
    this.failures = [];
    this.started = false;
    this._handler = this.dispatch.bind(this);
  }

  /**
   * @param {import('../interfaces/Projection').Projection} projection
   */
  async register(projection) {
    const registered = this.registry.register(projection);
    this.lifecycle.markRegistered(registered.name());
    await registered.initialize();
    this.lifecycle.markInitialized(registered.name());

    if (this.started) {
      this.lifecycle.markRunning(registered.name());
    }

    return registered;
  }

  /**
   * @param {string} name
   */
  unregister(name) {
    this.lifecycle.markStopped(name);
    return this.registry.unregister(name);
  }

  /**
   * Subscribe to Business Events and mark projections running.
   */
  start() {
    if (!this.started) {
      this.publisher.subscribe("*", this._handler);
      this.started = true;
    }

    for (const projection of this.registry.listProjections()) {
      this.lifecycle.markRunning(projection.name());
    }
  }

  stop() {
    if (this.started) {
      this.publisher.unsubscribe("*", this._handler);
      this.started = false;
    }

    for (const projection of this.registry.listProjections()) {
      this.lifecycle.markStopped(projection.name());
    }
  }

  /**
   * @param {Object} event — BusinessEvent.toJSON()
   */
  async dispatch(event) {
    for (const projection of this.registry.listProjections()) {
      if (!this.lifecycle.isRunning(projection.name())) {
        continue;
      }

      try {
        const result = await projection.handle(event);

        if (result?.success === false) {
          this._recordFailure(projection.name(), event, result);
        }
      } catch (error) {
        this._recordFailure(projection.name(), event, error);
      }
    }
  }

  _recordFailure(projectionName, event, errorOrResult) {
    const failure = {
      projection: projectionName,
      eventId: event?.eventId,
      eventType: event?.eventType,
      prospectId: event?.prospectId ?? null,
      message: errorOrResult?.message || errorOrResult?.error?.message || "Unknown projection failure.",
      timestamp: new Date().toISOString()
    };

    this.failures.push(failure);

    console.error(`[ProjectionEngine:${projectionName}] projection failed`, failure);
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
   * @param {string} [options.projectionName]
   * @param {string} [options.prospectId]
   * @param {string} [options.from]
   * @param {string} [options.to]
   * @param {string} [options.organizationId]
   */
  async replay(options = {}) {
    const events = await this.loadEventsChronologically(options);
    const targets = options.projectionName
      ? [this.registry.getProjection(options.projectionName)].filter(Boolean)
      : this.registry.listProjections();

    const summary = {
      eventsRead: events.length,
      projections: {}
    };

    for (const projection of targets) {
      summary.projections[projection.name()] = await projection.replay(events);
    }

    return summary;
  }

  /**
   * @returns {Object[]}
   */
  health() {
    return this.registry.listProjections().map((projection) => ({
      ...projection.health(),
      lifecycle: this.lifecycle.getState(projection.name()) || PROJECTION_STATES.REGISTERED
    }));
  }
}

module.exports = {
  ProjectionEngine,
  REPLAY_PAGE_SIZE
};
