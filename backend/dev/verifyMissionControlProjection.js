/**
 * Sprint 15.0 — Mission Control projection verification.
 * Run: node backend/dev/verifyMissionControlProjection.js
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
const {
  LEAD_EVENTS,
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS
} = require("../modules/business-events/domain/EventTypes");
const { LIFECYCLE_STATES } = require("../modules/prospects/domain/constants");
const { InMemoryTimelineStore } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const { TimelineRepository } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const { TimelineProjection } = require("../modules/timeline/application/TimelineProjector");
const {
  InMemoryMissionControlStore,
  MissionControlRepository
} = require("../modules/mission-control/infrastructure/MissionControlRepository");
const { MissionControlProjection } = require("../modules/mission-control/application/MissionControlProjection");
const { MissionControlService } = require("../modules/mission-control/application/MissionControlService");
const {
  PROJECTION_STATUS,
  projectMissionControlEvent
} = require("../modules/mission-control/application/projectMissionControlEvent");
const { createMissionControlModule } = require("../modules/mission-control");
const { METRIC_KEYS } = require("../modules/mission-control/domain/MissionControlMetrics");

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

class MemoryOnlyMissionControlRepository extends MissionControlRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

class FailingProjection extends Projection {
  name() {
    return "failing";
  }

  async handle() {
    throw new Error("Simulated projection failure.");
  }

  async replay(events) {
    return { eventsRead: events.length, failures: [{ message: "Simulated replay failure." }] };
  }
}

async function run() {
  console.log("Sprint 15.0 — Mission Control projection verification\n");

  const eventStore = new InMemoryBusinessEventStore();
  const timelineStore = new InMemoryTimelineStore();
  const missionControlStore = new InMemoryMissionControlStore();
  const publisher = new InProcessEventPublisher();
  const eventRepository = new MemoryOnlyBusinessEventRepository(eventStore);
  const timelineRepository = new MemoryOnlyTimelineRepository(timelineStore);
  const missionControlRepository = new MemoryOnlyMissionControlRepository(missionControlStore);
  const businessEventService = new BusinessEventService({ repository: eventRepository, publisher });
  const projectionEngine = new ProjectionEngine({
    publisher,
    businessEventRepository: eventRepository
  });
  const timelineProjection = new TimelineProjection({ repository: timelineRepository });
  const missionControlProjection = new MissionControlProjection({
    repository: missionControlRepository
  });
  const failingProjection = new FailingProjection();

  await projectionEngine.register(timelineProjection);
  await projectionEngine.register(missionControlProjection);
  await projectionEngine.register(failingProjection);
  projectionEngine.start();

  assert(
    projectionEngine.registry.getProjection("mission-control"),
    "mission-control projection registered"
  );

  const prospectId = "00000000-0000-4000-8000-000000000020";
  const mergedId = "00000000-0000-4000-8000-000000000021";
  const agentId = "00000000-0000-4000-8000-000000000001";

  const createdEvent = await businessEventService.record(
    EventFactory.prospectCreated({
      prospectId,
      actor: "AGENT:test",
      leadSource: { sourceType: "manual" },
      createdBy: "AGENT:test",
      lifecycleStateAtEvent: LIFECYCLE_STATES.NEW_LEAD
    })
  );

  await businessEventService.record(
    EventFactory.prospectAssigned({
      prospectId,
      actor: "AGENT:test",
      assignedAgentId: agentId
    })
  );

  await businessEventService.record(
    EventFactory.create({
      eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
      prospectId,
      actor: "ATLAS",
      channel: "whatsapp",
      payload: { direction: "outbound" },
      metadata: {
        lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
        summary: "First outbound message"
      }
    })
  );

  await businessEventService.record(
    EventFactory.create({
      eventType: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
      prospectId,
      actor: "ATLAS",
      payload: { appointmentId: "appt-1", scheduledStart: new Date().toISOString() },
      metadata: {
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
        summary: "Interview scheduled"
      }
    })
  );

  await businessEventService.record(
    EventFactory.create({
      eventType: APPOINTMENT_EVENTS.INTERVIEW_COMPLETED,
      prospectId,
      actor: "AGENT:test",
      payload: { outcome: "pending" },
      metadata: {
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_COMPLETED,
        summary: "Interview completed"
      }
    })
  );

  const service = new MissionControlService({ repository: missionControlRepository });
  const metrics = await service.getMetrics();

  assert(metrics.activeProspects === 1, "activeProspects aggregated from events");
  assert(metrics.newLeads === 1, "newLeads aggregated");
  assert(metrics.contactAttempts === 1, "contactAttempts aggregated");
  assert(metrics.scheduledInterviews === 1, "scheduledInterviews aggregated");
  assert(metrics.completedInterviews === 1, "completedInterviews aggregated");
  assert(metrics.assignmentMetrics.totalAssignments === 1, "assignment metrics aggregated");
  assert(metrics.assignmentMetrics.byAgent[agentId] === 1, "assignment by agent tracked");

  const duplicate = await projectMissionControlEvent(createdEvent.toJSON(), missionControlRepository);
  assert(duplicate.status === PROJECTION_STATUS.SKIPPED, "idempotent replay skips processed event");

  await businessEventService.record(
    EventFactory.prospectMerged({
      prospectId,
      actor: "AGENT:test",
      survivorId: prospectId,
      mergedId
    })
  );

  await businessEventService.record(
    EventFactory.prospectCreated({
      prospectId: mergedId,
      actor: "AGENT:test",
      leadSource: { sourceType: "manual" },
      createdBy: "AGENT:test"
    })
  );

  await businessEventService.record(
    EventFactory.prospectArchived({
      prospectId,
      actor: "AGENT:test",
      archivedBy: "AGENT:test"
    })
  );

  const afterArchive = await service.getMetrics();
  assert(afterArchive.archivedProspects === 1, "archivedProspects aggregated");
  assert(afterArchive.activeProspects === 1, "activeProspects excludes archived survivor");
  assert(afterArchive.mergeStatistics.totalMerges === 1, "merge statistics aggregated");

  const chronological = await projectionEngine.loadEventsChronologically({});
  const clearedRepository = new MemoryOnlyMissionControlRepository(new InMemoryMissionControlStore());
  const rebuildProjection = new MissionControlProjection({ repository: clearedRepository });

  const rebuildSummary = await rebuildProjection.replay(chronological, { rebuild: true });
  assert(rebuildSummary.eventsApplied >= 8, "replay rebuild applies persisted events");
  assert(rebuildSummary.failures.length === 0, "replay rebuild has no failures");

  const rebuiltMetrics = await new MissionControlService({
    repository: clearedRepository
  }).getMetrics();

  assert(
    rebuiltMetrics.activeProspects === afterArchive.activeProspects,
    "replay rebuild preserves activeProspects"
  );
  assert(
    rebuiltMetrics.archivedProspects === afterArchive.archivedProspects,
    "replay rebuild preserves archivedProspects"
  );
  assert(
    rebuiltMetrics.mergeStatistics.totalMerges === afterArchive.mergeStatistics.totalMerges,
    "replay rebuild preserves merge statistics"
  );

  const engineReplay = await projectionEngine.replay({
    projectionName: "mission-control",
    prospectId
  });
  assert(engineReplay.projections["mission-control"].eventsSkipped >= 1, "engine replay is idempotent");

  assert(
    projectionEngine.failures.some((failure) => failure.projection === "failing"),
    "failing projection isolated from mission-control"
  );

  assert(missionControlProjection.health().name === "mission-control", "health reports projection");

  const moduleExports = createMissionControlModule({
    repository: missionControlRepository,
    missionControlProjection
  });

  assert(typeof moduleExports.routes === "function", "module exports routes");
  assert(moduleExports.missionControlProjection, "module exports projection");
  assert(moduleExports.service, "module exports service");

  const summary = await service.getSummary();
  assert(summary.activeProspectCount === afterArchive.activeProspects, "summary reflects active count");
  assert(Array.isArray(summary.activeProspectIds), "summary includes active prospect ids");

  const readModel = await service.getReadModel();
  assert(readModel.metrics[METRIC_KEYS.NEW_LEADS] === 2, "read model includes new lead count");
  assert(readModel.prospects[prospectId], "read model includes prospect projection state");

  console.log("verifyMissionControlProjection: all checks passed");
}

run().catch((error) => {
  console.error("verifyMissionControlProjection failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
