/**
 * Sprint 15.1 — Executive Dashboard projection verification.
 * Run: node backend/dev/verifyExecutiveDashboardProjection.js
 */

require("dotenv").config();

const assert = require("assert");
const { ProjectionEngine } = require("../modules/projections/application/ProjectionEngine");
const { InMemoryBusinessEventStore } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { SupabaseBusinessEventRepository } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEventService } = require("../modules/business-events/application/BusinessEventService");
const { InProcessEventPublisher } = require("../modules/business-events/application/InProcessEventPublisher");
const { EventFactory } = require("../modules/business-events/application/EventFactory");
const {
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  SALES_EVENTS
} = require("../modules/business-events/domain/EventTypes");
const { LIFECYCLE_STATES } = require("../modules/prospects/domain/constants");
const { TimelineProjection } = require("../modules/timeline/application/TimelineProjector");
const { InMemoryTimelineStore, TimelineRepository } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const {
  InMemoryMissionControlStore,
  MissionControlRepository
} = require("../modules/mission-control/infrastructure/MissionControlRepository");
const { MissionControlProjection } = require("../modules/mission-control/application/MissionControlProjection");
const {
  InMemoryExecutiveDashboardStore,
  ExecutiveDashboardRepository
} = require("../modules/executive-dashboard/infrastructure/ExecutiveDashboardRepository");
const { ExecutiveDashboardProjection } = require("../modules/executive-dashboard/application/ExecutiveDashboardProjection");
const { ExecutiveDashboardService } = require("../modules/executive-dashboard/application/ExecutiveDashboardService");
const {
  PROJECTION_STATUS,
  projectExecutiveDashboardEvent
} = require("../modules/executive-dashboard/application/projectExecutiveDashboardEvent");
const { createExecutiveDashboardModule } = require("../modules/executive-dashboard");
const { getDailyKey } = require("../modules/executive-dashboard/domain/ExecutiveDashboardMetrics");

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

class MemoryOnlyExecutiveDashboardRepository extends ExecutiveDashboardRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

