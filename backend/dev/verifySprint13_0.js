/**
 * Sprint 13.0 — Workflow Engine foundation verification.
 * Run: node backend/dev/verifySprint13_0.js
 */

const assert = require("assert");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { CHANNEL } = require("../communication/models/Channel");
const { WorkflowEvent, WorkflowStatus } = require("../workflows");

const SAMPLE_WEBHOOK = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      messaging: [
        {
          sender: { id: "USER_PSID_WF" },
          recipient: { id: "PAGE_ID" },
          timestamp: 1520383572,
          message: {
            mid: "mid.$sprint130",
            text: "Workflow engine test"
          }
        }
      ]
    }
  ]
};

class MockAIAdapter extends AIAdapter {
  async generateReply(inboundMessage) {
    return {
      text: `AI: ${inboundMessage.text}`,
      provider: "mock"
    };
  }
}

async function run() {
  console.log("Sprint 13.0 — Workflow Engine foundation verification\n");

  const { gateway, eventBus, workflowEngine, messengerConnector } = createCommunicationGateway({
    aiAdapter: new MockAIAdapter(),
    registerRecruitingWorkflow: false
  });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  const capturedEvents = [];

  const offStarted = eventBus.on(WorkflowEvent.STARTED, (payload) => {
    capturedEvents.push({ type: WorkflowEvent.STARTED, payload });
  });
  const offStepChanged = eventBus.on(WorkflowEvent.STEP_CHANGED, (payload) => {
    capturedEvents.push({ type: WorkflowEvent.STEP_CHANGED, payload });
  });
  const offCompleted = eventBus.on(WorkflowEvent.COMPLETED, (payload) => {
    capturedEvents.push({ type: WorkflowEvent.COMPLETED, payload });
  });

  workflowEngine.registerWorkflow({
    name: "RecruitingWorkflow",
    initialStep: "greeting",
    steps: {
      greeting: async (context, runner) => {
        runner.advance("qualification", {
          greetedAt: context.message?.timestamp || new Date().toISOString()
        });
      },
      qualification: async (_context, runner) => {
        runner.complete({ qualified: true });
      }
    }
  });

  workflowEngine.registerWorkflow({
    name: "ClientSupportWorkflow",
    initialStep: "intake",
    steps: {
      intake: async (_context, runner) => {
        runner.pause({ waitingForAgent: true });
      }
    }
  });

  assert.deepStrictEqual(workflowEngine.listWorkflows().sort(), [
    "ClientSupportWorkflow",
    "RecruitingWorkflow"
  ]);
  console.log("✓ Workflows register by name");

  const pass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  const conversationId = pass[0].conversation.id;
  const prospect = pass[0].prospect;

  assert.strictEqual(pass[0].workflowResult, null, "Gateway should not auto-start workflows");
  console.log("✓ Gateway passes AI response to Workflow Engine without auto-start");

  const started = await workflowEngine.startWorkflow("RecruitingWorkflow", {
    prospect,
    conversation: pass[0].conversation,
    inboundMessage: pass[0].message
  });

  assert.strictEqual(started.workflowName, "RecruitingWorkflow");
  assert.strictEqual(started.currentStep, "qualification");
  assert.strictEqual(started.status, WorkflowStatus.RUNNING);
  assert.ok(started.context.greetedAt);
  console.log("✓ Workflows can start and advance state");

  assert.ok(
    capturedEvents.some((event) => event.type === WorkflowEvent.STARTED),
    "Expected workflow.started event"
  );
  assert.ok(
    capturedEvents.some((event) => event.type === WorkflowEvent.STEP_CHANGED),
    "Expected workflow.stepChanged event"
  );
  console.log("✓ Workflow events emitted on start and step change");

  const secondPass = await gateway.receive(CHANNEL.MESSENGER, SAMPLE_WEBHOOK);
  const workflowAfterSecondMessage = workflowEngine.getWorkflow(started.workflowId);

  assert.strictEqual(workflowAfterSecondMessage.workflowId, started.workflowId);
  assert.strictEqual(workflowAfterSecondMessage.status, WorkflowStatus.COMPLETED);
  assert.strictEqual(secondPass[0].workflowResult.workflowId, started.workflowId);
  assert.strictEqual(secondPass[0].workflowResult.status, WorkflowStatus.COMPLETED);
  console.log("✓ Gateway resumes active workflow after AI response");

  assert.ok(workflowAfterSecondMessage.context.qualified);
  assert.ok(
    capturedEvents.some((event) => event.type === WorkflowEvent.COMPLETED),
    "Expected workflow.completed event"
  );
  console.log("✓ Workflows can complete and emit workflow.completed");

  const pausedWorkflow = await workflowEngine.startWorkflow("ClientSupportWorkflow", {
    prospect,
    conversation: pass[0].conversation,
    inboundMessage: pass[0].message
  });

  assert.strictEqual(pausedWorkflow.status, WorkflowStatus.PAUSED);
  assert.strictEqual(pausedWorkflow.context.waitingForAgent, true);
  console.log("✓ Workflows can pause");

  const resumed = await workflowEngine.resumeWorkflow(pausedWorkflow.workflowId, {
    prospect,
    conversation: pass[0].conversation
  });

  assert.strictEqual(resumed.status, WorkflowStatus.PAUSED);
  console.log("✓ Workflows can resume paused instances");

  const cancelled = workflowEngine.cancelWorkflow(pausedWorkflow.workflowId, "test cleanup");
  assert.strictEqual(cancelled.status, WorkflowStatus.CANCELLED);
  console.log("✓ Workflows can cancel");

  offStarted();
  offStepChanged();
  offCompleted();

  console.log("\nAll Sprint 13.0 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
