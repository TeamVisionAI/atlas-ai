/**
 * Journey #5 Increment 2 — Conversation Core with workflow intelligence.
 * Transforms inbound messages into Decision Records and responses.
 * No workflow execution. No business service calls.
 */

const { EventBus } = require("../communication/events/EventBus");
const { AgentEvent } = require("./AgentEvents");
const agentStore = require("./AgentStore");
const { buildContext } = require("./ContextBuilder");
const { loadMemory, buildMemoryView } = require("./MemoryLoader");
const { DECISION_TYPE } = require("./DecisionRecord");
const { decide } = require("./DecisionEngine");
const { generateResponse } = require("./ResponseGenerator");
const { createToolExecutor, buildToolRequests } = require("./tools");
const {
  DEFAULT_WORKFLOW_NAME,
  loadWorkflow,
  getOrCreateState,
  saveState,
  navigate,
  buildNextState,
  WorkflowIntelligenceEvent
} = require("../workflows/intelligence");

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;
const LOCATION_PATTERN = /^([A-Za-z .'-]+),\s*([A-Z]{2})$/i;
const GREETING_PATTERN = /^(hi|hello|hey|thanks|thank you|good morning|good afternoon|see you)[!.?\s]*$/i;

function isLikelyName(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed || GREETING_PATTERN.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/);

  if (words.length < 2 || words.length > 4) {
    return false;
  }

  const firstWord = words[0].toLowerCase();
  return !["hi", "hello", "hey", "thanks", "thank", "yo", "good"].includes(firstWord);
}

function extractFactsFromText(text, targetField = null) {
  const facts = {};
  const trimmed = String(text || "").trim();

  if (!trimmed) {
    return facts;
  }

  const emailMatch = trimmed.match(EMAIL_PATTERN);
  const phoneMatch = trimmed.match(PHONE_PATTERN);
  const locationMatch = trimmed.match(LOCATION_PATTERN);

  if (emailMatch) {
    facts.email = emailMatch[0];
  }

  if (phoneMatch) {
    facts.phone = phoneMatch[0];
  }

  if (locationMatch) {
    facts.city = locationMatch[1].trim();
    facts.state = locationMatch[2].trim();
  }

  if (targetField === "name" || (!emailMatch && !phoneMatch && !locationMatch && !targetField)) {
    const namePart = trimmed.split(",")[0]?.trim();

    if (isLikelyName(namePart)) {
      facts.name = namePart;
    }
  }

  if (/virtual|zoom|online/i.test(trimmed)) {
    facts.interviewType = "zoom";
  } else if (/in person|office|in-person/i.test(trimmed)) {
    facts.interviewType = "office";
  }

  if (/tomorrow/i.test(trimmed)) {
    facts.preferredDate = "tomorrow";
  }

  if (/morning|afternoon|evening/i.test(trimmed)) {
    facts.preferredTime = trimmed.match(/morning|afternoon|evening/i)[0].toLowerCase();
  }

  if (targetField && trimmed && !facts[targetField]) {
    if (targetField === "email" && emailMatch) {
      facts.email = emailMatch[0];
    } else if (targetField === "phone" && phoneMatch) {
      facts.phone = phoneMatch[0];
    } else if (targetField === "name" && isLikelyName(trimmed.split(",")[0].trim())) {
      facts.name = trimmed.split(",")[0].trim();
    } else if (
      targetField !== "name" &&
      targetField !== "email" &&
      targetField !== "phone" &&
      !facts[targetField]
    ) {
      facts[targetField] = trimmed;
    }
  }

  return facts;
}

function promoteFacts(memory, extractedFacts, source = "prospect") {
  const collectedFacts = { ...memory.collectedFacts };
  const timestamp = new Date().toISOString();

  for (const [key, value] of Object.entries(extractedFacts)) {
    if (!value) {
      continue;
    }

    collectedFacts[key] = {
      value,
      source,
      confidence: "high",
      collectedAt: timestamp
    };
  }

  return collectedFacts;
}

function buildSummary(memoryView, navigation) {
  const parts = [];
  const name = memoryView.collectedFacts.name?.value;

  if (name) {
    parts.push(`Prospect name is ${name}.`);
  }

  if (navigation?.currentObjective) {
    parts.push(`Current objective: ${navigation.currentObjective}.`);
  }

  if (navigation?.currentStep) {
    parts.push(`Current step: ${navigation.currentStep}.`);
  }

  return parts.join(" ");
}

function detectCompletedSteps(previousState, navigation) {
  const previous = new Set(previousState?.completedSteps || []);
  return navigation.completedSteps.filter((stepId) => !previous.has(stepId));
}

class ConversationEngine {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.toolExecutor =
      deps.toolExecutor ||
      createToolExecutor({ eventBus: deps.eventBus || null });
  }

  /**
   * @param {Object} input
   * @returns {Promise<Object>}
   */
  async processInbound(input) {
    const prospectId = input.prospect?.id || input.prospectId || "PROSPECT-UNKNOWN";
    const organizationId = input.organization?.id || input.organizationId || null;
    const workflowName =
      input.workflowName || input.workflow?.name || DEFAULT_WORKFLOW_NAME;

    let conversation = input.conversationId
      ? await agentStore.getConversation(input.conversationId)
      : await agentStore.findConversationByProspect(prospectId, organizationId);

    if (!conversation) {
      conversation = await agentStore.saveConversation({
        id: crypto.randomUUID(),
        organizationId,
        prospectId,
        prospectName: input.prospect?.displayName || "Prospect",
        channel: input.channel || "unknown",
        ownership: input.ownership || "ATLAS",
        workflowSnapshot: { name: workflowName },
        organizationSnapshot: input.organization || null,
        meetingStateSnapshot: input.meetingState || null,
        language: input.language || "en"
      });
    }

    this.eventBus?.emit(AgentEvent.MESSAGE_RECEIVED, {
      conversationId: conversation.id,
      messageId: input.messageId || null,
      text: input.text || "",
      channel: input.channel || conversation.channel,
      prospectId
    });

    await agentStore.appendMessage(conversation.id, {
      role: "prospect",
      text: input.text || "",
      messageId: input.messageId || null,
      timestamp: input.timestamp
    });

    const memory = await loadMemory(conversation.id);
    const context = buildContext(
      {
        ...input,
        workflowName,
        previousMessages: memory.history
      },
      conversation
    );

    this.eventBus?.emit(AgentEvent.CONTEXT_LOADED, {
      conversationId: conversation.id,
      context
    });

    const contract = loadWorkflow(workflowName, this.eventBus, {
      conversationId: conversation.id
    });
    let workflowState = await getOrCreateState(conversation.id, workflowName, contract);

    let memoryView = buildMemoryView(context, memory);

    this.eventBus?.emit(AgentEvent.MEMORY_LOADED, {
      conversationId: conversation.id,
      memory: memoryView
    });

    let navigation = navigate(context, memoryView, contract, workflowState);
    const targetField = navigation.missingInformation[0] || null;
    const extracted =
      input.extractedFacts ||
      extractFactsFromText(input.text || "", targetField);

    if (Object.keys(extracted).length > 0) {
      memoryView.collectedFacts = promoteFacts(memory, extracted);
      navigation = navigate(context, memoryView, contract, workflowState);
    }

    const completedSteps = detectCompletedSteps(workflowState, navigation);

    for (const stepId of completedSteps) {
      this.eventBus?.emit(WorkflowIntelligenceEvent.STEP_COMPLETED, {
        conversationId: conversation.id,
        workflowName: contract.name,
        stepId
      });
    }

    const nextWorkflowState = buildNextState(
      conversation.id,
      contract,
      navigation,
      workflowState
    );
    workflowState = await saveState(nextWorkflowState);

    this.eventBus?.emit(WorkflowIntelligenceEvent.STATE_UPDATED, {
      conversationId: conversation.id,
      workflowName: contract.name,
      state: workflowState,
      navigation
    });

    if (navigation.isComplete) {
      this.eventBus?.emit(WorkflowIntelligenceEvent.READY, {
        conversationId: conversation.id,
        workflowName: contract.name,
        completionPercent: navigation.completionPercent
      });
    }

    const decision = decide(context, memoryView, {
      contract,
      navigation
    });
    await agentStore.saveDecision(decision);

    this.eventBus?.emit(AgentEvent.DECISION_CREATED, {
      conversationId: conversation.id,
      decision
    });

    let toolResults = [];

    if (decision.decisionType === DECISION_TYPE.TOOL_REQUEST) {
      const correlationId = crypto.randomUUID();
      const toolRequests = buildToolRequests({
        decision,
        contract,
        conversation,
        context,
        memoryView,
        prospect: context.prospect,
        correlationId,
        eventBus: this.eventBus
      });

      if (toolRequests.length > 0) {
        toolResults = await this.toolExecutor.executeChain(toolRequests);
      }
    }

    const responseText =
      typeof input.enhanceResponse === "function"
        ? input.enhanceResponse(
            generateResponse(decision, context, memoryView),
            { decision, context, memoryView, navigation, workflow: contract }
          )
        : generateResponse(decision, context, memoryView);
    const response = await agentStore.saveResponse({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      decisionId: decision.id,
      text: responseText,
      timestamp: new Date().toISOString()
    });

    await agentStore.appendMessage(conversation.id, {
      role: "atlas",
      text: responseText,
      messageId: response.id
    });

    const latestMemory = await loadMemory(conversation.id);
    const updatedMemory = await agentStore.saveMemory(conversation.id, {
      ...latestMemory,
      collectedFacts: memoryView.collectedFacts,
      summary: buildSummary(memoryView, navigation) || latestMemory.summary,
      pendingTasks: navigation.isComplete
        ? []
        : navigation.missingInformation.map((field) => `Collect ${field}`),
      completedTasks: navigation.isComplete
        ? [
            ...latestMemory.completedTasks,
            `${contract.name} complete`,
            ...(toolResults.some((entry) => entry.success)
              ? ["Tool execution completed"]
              : [])
          ]
        : latestMemory.completedTasks
    });

    await agentStore.saveConversation({
      ...conversation,
      workflowSnapshot: {
        name: contract.name,
        currentStep: navigation.currentStep,
        currentObjective: navigation.currentObjective,
        completionPercent: navigation.completionPercent
      }
    });

    this.eventBus?.emit(AgentEvent.RESPONSE_GENERATED, {
      conversationId: conversation.id,
      decision,
      response
    });

    return {
      conversationId: conversation.id,
      context,
      memory: updatedMemory,
      workflow: contract,
      workflowState,
      navigation,
      decision,
      response,
      toolResults
    };
  }
}

function createConversationEngine(options = {}) {
  return new ConversationEngine({
    eventBus: options.eventBus || new EventBus()
  });
}

module.exports = {
  ConversationEngine,
  createConversationEngine,
  extractFactsFromText,
  promoteFacts
};
