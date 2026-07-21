/**
 * Journey #5 Increment 3 — Tool Execution verification.
 * Run: node backend/dev/verifyJourney5Increment3.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { EventBus } = require("../communication/events/EventBus");
const { DECISION_TYPE, createConversationEngine, agentStore } = require("../agent");
const {
  ToolEvent,
  createToolRequest,
  createToolExecutor,
  getToolRegistry,
  resetToolRegistry,
  executionHistory
} = require("../agent/tools");
const { GENERIC_INTAKE_WORKFLOW } = require("../workflows/intelligence");
const { clearStore: clearWorkflowState } = require("../workflows/intelligence/WorkflowState");
const appointmentStore = require("../appointments/AppointmentStore");
const { withSimulatorGuard } = require("../dev/simulatorGuard");
const { signupWithPassword } = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  activateOrganization
} = require("../services/organizationService");

const ORGS_FILE = path.join(__dirname, "../data/organizations.json");

async function runGenericIntakeFlow(engine) {
  const organization = {
    id: "org-j5-i3",
    name: "Team Vision Tools",
    officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  };
  const prospect = { id: "ATL-J5-I3-001", displayName: "Maria Lopez" };

  const turns = [
    { text: "Hi there", messageId: "i3-1" },
    { text: "Maria Lopez", messageId: "i3-2" },
    { text: "maria@example.com", messageId: "i3-3" },
    { text: "813-555-0100", messageId: "i3-4" }
  ];

  let conversationId = null;
  let lastTurn = null;

  for (const turn of turns) {
    lastTurn = await engine.processInbound({
      ...turn,
      channel: "messenger",
      conversationId,
      prospect,
      organization,
      workflowName: GENERIC_INTAKE_WORKFLOW.name
    });
    conversationId = lastTurn.conversationId;
  }

  return { lastTurn, conversationId, organization, prospect };
}

async function run() {
  console.log("Journey #5 Increment 3 — Tool Execution verification\n");

  await withSimulatorGuard(async () => {
    agentStore.clearStore();
    clearWorkflowState();
    appointmentStore.clearStore();
    executionHistory.clearHistory();
    resetToolRegistry();

    if (fs.existsSync(ORGS_FILE)) {
      fs.unlinkSync(ORGS_FILE);
    }

    const user = await signupWithPassword({
      email: `journey5.i3.${Date.now()}@example.com`,
      password: "AtlasTest123"
    });
    const organization = await createOrganizationForUser(user.id, "Team Vision Tool Test");
    await activateOrganization(organization.id);

    const eventBus = new EventBus();
    const toolEvents = {
      requested: [],
      validated: [],
      executed: [],
      failed: [],
      completed: []
    };

    eventBus.on(ToolEvent.REQUESTED, (payload) => toolEvents.requested.push(payload));
    eventBus.on(ToolEvent.VALIDATED, (payload) => toolEvents.validated.push(payload));
    eventBus.on(ToolEvent.EXECUTED, (payload) => toolEvents.executed.push(payload));
    eventBus.on(ToolEvent.FAILED, (payload) => toolEvents.failed.push(payload));
    eventBus.on(ToolEvent.COMPLETED, (payload) => toolEvents.completed.push(payload));

    const engine = createConversationEngine({ eventBus });
    const { lastTurn, conversationId } = await runGenericIntakeFlow(engine);

    assert.strictEqual(lastTurn.decision.decisionType, DECISION_TYPE.TOOL_REQUEST);
    assert.ok(lastTurn.toolResults?.length >= 1, "Expected tool results");
    console.log("✓ Tool Request generated and executed");

    const appointmentResult = lastTurn.toolResults[0];
    assert.strictEqual(appointmentResult.toolName, "AppointmentService");
    assert.strictEqual(appointmentResult.operation, "scheduleInterview");
    assert.strictEqual(appointmentResult.success, true);
    assert.ok(appointmentResult.resultData?.appointment?.id, "Expected appointment in result data");
    assert.ok(appointmentResult.correlationId, "Expected correlation id on result");
    console.log("✓ Registry resolved tool and returned standard Tool Result");

    const correlationId = appointmentResult.correlationId;
    const history = await executionHistory.listExecutions({
      conversationId,
      correlationId
    });
    assert.ok(history.length >= 1, "Expected execution history persisted");
    assert.strictEqual(history[0].request.correlationId, correlationId);
    assert.strictEqual(history[0].result.correlationId, correlationId);
    assert.ok(history[0].durationMs >= 0);
    console.log("✓ Execution history persisted with correlation id");

    assert.ok(toolEvents.requested.length >= 1, "Expected agent.tool.requested");
    assert.ok(toolEvents.validated.length >= 1, "Expected agent.tool.validated");
    assert.ok(toolEvents.executed.length >= 1, "Expected agent.tool.executed");
    assert.ok(toolEvents.completed.length >= 1, "Expected agent.tool.completed");
    assert.strictEqual(toolEvents.failed.length, 0, "Did not expect agent.tool.failed");
    console.log("✓ Tool events emitted");

    const registry = getToolRegistry();
    assert.ok(registry.hasTool("AppointmentService"));
    assert.ok(registry.hasTool("MeetingService"));
    assert.ok(registry.hasTool("CalendarService"));
    assert.ok(registry.hasOperation("AppointmentService", "scheduleInterview"));
    console.log("✓ Tool Registry operational");

    const invalidExecutor = createToolExecutor({ eventBus });
    const invalidResult = await invalidExecutor.execute(
      createToolRequest({
        correlationId: "bad-correlation",
        toolName: "UnknownService",
        operation: "noop",
        conversationId,
        workflowName: GENERIC_INTAKE_WORKFLOW.name
      })
    );
    assert.strictEqual(invalidResult.success, false);
    assert.ok(invalidResult.error);
    console.log("✓ Invalid tool requests fail validation cleanly");
  });

  console.log("\nAll Journey #5 Increment 3 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
