/**
 * Sprint 14.1 / 14.2 — Prospect Engine + Business Event integration verification.
 * Run: node backend/dev/verifyProspectEngine.js
 */

require("dotenv").config();

const assert = require("assert");
const { InMemoryProspectStore } = require("../modules/prospects/infrastructure/persistence/SupabaseProspectRepository");
const { ProspectRepository } = require("../modules/prospects/infrastructure/persistence/SupabaseProspectRepository");
const { ProspectApplicationService } = require("../modules/prospects/application/ProspectApplicationService");
const { validateCreateProspectInput } = require("../modules/prospects/application/validators/createProspect");
const { ProspectStatus } = require("../modules/prospects/domain/value-objects/ProspectStatus");
const { LIFECYCLE_STATES } = require("../modules/prospects/domain/constants");
const createProspectRoutes = require("../modules/prospects/api/prospect.routes");
const { InMemoryBusinessEventStore } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { SupabaseBusinessEventRepository } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEventService } = require("../modules/business-events/application/BusinessEventService");
const { InProcessEventPublisher } = require("../modules/business-events/application/InProcessEventPublisher");
const { TimelineSubscriber } = require("../modules/business-events/application/TimelineSubscriber");
const { BusinessEventProspectAdapter } = require("../modules/business-events/application/BusinessEventProspectAdapter");
const { LEAD_EVENTS } = require("../modules/business-events/domain/EventTypes");
const { createProspectEventsHandler } = require("../modules/business-events/api/businessEvent.routes");

class MemoryOnlyRepository extends ProspectRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

class MemoryOnlyBusinessEventRepository extends SupabaseBusinessEventRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

async function run() {
  console.log("Sprint 14.1/14.2 — Prospect Engine + Business Events verification\n");

  const eventStore = new InMemoryBusinessEventStore();
  const eventRepository = new MemoryOnlyBusinessEventRepository(eventStore);
  const publisher = new InProcessEventPublisher();
  const businessEventService = new BusinessEventService({
    repository: eventRepository,
    publisher
  });
  const timelineSubscriber = new TimelineSubscriber(publisher);
  timelineSubscriber.register();
  const businessEventEngine = new BusinessEventProspectAdapter(businessEventService);

  const store = new InMemoryProspectStore();
  const repository = new MemoryOnlyRepository(store);
  const service = new ProspectApplicationService({
    repository,
    businessEventEngine
  });

  assert.throws(
    () => validateCreateProspectInput({ displayName: "Bad", email: "not-an-email" }),
    /Invalid email/
  );

  assert.throws(
    () => ProspectStatus.assertTransition(LIFECYCLE_STATES.NEW_LEAD, LIFECYCLE_STATES.QUALIFIED),
    /Invalid lifecycle transition/
  );

  const created = await service.createProspect(
    {
      displayName: "Maria Lopez",
      email: "maria@example.com",
      primaryPhone: "7875550100",
      leadSource: { sourceType: "manual" }
    },
    "AGENT:test"
  );

  assert(created.prospectId, "create must return prospectId");
  assert(created.contact.email === "maria@example.com", "email must persist");
  assert(created.contact.normalizedPrimaryPhone === "+17875550100", "phone normalization");
  assert(created.status.lifecycleState === LIFECYCLE_STATES.NEW_LEAD, "default lifecycle");

  const eventsForProspect = await businessEventService.listByProspect(created.prospectId);
  assert(eventsForProspect.total >= 1, "prospect_created event persisted");
  assert(
    eventsForProspect.items.some((event) => event.eventType === LEAD_EVENTS.PROSPECT_CREATED),
    "prospect_created event type"
  );

  const listed = await service.listProspects({ q: "Maria" });
  assert(listed.total === 1, "search must find created prospect");

  const updated = await service.updateProspect(
    created.prospectId,
    { lifecycleState: LIFECYCLE_STATES.CONTACT_ATTEMPTED },
    "AGENT:test"
  );

  assert(
    updated.status.lifecycleState === LIFECYCLE_STATES.CONTACT_ATTEMPTED,
    "lifecycle update"
  );

  const assigned = await service.assignProspect(
    created.prospectId,
    {
      assignedAgentId: "00000000-0000-4000-8000-000000000001",
      assignmentReason: "Territory match"
    },
    "AGENT:test"
  );

  assert(assigned.assignedAgent.assignedAgentId, "assignment persisted");

  const archived = await service.archiveProspect(created.prospectId, "AGENT:test");
  assert(archived.archivedAt, "archive sets archivedAt");

  const restored = await service.restoreProspect(created.prospectId, "AGENT:test");
  assert(!restored.archivedAt, "restore clears archivedAt");

  const duplicate = await service.createProspect(
    {
      displayName: "Carlos Ruiz",
      email: "carlos@example.com"
    },
    "AGENT:test"
  );

  await service.mergeProspects(
    {
      survivorId: created.prospectId,
      mergedId: duplicate.prospectId
    },
    "AGENT:test"
  );

  const allEvents = await businessEventService.listByProspect(created.prospectId);
  assert(
    allEvents.items.some((event) => event.eventType === LEAD_EVENTS.PROSPECT_MERGED),
    "prospect_merged event"
  );
  assert(
    allEvents.items.some((event) => event.eventType === LEAD_EVENTS.PROSPECT_ASSIGNED),
    "prospect_assigned event"
  );
  assert(
    allEvents.items.some((event) => event.eventType === LEAD_EVENTS.PROSPECT_RESTORED),
    "prospect_restored event"
  );
  assert(timelineSubscriber.received.length >= 5, "timeline placeholder received events");

  const routes = createProspectRoutes({
    service,
    prospectEventsHandler: createProspectEventsHandler({ service: businessEventService })
  });
  assert(typeof routes === "function", "routes export must be express router");
  assert(routes.stack.length >= 9, "expected REST routes registered including /:id/events");

  console.log("verifyProspectEngine: all checks passed");
}

run().catch((error) => {
  console.error("verifyProspectEngine failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
