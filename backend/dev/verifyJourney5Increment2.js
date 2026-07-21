/**
 * Journey #5 Increment 2 — Workflow intelligence verification.
 * Run: node backend/dev/verifyJourney5Increment2.js
 */

const assert = require("assert");

const { EventBus } = require("../communication/events/EventBus");
const { DECISION_TYPE, createConversationEngine, agentStore } = require("../agent");
const {
  loadWorkflow,
  getState,
  navigate,
  clearStore: clearWorkflowState,
  WorkflowIntelligenceEvent,
  GENERIC_INTAKE_WORKFLOW,
  TEAM_VISION_INTAKE_WORKFLOW
} = require("../workflows/intelligence");

async function run() {
  console.log("Journey #5 Increment 2 — Workflow Intelligence verification\n");

  agentStore.clearStore();
  clearWorkflowState();

  const eventBus = new EventBus();
  const workflowEvents = {
    loaded: [],
    stateUpdated: [],
    stepCompleted: [],
    ready: []
  };

  eventBus.on(WorkflowIntelligenceEvent.LOADED, (payload) =>
    workflowEvents.loaded.push(payload)
  );
  eventBus.on(WorkflowIntelligenceEvent.STATE_UPDATED, (payload) =>
    workflowEvents.stateUpdated.push(payload)
  );
  eventBus.on(WorkflowIntelligenceEvent.STEP_COMPLETED, (payload) =>
    workflowEvents.stepCompleted.push(payload)
  );
  eventBus.on(WorkflowIntelligenceEvent.READY, (payload) =>
    workflowEvents.ready.push(payload)
  );

  const engine = createConversationEngine({ eventBus });

  const organization = {
    id: "org-j5-i2",
    name: "Team Vision",
    officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  };

  const prospect = {
    id: "ATL-J5-I2-001",
    displayName: "Maria Lopez"
  };

  const contract = loadWorkflow(GENERIC_INTAKE_WORKFLOW.name);
  assert.ok(contract.name, "Expected workflow contract to load");
  console.log("✓ Workflow loads from registry");

  const turnOne = await engine.processInbound({
    text: "Hi there",
    messageId: "i2-msg-1",
    channel: "messenger",
    prospect,
    organization,
    workflowName: GENERIC_INTAKE_WORKFLOW.name
  });

  assert.strictEqual(turnOne.decision.decisionType, DECISION_TYPE.ASK);
  assert.strictEqual(turnOne.decision.currentStep, "collect_name");
  assert.strictEqual(turnOne.decision.missingInformation[0], "name");
  assert.ok(turnOne.decision.completionPercent < 100, "Workflow should not be complete");
  assert.ok(turnOne.response.text.toLowerCase().includes("name"));
  console.log("✓ First turn asks only for the current step field");

  const turnTwo = await engine.processInbound({
    text: "Maria Lopez",
    messageId: "i2-msg-2",
    channel: "messenger",
    conversationId: turnOne.conversationId,
    prospect,
    organization,
    workflowName: GENERIC_INTAKE_WORKFLOW.name
  });

  assert.strictEqual(turnTwo.decision.currentStep, "collect_email");
  assert.strictEqual(turnTwo.decision.missingInformation[0], "email");
  assert.strictEqual(turnTwo.decision.decisionType, DECISION_TYPE.ASK);
  assert.ok(turnTwo.response.text.toLowerCase().includes("email"));
  console.log("✓ Second turn advances to next step and asks for email only");

  const turnThree = await engine.processInbound({
    text: "maria@example.com",
    messageId: "i2-msg-3",
    channel: "messenger",
    conversationId: turnOne.conversationId,
    prospect,
    organization,
    workflowName: GENERIC_INTAKE_WORKFLOW.name
  });

  assert.strictEqual(turnThree.decision.currentStep, "collect_phone");
  assert.strictEqual(turnThree.decision.missingInformation[0], "phone");
  console.log("✓ Third turn asks for phone only");

  const turnFour = await engine.processInbound({
    text: "813-555-0100",
    messageId: "i2-msg-4",
    channel: "messenger",
    conversationId: turnOne.conversationId,
    prospect,
    organization,
    workflowName: GENERIC_INTAKE_WORKFLOW.name
  });

  assert.strictEqual(turnFour.decision.decisionType, DECISION_TYPE.TOOL_REQUEST);
  assert.strictEqual(turnFour.decision.completionPercent, 100);
  assert.strictEqual(turnFour.navigation.isComplete, true);
  console.log("✓ TOOL_REQUEST generated only when workflow is complete");

  const persistedState = await getState(turnOne.conversationId);
  assert.ok(persistedState, "Expected workflow state persisted");
  assert.strictEqual(persistedState.workflowName, GENERIC_INTAKE_WORKFLOW.name);
  assert.strictEqual(persistedState.completionPercent, 100);
  assert.deepStrictEqual(persistedState.completedSteps, [
    "collect_name",
    "collect_email",
    "collect_phone"
  ]);
  console.log("✓ Workflow state persists with completion data");

  assert.ok(workflowEvents.loaded.length >= 1, "Expected workflow.loaded events");
  assert.ok(workflowEvents.stateUpdated.length >= 4, "Expected workflow.state.updated events");
  assert.ok(workflowEvents.stepCompleted.length >= 3, "Expected workflow.step.completed events");
  assert.ok(workflowEvents.ready.length >= 1, "Expected workflow.ready event");
  console.log("✓ Workflow intelligence events emitted");

  const teamTurn = await engine.processInbound({
    text: "Carlos Ruiz",
    messageId: "tv-msg-1",
    channel: "messenger",
    prospect: { id: "ATL-J5-I2-002", displayName: "Carlos Ruiz" },
    organization,
    workflowName: TEAM_VISION_INTAKE_WORKFLOW.name
  });

  assert.strictEqual(teamTurn.workflow.name, TEAM_VISION_INTAKE_WORKFLOW.name);
  assert.strictEqual(teamTurn.navigation.currentStep, "collect_contact");
  assert.ok(teamTurn.navigation.completionPercent > 0);
  assert.ok(teamTurn.navigation.pendingSteps.length > 0);
  console.log("✓ Team Vision workflow calculates step progress independently");

  console.log("\nAll Journey #5 Increment 2 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
