/**
 * Sprint 13.1 — Team Vision Recruiting Workflow verification.
 * Run: node backend/dev/verifySprint13_1.js
 */

const assert = require("assert");

const { AIAdapter } = require("../communication/ai/AIAdapter");
const { createCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { CHANNEL } = require("../communication/models/Channel");
const {
  WorkflowEvent,
  WorkflowStatus,
  TEAM_VISION_RECRUITING_WORKFLOW,
  RecruitingState
} = require("../workflows");
const {
  validateLocation,
  validateWorkAuthorization,
  validateContactInformation,
  validateInterviewType,
  validateInterviewSchedule
} = require("../workflows/recruiting");

function buildWebhook(text, senderId = "USER_PSID_TV") {
  return {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: "PAGE_ID" },
            timestamp: 1520383572,
            message: {
              mid: `mid.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
              text
            }
          }
        ]
      }
    ]
  };
}

class RecruitingMockAIAdapter extends AIAdapter {
  async generateReply(inboundMessage) {
    const text = inboundMessage.text || "";
    const extracted = {};

    if (/tampa|miami|orlando/i.test(text)) {
      extracted.city = text.includes("Tampa") ? "Tampa" : "Miami";
      extracted.state = "FL";
    }

    if (/^yes$/i.test(text.trim())) {
      extracted.authorizedToWork = true;
    }

    if (/^no$/i.test(text.trim())) {
      extracted.authorizedToWork = false;
    }

    if (text.includes("@")) {
      extracted.email = text
        .match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0]
        ?.replace(/[,.;]+$/, "");
    }

    if (/\d{3}/.test(text)) {
      extracted.phone = text.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/)?.[0];
    }

    if (/maria/i.test(text)) {
      extracted.name = "Maria Lopez";
    }

    if (/office|presencial/i.test(text)) {
      extracted.interviewType = "office";
    }

    if (/zoom|virtual/i.test(text)) {
      extracted.interviewType = "zoom";
    }

    if (/tomorrow|monday|tuesday|friday/i.test(text)) {
      extracted.preferredDate = text.match(/tomorrow|monday|tuesday|friday/i)?.[0];
    }

    if (/morning|afternoon|\d{1,2}(?::\d{2})?\s*(?:am|pm)/i.test(text)) {
      extracted.preferredTime = text.match(/morning|afternoon|\d{1,2}(?::\d{2})?\s*(?:am|pm)/i)?.[0];
    }

    return {
      text: `AI: ${text}`,
      provider: "mock",
      extracted
    };
  }
}

async function receive(gateway, text) {
  const result = await gateway.receive(CHANNEL.MESSENGER, buildWebhook(text));
  return result[0];
}

async function run() {
  console.log("Sprint 13.1 — Team Vision Recruiting Workflow verification\n");

  const { gateway, eventBus, workflowEngine, messengerConnector } = createCommunicationGateway({
    aiAdapter: new RecruitingMockAIAdapter()
  });

  messengerConnector.sendMessage = async () => ({
    success: true,
    providerMessageId: "mock.outbound"
  });

  const capturedEvents = [];

  for (const eventName of [
    WorkflowEvent.STARTED,
    WorkflowEvent.STEP_CHANGED,
    WorkflowEvent.VALIDATION_FAILED,
    WorkflowEvent.DATA_COLLECTED,
    WorkflowEvent.INTERVIEW_REQUESTED,
    WorkflowEvent.COMPLETED
  ]) {
    eventBus.on(eventName, (payload) => {
      capturedEvents.push({ type: eventName, payload });
    });
  }

  assert.ok(
    workflowEngine.listWorkflows().includes(TEAM_VISION_RECRUITING_WORKFLOW.name),
    "Recruiting workflow should be registered"
  );
  console.log("✓ Recruiting Workflow registered");

  assert.ok(validateLocation({ city: "Tampa", state: "FL" }).valid);
  assert.ok(!validateLocation({ city: "Tampa" }).valid);
  assert.ok(validateWorkAuthorization({ authorizedToWork: true }).valid);
  assert.ok(!validateContactInformation({ name: "Maria" }).valid);
  assert.ok(validateInterviewType({ interviewType: "office" }).valid);
  assert.ok(
    validateInterviewSchedule({
      interviewType: "office",
      preferredDate: "tomorrow",
      preferredTime: "morning"
    }).valid
  );
  console.log("✓ Validation gates implemented");

  let pass = await receive(gateway, "Hi, I'm interested in the opportunity");
  let workflow = pass.workflowResult;

  assert.strictEqual(workflow.workflowName, TEAM_VISION_RECRUITING_WORKFLOW.name);
  assert.strictEqual(workflow.currentStep, RecruitingState.GREETING);
  assert.strictEqual(workflow.status, WorkflowStatus.RUNNING);
  console.log("✓ Workflow auto-starts after first AI response");

  pass = await receive(gateway, "Hello");
  workflow = pass.workflowResult;

  assert.strictEqual(workflow.currentStep, RecruitingState.GREETING);
  assert.ok(
    capturedEvents.some((event) => event.type === WorkflowEvent.VALIDATION_FAILED),
    "Expected validation failure before location is collected"
  );
  console.log("✓ Missing location blocks progression");

  pass = await receive(gateway, "Tampa, FL");
  workflow = pass.workflowResult;

  assert.strictEqual(workflow.currentStep, RecruitingState.LOCATION_COLLECTED);
  assert.strictEqual(workflow.context.collectedData.city, "Tampa");
  assert.strictEqual(workflow.context.collectedData.state, "FL");
  assert.ok(
    capturedEvents.some((event) => event.type === WorkflowEvent.DATA_COLLECTED),
    "Expected workflow.dataCollected event"
  );
  console.log("✓ Location collected and stored in workflow context");

  pass = await receive(gateway, "yes");
  workflow = pass.workflowResult;
  assert.strictEqual(workflow.currentStep, RecruitingState.WORK_AUTHORIZATION_VERIFIED);
  assert.strictEqual(workflow.context.collectedData.authorizedToWork, true);
  console.log("✓ Work authorization verified");

  pass = await receive(gateway, "Tell me more");
  workflow = pass.workflowResult;
  assert.strictEqual(workflow.currentStep, RecruitingState.OPPORTUNITY_EXPLAINED);
  console.log("✓ Opportunity explained phase reached");

  pass = await receive(gateway, "Maria Lopez, maria@example.com, 813-555-0100");
  workflow = pass.workflowResult;
  assert.strictEqual(workflow.currentStep, RecruitingState.CONTACT_INFORMATION_COLLECTED);
  assert.strictEqual(workflow.context.collectedData.name, "Maria Lopez");
  assert.strictEqual(workflow.context.collectedData.email, "maria@example.com");
  assert.ok(workflow.context.collectedData.phone);
  console.log("✓ Contact information collected");

  pass = await receive(gateway, "office interview please");
  workflow = pass.workflowResult;
  assert.strictEqual(workflow.currentStep, RecruitingState.INTERVIEW_TYPE_SELECTED);
  assert.strictEqual(workflow.context.collectedData.interviewType, "office");
  console.log("✓ Interview type selected");

  pass = await receive(gateway, "tomorrow morning");
  workflow = pass.workflowResult;
  assert.strictEqual(workflow.currentStep, RecruitingState.INTERVIEW_SCHEDULED);
  assert.strictEqual(workflow.context.collectedData.preferredDate, "tomorrow");
  assert.strictEqual(workflow.context.collectedData.preferredTime, "morning");
  assert.ok(
    capturedEvents.some((event) => event.type === WorkflowEvent.INTERVIEW_REQUESTED),
    "Expected workflow.interviewRequested event"
  );
  console.log("✓ Interview request recorded without scheduling integration");

  pass = await receive(gateway, "Thanks");
  workflow = pass.workflowResult;
  assert.strictEqual(workflow.currentStep, RecruitingState.REMINDER_SEQUENCE);
  console.log("✓ Reminder sequence state reached (no reminders implemented yet)");

  pass = await receive(gateway, "See you then");
  workflow = pass.workflowResult;
  assert.strictEqual(workflow.status, WorkflowStatus.COMPLETED);
  assert.ok(
    capturedEvents.some((event) => event.type === WorkflowEvent.COMPLETED),
    "Expected workflow.completed event"
  );
  console.log("✓ Workflow completes at INTERVIEW_COMPLETED");

  assert.ok(
    capturedEvents.filter((event) => event.type === WorkflowEvent.STEP_CHANGED).length >= 8,
    "Expected multiple stepChanged events across the journey"
  );
  console.log("✓ Workflow advances through recruiting states");

  console.log("\nAll Sprint 13.1 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
