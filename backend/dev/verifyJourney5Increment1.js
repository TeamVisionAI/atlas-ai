/**
 * Journey #5 Increment 1 — Conversation Core verification.
 * Run: node backend/dev/verifyJourney5Increment1.js
 */

const assert = require("assert");

const { EventBus } = require("../communication/events/EventBus");
const {
  AgentEvent,
  DECISION_TYPE,
  createConversationEngine,
  agentStore,
  buildContext,
  loadMemory,
  buildMemoryView,
  decide,
  generateResponse
} = require("../agent");

async function run() {
  console.log("Journey #5 Increment 1 — Conversation Core verification\n");

  agentStore.clearStore();

  const eventBus = new EventBus();
  const captured = {
    messageReceived: [],
    contextLoaded: [],
    memoryLoaded: [],
    decisionCreated: [],
    responseGenerated: []
  };

  eventBus.on(AgentEvent.MESSAGE_RECEIVED, (payload) =>
    captured.messageReceived.push(payload)
  );
  eventBus.on(AgentEvent.CONTEXT_LOADED, (payload) =>
    captured.contextLoaded.push(payload)
  );
  eventBus.on(AgentEvent.MEMORY_LOADED, (payload) =>
    captured.memoryLoaded.push(payload)
  );
  eventBus.on(AgentEvent.DECISION_CREATED, (payload) =>
    captured.decisionCreated.push(payload)
  );
  eventBus.on(AgentEvent.RESPONSE_GENERATED, (payload) =>
    captured.responseGenerated.push(payload)
  );

  const engine = createConversationEngine({ eventBus });

  const organization = {
    id: "org-j5",
    name: "Team Vision",
    officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  };

  const prospect = {
    id: "ATL-J5-001",
    displayName: "Maria Lopez"
  };

  const turnOne = await engine.processInbound({
    text: "Hi there",
    messageId: "msg-1",
    channel: "messenger",
    prospect,
    organization
  });

  assert.ok(turnOne.conversationId, "Expected conversation id");
  assert.ok(turnOne.context.organization?.name, "Expected organization in context");
  assert.ok(turnOne.context.workflow.currentObjective, "Expected workflow objective in context");
  assert.strictEqual(turnOne.decision.decisionType, DECISION_TYPE.ASK);
  assert.ok(turnOne.response.text.length > 0, "Expected response text");
  console.log("✓ First turn creates context, decision, and response");

  const turnTwo = await engine.processInbound({
    text: "Maria Lopez, maria@example.com, 813-555-0100",
    messageId: "msg-2",
    channel: "messenger",
    conversationId: turnOne.conversationId,
    prospect,
    organization
  });

  assert.strictEqual(turnTwo.decision.decisionType, DECISION_TYPE.TOOL_REQUEST);
  assert.ok(turnTwo.memory.collectedFacts.name?.value, "Expected name fact persisted");
  assert.ok(turnTwo.memory.collectedFacts.email?.value, "Expected email fact persisted");
  assert.ok(turnTwo.memory.collectedFacts.phone?.value, "Expected phone fact persisted");
  console.log("✓ Facts extracted and TOOL_REQUEST decision produced");

  const turnThree = await engine.processInbound({
    text: "Can I speak to a manager?",
    messageId: "msg-3",
    channel: "messenger",
    conversationId: turnOne.conversationId,
    prospect,
    organization
  });

  assert.strictEqual(turnThree.decision.decisionType, DECISION_TYPE.ESCALATE);
  console.log("✓ Escalation decision produced");

  assert.ok(captured.messageReceived.length >= 3, "Expected agent.message.received events");
  assert.ok(captured.contextLoaded.length >= 3, "Expected agent.context.loaded events");
  assert.ok(captured.memoryLoaded.length >= 3, "Expected agent.memory.loaded events");
  assert.ok(captured.decisionCreated.length >= 3, "Expected agent.decision.created events");
  assert.ok(captured.responseGenerated.length >= 3, "Expected agent.response.generated events");
  console.log("✓ All agent events emitted");

  const reloadedConversation = await agentStore.getConversation(turnOne.conversationId);
  const reloadedMemory = await loadMemory(turnOne.conversationId);
  const reloadedDecisions = await agentStore.listDecisions(turnOne.conversationId);
  const reloadedResponses = await agentStore.listResponses(turnOne.conversationId);

  assert.ok(reloadedConversation, "Expected conversation persisted");
  assert.ok(reloadedMemory.history.length >= 6, "Expected inbound and outbound history persisted");
  assert.ok(reloadedDecisions.length >= 3, "Expected decisions persisted");
  assert.ok(reloadedResponses.length >= 3, "Expected responses persisted");
  console.log("✓ Agent store persistence verified");

  const isolatedContext = buildContext(
    {
      text: "Hello",
      prospect,
      organization,
      previousMessages: []
    },
    reloadedConversation
  );
  const isolatedMemory = buildMemoryView(isolatedContext, reloadedMemory);
  const isolatedDecision = decide(isolatedContext, isolatedMemory);
  const isolatedResponse = generateResponse(isolatedDecision, isolatedContext, isolatedMemory);

  assert.ok(isolatedContext.prospect.displayName, "Context builder assembles prospect");
  assert.ok(isolatedMemory.collectedFacts.name, "Memory loader assembles facts");
  assert.ok(isolatedDecision.decisionType, "Decision engine produces decision type");
  assert.ok(isolatedResponse.length > 0, "Response generator produces text");
  assert.ok(!isolatedResponse.includes("**"), "Response avoids markdown");
  console.log("✓ Modules operate independently");

  console.log("\nAll Journey #5 Increment 1 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
