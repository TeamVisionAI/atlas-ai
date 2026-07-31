const test = require("node:test");
const assert = require("node:assert/strict");
const { InProcessEventPublisher } = require("../modules/business-events/application/InProcessEventPublisher");
const { APPOINTMENT_EVENTS } = require("../modules/business-events/domain/EventTypes");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");
const { MISSION_PRIORITIES } = require("../core/configuration/missionPriorities");
const {
  WorkflowEngine,
  WorkflowMissionRegistry,
  AppointmentWorkflowEvaluator,
  registerAppointmentWorkflowHandlers,
  getAppointmentWorkflowRules
} = require("../modules/workflows");

function appointmentEvent(eventType, overrides = {}) {
  return {
    eventId: overrides.eventId || "evt-1",
    eventType,
    timestamp: "2026-07-30T15:00:00.000Z",
    prospectId: "prospect-1",
    actor: "AGENT",
    channel: "mission_control",
    payload: {
      organizationId: "org-1",
      appointmentId: "appt-1",
      prospectPhone: "+15555550100",
      scheduledTime: "2026-07-30T16:00:00.000Z",
      currentState: "no_show",
      ownerRepId: "4TJLK",
      appointmentType: "recruiting_interview",
      ...(overrides.payload || {})
    },
    metadata: {
      organizationId: "org-1",
      summary: overrides.summary || "Appointment event"
    }
  };
}

test("appointment workflow rules are configuration-driven by event type", () => {
  const noShowRules = getAppointmentWorkflowRules(APPOINTMENT_EVENTS.APPOINTMENT_NO_SHOW);
  assert.equal(noShowRules.length, 2);
  assert.equal(noShowRules[0].missionType, MISSION_TYPES.FOLLOW_UP);
  assert.equal(noShowRules[1].missionType, MISSION_TYPES.RESCHEDULE_INTERVIEW);
  assert.equal(getAppointmentWorkflowRules(APPOINTMENT_EVENTS.APPOINTMENT_CONFIRMED).length, 0);
});

test("AppointmentWorkflowEvaluator produces mission definitions for appointment events", () => {
  const evaluator = new AppointmentWorkflowEvaluator();
  const missions = evaluator.evaluate(
    appointmentEvent(APPOINTMENT_EVENTS.APPOINTMENT_RECRUITED)
  );

  assert.equal(missions.length, 1);
  assert.equal(missions[0].missionType, MISSION_TYPES.BEGIN_ONBOARDING);
  assert.equal(missions[0].priority, MISSION_PRIORITIES.HIGH);
  assert.equal(missions[0].prospectId, "+15555550100");
  assert.equal(missions[0].sourceEventType, APPOINTMENT_EVENTS.APPOINTMENT_RECRUITED);
  assert.equal(missions[0].metadata.appointmentId, "appt-1");
});

test("WorkflowEngine ignores non-appointment events", () => {
  const engine = new WorkflowEngine({ registry: new WorkflowMissionRegistry() });
  const missions = engine.evaluateEvent({
    eventId: "evt-2",
    eventType: "prospect_created",
    prospectId: "prospect-1",
    payload: {}
  });

  assert.deepEqual(missions, []);
});

test("WorkflowEngine stores mission definitions in registry after handleEvent", async () => {
  const registry = new WorkflowMissionRegistry();
  const engine = new WorkflowEngine({ registry });
  const event = appointmentEvent(APPOINTMENT_EVENTS.APPOINTMENT_NO_SHOW);

  const missions = await engine.handleEvent(event);

  assert.equal(missions.length, 2);
  assert.equal(registry.getMissionDefinitionsForEvent("evt-1").length, 2);
  assert.equal(registry.getMissionDefinitionsForProspect("+15555550100").length, 2);
});

test("registerAppointmentWorkflowHandlers reacts to published appointment events", async () => {
  const publisher = new InProcessEventPublisher();
  const registry = new WorkflowMissionRegistry();
  const engine = new WorkflowEngine({ registry });

  registerAppointmentWorkflowHandlers(publisher, engine);

  await publisher.publish({
    toJSON() {
      return appointmentEvent(APPOINTMENT_EVENTS.APPOINTMENT_BECAME_CLIENT, {
        payload: { currentState: "became_client" }
      });
    }
  });

  const missions = registry.getMissionDefinitionsForProspect("+15555550100");

  assert.equal(missions.length, 1);
  assert.equal(missions[0].missionType, MISSION_TYPES.REVIEW_FNA);
});

test("WorkflowEngine upserts mission definitions per prospect and mission type", async () => {
  const registry = new WorkflowMissionRegistry();
  const engine = new WorkflowEngine({ registry });

  await engine.handleEvent(appointmentEvent(APPOINTMENT_EVENTS.APPOINTMENT_CREATED));
  await engine.handleEvent(appointmentEvent(APPOINTMENT_EVENTS.APPOINTMENT_NO_SHOW, { eventId: "evt-2" }));

  const missions = registry.getMissionDefinitionsForProspect("+15555550100");

  assert.equal(missions.length, 3);
  assert.ok(missions.some((mission) => mission.missionType === MISSION_TYPES.REVIEW_PROSPECT));
  assert.ok(missions.some((mission) => mission.missionType === MISSION_TYPES.FOLLOW_UP));
  assert.ok(missions.some((mission) => mission.missionType === MISSION_TYPES.RESCHEDULE_INTERVIEW));
});
