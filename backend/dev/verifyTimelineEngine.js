/**
 * Sprint 14.3 / 14.4 — Timeline Engine verification.
 * Run: node backend/dev/verifyTimelineEngine.js
 */

require("dotenv").config();

const assert = require("assert");
const { InMemoryBusinessEventStore } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { SupabaseBusinessEventRepository } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEventService } = require("../modules/business-events/application/BusinessEventService");
const { InProcessEventPublisher } = require("../modules/business-events/application/InProcessEventPublisher");
const { EventFactory } = require("../modules/business-events/application/EventFactory");
const { LEAD_EVENTS } = require("../modules/business-events/domain/EventTypes");
const { ProjectionEngine } = require("../modules/projections/application/ProjectionEngine");
const { InMemoryTimelineStore } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const { TimelineRepository } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const { TimelineProjection } = require("../modules/timeline/application/TimelineProjector");
const { TimelineReplayService } = require("../modules/timeline/application/TimelineReplayService");
const { TimelineService } = require("../modules/timeline/application/TimelineService");
const { projectBusinessEvent, PROJECTION_STATUS } = require("../modules/timeline/application/TimelineProjection");
const { createTimelineModule } = require("../modules/timeline");
const { TIMELINE_ENTRY_TYPES } = require("../modules/timeline/domain/TimelineEntryType");

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

async function run() {
  console.log("Sprint 14.3 / 14.4 — Timeline Engine verification\n");

  const eventStore = new InMemoryBusinessEventStore();
  const timelineStore = new InMemoryTimelineStore();
  const publisher = new InProcessEventPublisher();
  const eventRepository = new MemoryOnlyBusinessEventRepository(eventStore);
  const timelineRepository = new MemoryOnlyTimelineRepository(timelineStore);
  const businessEventService = new BusinessEventService({ repository: eventRepository, publisher });
  const projectionEngine = new ProjectionEngine({
    publisher,
    businessEventRepository: eventRepository
  });
  const timelineProjection = new TimelineProjection({ repository: timelineRepository });

  await projectionEngine.register(timelineProjection);
  projectionEngine.start();

  const timelineService = new TimelineService({ repository: timelineRepository });
  const replayService = new TimelineReplayService({
    projectionEngine,
    timelineProjection,
    businessEventRepository: eventRepository,
    timelineRepository
  });

  const prospectId = "00000000-0000-4000-8000-000000000088";
  const otherProspectId = "00000000-0000-4000-8000-000000000077";

  const createdEvent = await businessEventService.record(
    EventFactory.prospectCreated({
      prospectId,
      actor: "AGENT:test",
      leadSource: { sourceType: "manual" },
      createdBy: "AGENT:test"
    })
  );

  await businessEventService.record(
    EventFactory.prospectAssigned({
      prospectId,
      actor: "AGENT:test",
      assignedAgentId: "00000000-0000-4000-8000-000000000001"
    })
  );

  const timeline = await timelineService.getByProspect(prospectId);
  assert(timeline.total === 2, "projector created two timeline entries");
  assert(
    timeline.items.some((entry) => entry.eventType === LEAD_EVENTS.PROSPECT_CREATED),
    "prospect_created projected"
  );
  assert(
    timeline.items.some((entry) => entry.entryType === TIMELINE_ENTRY_TYPES.ASSIGNMENT),
    "assignment entry type mapped"
  );

  const replaySameEvent = await projectBusinessEvent(
    createdEvent.toJSON(),
    timelineRepository
  );
  assert(replaySameEvent.status === PROJECTION_STATUS.SKIPPED, "same event does not duplicate");

  const replaySummary = await replayService.replay({ prospectId });
  assert(replaySummary.eventsRead === 2, "replay reads persisted events");
  assert(replaySummary.entriesCreated === 0, "replay skips existing entries");
  assert(replaySummary.entriesSkipped === 2, "replay reports skipped idempotent entries");
  assert(replaySummary.failures.length === 0, "replay has no failures");

  await businessEventService.record(
    EventFactory.prospectCreated({
      prospectId: otherProspectId,
      actor: "AGENT:test",
      leadSource: { sourceType: "manual" },
      createdBy: "AGENT:test"
    })
  );

  const scopedReplay = await replayService.replay({ prospectId: otherProspectId });
  assert(scopedReplay.eventsRead === 1, "prospect-scoped replay reads one event");
  assert(scopedReplay.entriesSkipped === 1, "scoped replay skips existing projected entry");

  const chronological = await projectionEngine.loadEventsChronologically({ prospectId });
  assert(chronological.length === 2, "chronological loader returns prospect events");
  assert(
    new Date(chronological[0].timestamp) <= new Date(chronological[1].timestamp),
    "chronological ordering is deterministic"
  );

  class FailingTimelineRepository extends MemoryOnlyTimelineRepository {
    constructor(store) {
      super(store);
      this.failOnceForEventId = null;
    }

    async append(entry) {
      if (this.failOnceForEventId === entry.toJSON().entryId) {
        throw new Error("Simulated projection persistence failure.");
      }

      return super.append(entry);
    }
  }

  const failingStore = new InMemoryTimelineStore();
  const failingRepository = new FailingTimelineRepository(failingStore);
  const failingProjection = new TimelineProjection({ repository: failingRepository });

  const failingEvent = EventFactory.prospectUpdated({
    prospectId,
    actor: "AGENT:test",
    changedFields: ["displayName"]
  }).toJSON();

  failingRepository.failOnceForEventId = failingEvent.eventId;

  const failureResult = await failingProjection.handle(failingEvent);
  assert(failureResult.success === false, "projection failure is reported");
  assert(failingProjection.failures.length === 1, "projection records failure");
  assert(failingProjection.failures[0].eventId === failingEvent.eventId, "failure includes eventId");

  const recoveryRepository = new MemoryOnlyTimelineRepository(failingStore);
  const recoveryProjection = new TimelineProjection({ repository: recoveryRepository });
  const recoveryEngine = new ProjectionEngine({
    publisher: new InProcessEventPublisher(),
    businessEventRepository: eventRepository
  });

  await recoveryEngine.register(recoveryProjection);

  const recoveryReplay = await new TimelineReplayService({
    projectionEngine: recoveryEngine,
    timelineProjection: recoveryProjection,
    businessEventRepository: eventRepository
  }).replay({ prospectId });

  assert(
    recoveryReplay.entriesCreated >= 1,
    "failed event can be recovered through replay after repair"
  );

  const latest = await timelineService.getLatestForProspect(prospectId);
  assert(latest.eventType === LEAD_EVENTS.PROSPECT_ASSIGNED, "findLatest returns newest entry");

  const search = await timelineService.search({ prospectId, limit: 1, offset: 0 });
  assert(search.items.length === 1, "paginate limits results");
  assert(search.total === 2, "paginate reports total");

  const module = createTimelineModule({
    repository: timelineRepository,
    projectionEngine,
    businessEventRepository: eventRepository
  });

  assert(typeof module.routes === "function", "timeline routes exported");
  assert(typeof module.prospectTimelineHandler === "function", "prospect timeline handler exported");
  assert(module.replayService, "replay service exported");
  assert(module.timelineProjection, "timeline projection exported");

  await businessEventService.record(
    EventFactory.prospectUpdated({
      prospectId,
      actor: "AGENT:test",
      changedFields: ["displayName"]
    })
  );

  const afterUpdate = await timelineService.getByProspect(prospectId);
  assert(afterUpdate.total === 3, "updated event projected to timeline");

  console.log("verifyTimelineEngine: all checks passed");
}

run().catch((error) => {
  console.error("verifyTimelineEngine failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
