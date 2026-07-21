/**
 * Journey #5 Increment 4 — Autonomous Conversations verification.
 * Run: node backend/dev/verifyJourney5Increment4.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { EventBus } = require("../communication/events/EventBus");
const { DECISION_TYPE } = require("../agent");
const {
  createAutonomousConversationRuntime,
  sessionStore,
  SessionEvent,
  CONVERSATION_STATUS,
  RESUME_GAP_MS
} = require("../agent/runtime");
const { clearStore: clearWorkflowState } = require("../workflows/intelligence/WorkflowState");
const { GENERIC_INTAKE_WORKFLOW } = require("../workflows/intelligence");
const agentStore = require("../agent/AgentStore");
const appointmentStore = require("../appointments/AppointmentStore");
const { executionHistory } = require("../agent/tools");
const { withSimulatorGuard } = require("../dev/simulatorGuard");
const { signupWithPassword } = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  activateOrganization
} = require("../services/organizationService");

const ORGS_FILE = path.join(__dirname, "../data/organizations.json");
const SESSIONS_FILE = path.join(__dirname, "../data/conversationSessions.json");

async function runTurn(runtime, payload) {
  return runtime.processMessage(payload);
}

async function run() {
  console.log("Journey #5 Increment 4 — Autonomous Conversations verification\n");

  await withSimulatorGuard(async () => {
    agentStore.clearStore();
    clearWorkflowState();
    appointmentStore.clearStore();
    executionHistory.clearHistory();
    sessionStore.clearStore();

    if (fs.existsSync(ORGS_FILE)) {
      fs.unlinkSync(ORGS_FILE);
    }

    const user = await signupWithPassword({
      email: `journey5.i4.${Date.now()}@example.com`,
      password: "AtlasTest123"
    });
    const orgRecord = await createOrganizationForUser(user.id, "Team Vision Autonomous");
    await activateOrganization(orgRecord.id);

    const organization = {
      id: orgRecord.id,
      name: "Team Vision Autonomous",
      officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    };
    const prospect = { id: "ATL-J5-I4-001", displayName: "Maria Lopez" };

    const eventBus = new EventBus();
    const sessionEvents = {
      started: [],
      updated: [],
      resumed: [],
      completed: [],
      summaryCreated: [],
      closed: []
    };

    eventBus.on(SessionEvent.STARTED, (payload) => sessionEvents.started.push(payload));
    eventBus.on(SessionEvent.UPDATED, (payload) => sessionEvents.updated.push(payload));
    eventBus.on(SessionEvent.RESUMED, (payload) => sessionEvents.resumed.push(payload));
    eventBus.on(SessionEvent.COMPLETED, (payload) => sessionEvents.completed.push(payload));
    eventBus.on(SessionEvent.SUMMARY_CREATED, (payload) =>
      sessionEvents.summaryCreated.push(payload)
    );
    eventBus.on(SessionEvent.CLOSED, (payload) => sessionEvents.closed.push(payload));

    let runtime = createAutonomousConversationRuntime({ eventBus });

    const turnOne = await runTurn(runtime, {
      text: "Hi there",
      messageId: "i4-1",
      channel: "messenger",
      prospect,
      organization,
      workflowName: GENERIC_INTAKE_WORKFLOW.name
    });

    assert.strictEqual(turnOne.decision.decisionType, DECISION_TYPE.ASK);
    assert.strictEqual(turnOne.session.currentStep, "collect_name");
    console.log("✓ Multi-turn conversation started");

    const turnTwo = await runTurn(runtime, {
      text: "Maria Lopez",
      messageId: "i4-2",
      channel: "messenger",
      conversationId: turnOne.conversationId,
      prospect,
      organization,
      workflowName: GENERIC_INTAKE_WORKFLOW.name
    });

    assert.strictEqual(turnTwo.decision.currentStep, "collect_email");
    console.log("✓ Workflow progresses step by step");

    const turnInterrupt = await runTurn(runtime, {
      text: "By the way, what is the job about?",
      messageId: "i4-int",
      channel: "messenger",
      conversationId: turnOne.conversationId,
      prospect,
      organization,
      workflowName: GENERIC_INTAKE_WORKFLOW.name
    });

    assert.strictEqual(turnInterrupt.decision.decisionType, DECISION_TYPE.ANSWER);
    assert.ok(turnInterrupt.response.text.toLowerCase().includes("career"));
    assert.ok(turnInterrupt.response.text.toLowerCase().includes("email"));
    console.log("✓ Interruption answered and workflow resumed");

    const turnThree = await runTurn(runtime, {
      text: "maria@example.com",
      messageId: "i4-3",
      channel: "messenger",
      conversationId: turnOne.conversationId,
      prospect,
      organization,
      workflowName: GENERIC_INTAKE_WORKFLOW.name
    });

    assert.strictEqual(turnThree.decision.currentStep, "collect_phone");

    const storedSession = await sessionStore.getSession(turnOne.conversationId);
    storedSession.lastActivityAt = new Date(Date.now() - RESUME_GAP_MS - 1000).toISOString();
    await sessionStore.saveSession(storedSession);

    runtime = createAutonomousConversationRuntime({ eventBus });

    const turnFour = await runTurn(runtime, {
      text: "813-555-0100",
      messageId: "i4-4",
      channel: "messenger",
      prospect,
      organization,
      workflowName: GENERIC_INTAKE_WORKFLOW.name
    });

    assert.ok(turnFour.resumed, "Expected conversation.resumed after gap");
    assert.strictEqual(turnFour.decision.decisionType, DECISION_TYPE.TOOL_REQUEST);
    assert.ok(turnFour.toolResults?.length >= 1, "Expected tool execution");
    assert.strictEqual(turnFour.toolResults[0].success, true);
    console.log("✓ Context recovery and tool execution after restart");

    assert.ok(turnFour.summary, "Expected conversation summary");
    assert.strictEqual(turnFour.summary.outcome, "appointment_scheduled");
    assert.ok(turnFour.summary.collectedFacts.email);
    assert.ok(turnFour.summary.toolsExecuted.length >= 1);
    console.log("✓ Conversation summary generated and persisted");

    const reloadedSummary = await sessionStore.getSummary(turnOne.conversationId);
    assert.ok(reloadedSummary, "Expected summary persisted to disk");
    assert.strictEqual(reloadedSummary.conversationId, turnOne.conversationId);

    const closedSession = await sessionStore.getSession(turnOne.conversationId);
    assert.strictEqual(closedSession.status, CONVERSATION_STATUS.CLOSED);
    console.log("✓ Session persistence survives restart");

    assert.ok(sessionEvents.started.length >= 1, "Expected conversation.started");
    assert.ok(sessionEvents.updated.length >= 4, "Expected conversation.updated");
    assert.ok(sessionEvents.resumed.length >= 1, "Expected conversation.resumed");
    assert.ok(sessionEvents.completed.length >= 1, "Expected conversation.completed");
    assert.ok(sessionEvents.summaryCreated.length >= 1, "Expected conversation.summary.created");
    assert.ok(sessionEvents.closed.length >= 1, "Expected conversation.closed");
    console.log("✓ Session lifecycle events emitted");

    assert.ok(fs.existsSync(SESSIONS_FILE), "Expected sessions file on disk");
  });

  console.log("\nAll Journey #5 Increment 4 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
