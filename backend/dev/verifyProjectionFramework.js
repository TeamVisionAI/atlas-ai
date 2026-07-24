/**
 * Sprint 14.4 — Projection Framework verification.
 * Run: node backend/dev/verifyProjectionFramework.js
 */

require("dotenv").config();

const assert = require("assert");
const { Projection } = require("../modules/projections/interfaces/Projection");
const { ProjectionEngine } = require("../modules/projections/application/ProjectionEngine");
const { InMemoryBusinessEventStore } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { SupabaseBusinessEventRepository } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEventService } = require("../modules/business-events/application/BusinessEventService");
const { InProcessEventPublisher } = require("../modules/business-events/application/InProcessEventPublisher");
const { EventFactory } = require("../modules/business-events/application/EventFactory");
const { InMemoryTimelineStore } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const { TimelineRepository } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const { TimelineProjection } = require("../modules/timeline/application/TimelineProjector");

class MemoryOnlyBusinessEventRepository extends SupabaseBusinessEventRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

class MemoryOnlyTimelineRepository extends TimelineRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

class CountingProjection extends Projection {
  constructor() {
    super();
    this.handled = [];
  }

  name() {
    return "counting";
  }

  async handle(event) {
    this.handled.push(event.eventId);
    return { success: true };
  }

  async replay(events) {
    this.handled = events.map((event) => event.eventId);
    return { eventsRead: events.length, handled: this.handled.length };
  }

  health() {
    return { name: this.name(), status: "ok", handled: this.handled.length };
  }
}

class FailingProjection extends Projection {
  name() {
    return "failing";
  }

  async handle(_event) {
    throw new Error("Simulated projection failure.");
  }

  async replay(events) {
    return { eventsRead: events.length, failures: [{ message: "Simulated replay failure." }] };
  }

  health() {
    return { name: this.name(), status: "degraded" };
  }
}

async function run() {
  console.log("Sprint 14.4 — Projection Framework verification\n");

  const eventStore = new InMemoryBusinessEventStore();
  const timelineStore = new InMemoryTimelineStore();
  const publisher = new InProcessEventPublisher();
  const eventRepository = new MemoryOnlyBusinessEventRepository(eventStore);
  const timelineRepository = new MemoryOnlyTimelineRepository(timelineStore);
  const engine = new ProjectionEngine({ publisher, businessEventRepository: eventRepository });
  const timelineProjection = new TimelineProjection({ repository: timelineRepository });
  const countingProjection = new CountingProjection();
  const failingProjection = new FailingProjection();

  await engine.register(timelineProjection);
  await engine.register(countingProjection);
  await engine.register(failingProjection);

  assert(engine.registry.listProjections().length === 3, "multiple projections registered");
  assert(engine.registry.getProjection("timeline"), "getProjection works");
  assert(engine.unregister("failing"), "unregister works");
  await engine.register(failingProjection);

  engine.start();

  const prospectId = "00000000-0000-4000-8000-000000000010";
  const businessEventService = new BusinessEventService({ repository: eventRepository, publisher });

  await businessEventService.record(
    EventFactory.prospectCreated({
      prospectId,
      actor: "AGENT:test",
      leadSource: { sourceType: "manual" },
      createdBy: "AGENT:test"
    })
  );

  assert(countingProjection.handled.length === 1, "counting projection received live event");
  assert(engine.failures.some((failure) => failure.projection === "failing"), "failing projection isolated");

  const replayResult = await engine.replay({ projectionName: "timeline", prospectId });
  assert(replayResult.projections.timeline.entriesSkipped >= 1, "replay works through ProjectionEngine");

  const health = engine.health();
  assert(health.some((entry) => entry.name === "timeline"), "health reports projections");

  console.log("verifyProjectionFramework: all checks passed");
}

run().catch((error) => {
  console.error("verifyProjectionFramework failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
