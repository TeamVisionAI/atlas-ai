/**
 * Sprint 14.2 — Business Event Engine verification.
 * Run: node backend/dev/verifyBusinessEventEngine.js
 */

require("dotenv").config();

const assert = require("assert");
const { InMemoryBusinessEventStore } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { SupabaseBusinessEventRepository } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEventService } = require("../modules/business-events/application/BusinessEventService");
const { EventFactory } = require("../modules/business-events/application/EventFactory");
const { InProcessEventPublisher } = require("../modules/business-events/application/InProcessEventPublisher");
const { TimelineSubscriber } = require("../modules/business-events/application/TimelineSubscriber");
const { BusinessEventProspectAdapter } = require("../modules/business-events/application/BusinessEventProspectAdapter");
const { LEAD_EVENTS, ALL_EVENT_TYPES } = require("../modules/business-events/domain/EventTypes");
const { DEFAULT_EVENT_SCHEMA_VERSION } = require("../modules/business-events/domain/EventVersion");
const createBusinessEventRoutes = require("../modules/business-events/api/businessEvent.routes");

class MemoryOnlyBusinessEventRepository extends SupabaseBusinessEventRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

async function run() {
  console.log("Sprint 14.2 — Business Event Engine verification\n");

  assert(ALL_EVENT_TYPES.includes(LEAD_EVENTS.PROSPECT_CREATED), "centralized event types");
  assert(ALL_EVENT_TYPES.length >= 30, "event catalog populated");

  const store = new InMemoryBusinessEventStore();
  const repository = new MemoryOnlyBusinessEventRepository(store);
  const publisher = new InProcessEventPublisher();
  const service = new BusinessEventService({ repository, publisher });
  const timelineSubscriber = new TimelineSubscriber(publisher);
  timelineSubscriber.register();

  const captured = [];
  publisher.subscribe(LEAD_EVENTS.PROSPECT_CREATED, (event) => {
    captured.push(event);
  });

  const recorded = await service.record(
    EventFactory.prospectCreated({
      prospectId: "00000000-0000-4000-8000-000000000099",
      actor: "AGENT:test",
      channel: "api",
      leadSource: { sourceType: "manual" },
      createdBy: "AGENT:test",
      summary: "Lead created"
    })
  );

  assert(recorded.eventId, "eventId assigned");
  assert(recorded.eventType === LEAD_EVENTS.PROSPECT_CREATED, "event type persisted");
  assert(recorded.version === DEFAULT_EVENT_SCHEMA_VERSION, "default schema version");
  assert(recorded.timestamp, "timestamp assigned");
  assert(recorded.createdAt, "createdAt assigned");
  assert(captured.length === 1, "typed subscriber received event");
  assert(timelineSubscriber.received.length === 1, "timeline placeholder subscribed");

  const byProspect = await service.listByProspect(recorded.prospectId);
  assert(byProspect.total === 1, "findByProspect works");

  const byType = await service.listByType(LEAD_EVENTS.PROSPECT_CREATED);
  assert(byType.total === 1, "findByType works");

  const adapter = new BusinessEventProspectAdapter(service);
  await adapter.emit({
    eventType: LEAD_EVENTS.PROSPECT_UPDATED,
    prospectId: recorded.prospectId,
    actor: "AGENT:test",
    payload: { changedFields: ["displayName"] },
    organizationId: "00000000-0000-4000-8000-000000000001",
    lifecycleStateAtEvent: "new_lead"
  });

  assert(timelineSubscriber.received.length === 2, "prospect adapter publishes events");

  const routes = createBusinessEventRoutes({ service });
  assert(typeof routes === "function", "routes export must be express router");
  assert(routes.stack.length >= 3, "read-only REST routes registered");

  console.log("verifyBusinessEventEngine: all checks passed");
}

run().catch((error) => {
  console.error("verifyBusinessEventEngine failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