async function run() {
  console.log("Sprint 15.1 — Executive Dashboard projection verification\n");

  const eventStore = new InMemoryBusinessEventStore();
  const timelineStore = new InMemoryTimelineStore();
  const missionControlStore = new InMemoryMissionControlStore();
  const executiveDashboardStore = new InMemoryExecutiveDashboardStore();
  const publisher = new InProcessEventPublisher();
  const eventRepository = new MemoryOnlyBusinessEventRepository(eventStore);
  const executiveDashboardRepository = new MemoryOnlyExecutiveDashboardRepository(
    executiveDashboardStore
  );
  const businessEventService = new BusinessEventService({ repository: eventRepository, publisher });
  const projectionEngine = new ProjectionEngine({
    publisher,
    businessEventRepository: eventRepository
  });

  const timelineProjection = new TimelineProjection({
    repository: new MemoryOnlyTimelineRepository(timelineStore)
  });
  const missionControlProjection = new MissionControlProjection({
    repository: new MemoryOnlyMissionControlRepository(missionControlStore)
  });
  const executiveDashboardProjection = new ExecutiveDashboardProjection({
    repository: executiveDashboardRepository
  });

  await projectionEngine.register(timelineProjection);
  await projectionEngine.register(missionControlProjection);
  await projectionEngine.register(executiveDashboardProjection);
  projectionEngine.start();

  assert(
    projectionEngine.registry.getProjection("executive-dashboard"),
    "executive-dashboard projection registered"
  );

  const prospectId = "00000000-0000-4000-8000-000000000030";
  const agentId = "00000000-0000-4000-8000-000000000001";
  const now = new Date().toISOString();
  const dailyKey = getDailyKey(now);

  const createdEvent = await businessEventService.record(
    EventFactory.prospectCreated({
      prospectId,
      actor: "AGENT:test",
      timestamp: now,
      leadSource: { sourceType: "referral" },
      createdBy: agentId,
      lifecycleStateAtEvent: LIFECYCLE_STATES.NEW_LEAD
    })
  );

  await businessEventService.record(
    EventFactory.prospectAssigned({
      prospectId,
      actor: "AGENT:test",
      timestamp: now,
      assignedAgentId: agentId
    })
  );

  await businessEventService.record(
    EventFactory.create({
      eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
      prospectId,
      actor: "ATLAS",
      timestamp: now,
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
      timestamp: now,
      payload: { appointmentId: "appt-exec-1", scheduledStart: now },
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
      actor: agentId,
      timestamp: now,
      payload: { outcome: "pending" },
      metadata: {
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_COMPLETED,
        summary: "Interview completed"
      }
    })
  );

  await businessEventService.record(
    EventFactory.create({
      eventType: SALES_EVENTS.POLICY_ISSUED,
      prospectId,
      actor: agentId,
      timestamp: now,
      payload: { policyId: "policy-1" },
      metadata: {
        lifecycleStateAtEvent: LIFECYCLE_STATES.CLIENT,
        summary: "Policy issued"
      }
    })
  );

  const service = new ExecutiveDashboardService({ repository: executiveDashboardRepository });
  const metrics = (await service.getReadModel()).metrics;

  assert(metrics.leadSourceDistribution.referral === 1, "lead source distribution aggregated");
  assert(metrics.recruitingFunnel.new_lead === 1, "recruiting funnel tracks new lead");
  assert(metrics.recruitingFunnel.contact_attempted === 1, "recruiting funnel tracks contact");
  assert(metrics.recruitingFunnel.interview_scheduled === 1, "recruiting funnel tracks interview scheduled");
  assert(metrics.recruitingFunnel.interview_completed === 1, "recruiting funnel tracks interview completed");
  assert(metrics.recruitingFunnel.client === 1, "recruiting funnel tracks client");
  assert(metrics.prospectConversion.leadsCreated === 1, "prospect conversion tracks leads");
  assert(metrics.prospectConversion.interviewsCompleted === 1, "prospect conversion tracks interviews");
  assert(metrics.prospectConversion.clients === 1, "prospect conversion tracks clients");
  assert(metrics.assignmentMetrics.totalAssignments === 1, "assignment metrics aggregated");
  assert(metrics.assignmentMetrics.byAgent[agentId] === 1, "assignment by agent tracked");
  assert(metrics.interviewCompletion.scheduled === 1, "interview scheduled counted");
  assert(metrics.interviewCompletion.completed === 1, "interview completed counted");
  assert(metrics.interviewCompletion.completionRate === 1, "interview completion rate computed");
  assert(metrics.agentProductivity[agentId].assignments === 1, "agent productivity tracks assignments");
  assert(metrics.agentProductivity[agentId].interviewsCompleted === 1, "agent productivity tracks interviews");
  assert(metrics.organizationSummary.totalProspectsEver === 1, "organization summary tracks prospects");
  assert(metrics.organizationSummary.activeProspects === 1, "organization summary tracks active prospects");
  assert(metrics.productionTrends.daily[dailyKey].newLeads === 1, "daily production trend tracked");
  assert(metrics.kpis.daily[dailyKey].newLeads === 1, "daily KPI tracked");

  const duplicate = await projectExecutiveDashboardEvent(
    createdEvent.toJSON(),
    executiveDashboardRepository
  );
  assert(duplicate.status === PROJECTION_STATUS.SKIPPED, "idempotent projection skips processed event");

  const chronological = await projectionEngine.loadEventsChronologically({});
  const clearedRepository = new MemoryOnlyExecutiveDashboardRepository(
    new InMemoryExecutiveDashboardStore()
  );
  const rebuildProjection = new ExecutiveDashboardProjection({ repository: clearedRepository });
  const rebuildSummary = await rebuildProjection.replay(chronological, { rebuild: true });

  assert(rebuildSummary.eventsApplied >= 6, "replay rebuild applies persisted events");
  assert(rebuildSummary.failures.length === 0, "replay rebuild has no failures");

  const rebuiltMetrics = (await new ExecutiveDashboardService({
    repository: clearedRepository
  }).getReadModel()).metrics;

  assert(
    rebuiltMetrics.prospectConversion.leadsCreated === metrics.prospectConversion.leadsCreated,
    "replay rebuild preserves lead conversion count"
  );
  assert(
    rebuiltMetrics.prospectConversion.clients === metrics.prospectConversion.clients,
    "replay rebuild preserves client conversion count"
  );

  const engineReplay = await projectionEngine.replay({
    projectionName: "executive-dashboard",
    prospectId
  });
  assert(
    engineReplay.projections["executive-dashboard"].eventsSkipped >= 1,
    "engine replay is idempotent"
  );

  const summary = await service.getSummary();
  assert(summary.prospectConversion.leadsCreated === 1, "summary endpoint reflects conversion");

  const trends = await service.getTrends();
  assert(trends.productionTrends.daily[dailyKey], "trends endpoint returns daily buckets");

  const kpis = await service.getKpis();
  assert(kpis.kpis.daily[dailyKey], "kpis endpoint returns daily KPIs");

  const moduleExports = createExecutiveDashboardModule({
    repository: executiveDashboardRepository,
    executiveDashboardProjection
  });

  assert(typeof moduleExports.routes === "function", "module exports routes");
  assert(moduleExports.executiveDashboardProjection, "module exports projection");
  assert(executiveDashboardProjection.health().name === "executive-dashboard", "health reports projection");

  console.log("verifyExecutiveDashboardProjection: all checks passed");
}

run().catch((error) => {
  console.error("verifyExecutiveDashboardProjection failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
