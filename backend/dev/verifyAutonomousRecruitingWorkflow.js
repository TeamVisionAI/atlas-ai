/**
 * Sprint 16.1 — Autonomous recruiting workflow verification.
 * Run: node backend/dev/verifyAutonomousRecruitingWorkflow.js
 */

require("dotenv").config();

const assert = require("assert");
const { InMemoryBusinessEventStore } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { SupabaseBusinessEventRepository } = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEventService } = require("../modules/business-events/application/BusinessEventService");
const { InProcessEventPublisher } = require("../modules/business-events/application/InProcessEventPublisher");
const { BusinessEventProspectAdapter } = require("../modules/business-events/application/BusinessEventProspectAdapter");
const { InMemoryProspectStore } = require("../modules/prospects/infrastructure/persistence/SupabaseProspectRepository");
const { ProspectRepository } = require("../modules/prospects/infrastructure/persistence/SupabaseProspectRepository");
const { ProspectApplicationService } = require("../modules/prospects/application/ProspectApplicationService");
const {
  registerRecruitingWorkflow,
  getRecruitingWorkflowDeps
} = require("../core/recruitingWorkflowRegistry");
const {
  assessQualificationFromProspect,
  assessQualificationFromProfile
} = require("../core/recruitingQualificationEngine");
const {
  buildAutonomousActionCenter,
  onInterviewScheduled,
  clearAutonomousWorkflowStateForTests
} = require("../core/recruitingWorkflowOrchestrator");
const {
  clearProspectBridgeCacheForTests
} = require("../core/recruitingProspectBridge");
const { APPOINTMENT_EVENTS, COMMUNICATION_EVENTS } = require("../modules/business-events/domain/EventTypes");

class MemoryOnlyBusinessEventRepository extends SupabaseBusinessEventRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

class MemoryOnlyProspectRepository extends ProspectRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

async function run() {
  console.log("Sprint 16.1 — Autonomous recruiting workflow verification\n");

  clearAutonomousWorkflowStateForTests();
  clearProspectBridgeCacheForTests();

  const eventStore = new InMemoryBusinessEventStore();
  const eventRepository = new MemoryOnlyBusinessEventRepository(eventStore);
  const publisher = new InProcessEventPublisher();
  const businessEventService = new BusinessEventService({
    repository: eventRepository,
    publisher
  });
  const prospectStore = new InMemoryProspectStore();
  const prospectRepository = new MemoryOnlyProspectRepository(prospectStore);
  const prospectAdapter = new BusinessEventProspectAdapter(businessEventService);
  const prospectService = new ProspectApplicationService({
    repository: prospectRepository,
    businessEventEngine: prospectAdapter
  });

  registerRecruitingWorkflow({
    prospectService,
    businessEventService,
    prospectRepository
  });

  assert(getRecruitingWorkflowDeps()?.prospectService, "recruiting workflow registry wired");

  const partialProspect = {
    phone: "7875553001",
    city: "Doral",
    state: "FL",
    work_authorized: true,
    occupation: "Teacher",
    interview_type: "In Person",
    current_step: "SCHEDULE"
  };

  const partialAssessment = assessQualificationFromProspect(partialProspect);
  assert(partialAssessment.isQualified, "partial profile qualifies before scheduling");
  assert(partialAssessment.readyForScheduling, "qualified prospect ready for scheduling");

  const actionCenter = buildAutonomousActionCenter(partialAssessment, partialProspect);
  assert(actionCenter.nextBestAction.includes("scheduling"), "action center recommends scheduling");
  assert(actionCenter.confidence >= 0.7, "action center confidence populated");

  const created = await prospectService.createProspect(
    {
      displayName: "Autonomous Test Lead",
      primaryPhone: "+17875553001",
      leadSource: { sourceType: "social", sourceDetail: "Facebook Lead Ads" }
    },
    "SYSTEM"
  );

  assert(created.prospectId, "core prospect created");

  const scheduled = await onInterviewScheduled({
    phone: "+17875553001",
    prospect: {
      phone: "7875553001",
      name: "Autonomous Test Lead",
      appointment_date: "2026-07-25T15:00:00.000Z",
      interview_type: "In Person",
      calendar_event_id: "cal-test-1"
    },
    profile: {
      appointmentDate: "2026-07-25T15:00:00.000Z",
      interviewType: "In Person",
      confirmed: true,
      calendarEventId: "cal-test-1"
    },
    calendarEvent: { id: "cal-test-1" }
  });

  assert(scheduled?.prospectId === created.prospectId, "interview scheduling linked to core prospect");

  const events = await businessEventService.listByProspect(created.prospectId);
  assert(
    events.items.some((event) => event.eventType === APPOINTMENT_EVENTS.APPOINTMENT_CREATED),
    "appointment_created business event recorded"
  );
  assert(
    events.items.some((event) => event.eventType === COMMUNICATION_EVENTS.MESSAGE_SENT) ||
      events.items.some((event) => event.eventType === "prospect_created"),
    "business events persisted for prospect"
  );

  const scheduledAssessment = assessQualificationFromProfile({
    city: "Doral",
    state: "FL",
    authorization: true,
    occupation: "Teacher",
    interviewType: "In Person",
    appointmentDate: "2026-07-25T15:00:00.000Z",
    calendarEventId: "cal-test-1",
    confirmed: true
  });

  assert(scheduledAssessment.isInterviewScheduled, "scheduled profile detected");

  console.log("verifyAutonomousRecruitingWorkflow: all checks passed");
}

run().catch((error) => {
  console.error("verifyAutonomousRecruitingWorkflow failed:", error.message);
  process.exit(1);
});
