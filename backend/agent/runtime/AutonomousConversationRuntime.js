/**
 * Journey #5 Increment 4 — Autonomous conversation orchestrator.
 * Connects Conversation Core, Workflow Intelligence, and Tool Execution.
 */

const { EventBus } = require("../../communication/events/EventBus");
const { createConversationEngine } = require("../ConversationEngine");
const { DECISION_TYPE } = require("../DecisionRecord");
const { DEFAULT_WORKFLOW_NAME } = require("../../workflows/intelligence/WorkflowLoader");
const { getFactValue } = require("../../workflows/intelligence/WorkflowValidator");
const { SessionEvent } = require("./SessionEvents");
const { CONVERSATION_STATUS } = require("./ConversationState");
const sessionStore = require("./ConversationSession");
const { recoverContext } = require("./ContextRecovery");
const { buildConversationSummary } = require("./ConversationSummary");
const {
  resolveOutcome,
  resolveStatus,
  shouldClose
} = require("./ConversationLifecycle");
const { enhanceResponseForInterruption } = require("./InterruptionHandler");

const RESUME_GAP_MS = 60 * 60 * 1000;

function buildSessionFromTurn(session, turnResult, isNewSession) {
  const { conversationId, context, memory, navigation, decision, toolResults = [] } =
    turnResult;
  const pendingQuestions = navigation?.missingInformation?.length
    ? navigation.missingInformation.map((field) => `Collect ${field}`)
    : [];

  const completedActions = [...(session?.completedActions || [])];

  if (decision.decisionType === DECISION_TYPE.ASK) {
    completedActions.push(`Asked for ${decision.missingInformation[0]}`);
  }

  if (toolResults.length > 0) {
    completedActions.push("Tool execution attempted");
  }

  const toolExecutions = [
    ...(session?.toolExecutions || []),
    ...toolResults.map((entry) => ({
      toolName: entry.toolName,
      operation: entry.operation,
      success: entry.success,
      correlationId: entry.correlationId,
      timestamp: entry.timestamp
    }))
  ];

  const escalations =
    decision.decisionType === DECISION_TYPE.ESCALATE
      ? [...(session?.escalations || []), { reason: decision.reason, at: decision.timestamp }]
      : session?.escalations || [];

  return {
    conversationId,
    prospectId: context.prospect?.id || session?.prospectId,
    organizationId: context.organization?.id || session?.organizationId || null,
    workflowName: turnResult.workflow?.name || session?.workflowName || DEFAULT_WORKFLOW_NAME,
    currentStep: navigation?.currentStep || null,
    currentObjective: navigation?.currentObjective || null,
    collectedFacts: memory.collectedFacts,
    pendingQuestions,
    completedActions,
    toolExecutions,
    status: isNewSession ? CONVERSATION_STATUS.STARTED : session?.status || CONVERSATION_STATUS.ACTIVE,
    outcome: session?.outcome || null,
    escalations,
    openTasks: navigation?.isComplete ? [] : pendingQuestions,
    lastActivityAt: new Date().toISOString(),
    startedAt: session?.startedAt || new Date().toISOString(),
    completedAt: session?.completedAt || null,
    closedAt: session?.closedAt || null
  };
}

class AutonomousConversationRuntime {
  /**
   * @param {Object} [deps]
   * @param {import('../../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.conversationEngine =
      deps.conversationEngine ||
      createConversationEngine({ eventBus: deps.eventBus || null });
  }

  /**
   * @param {Object} input
   * @returns {Promise<Object>}
   */
  async processMessage(input) {
    const recovery = await recoverContext(input);
    const isNewSession = !recovery.conversation;
    const isResumed =
      recovery.recovered &&
      !isNewSession &&
      recovery.session?.lastActivityAt &&
      Date.now() - new Date(recovery.session.lastActivityAt).getTime() > RESUME_GAP_MS;

    const workflowName =
      input.workflowName ||
      recovery.workflowName ||
      DEFAULT_WORKFLOW_NAME;

    const engineInput = {
      ...input,
      workflowName,
      conversationId: recovery.conversation?.id || input.conversationId || null,
      enhanceResponse: (responseText, turnContext) =>
        enhanceResponseForInterruption(responseText, turnContext)
    };

    const turnResult = await this.conversationEngine.processInbound(engineInput);
    let session = buildSessionFromTurn(recovery.session, turnResult, isNewSession);

    session.status = resolveStatus(turnResult.decision, turnResult.toolResults);
    session.outcome = resolveOutcome(turnResult.decision, turnResult.toolResults);

    if (isNewSession) {
      this.eventBus?.emit(SessionEvent.STARTED, {
        conversationId: turnResult.conversationId,
        prospectId: session.prospectId,
        workflowName: session.workflowName
      });
    }

    if (isResumed) {
      this.eventBus?.emit(SessionEvent.RESUMED, {
        conversationId: turnResult.conversationId,
        prospectId: session.prospectId,
        currentStep: session.currentStep,
        pendingQuestions: session.pendingQuestions
      });
    }

    this.eventBus?.emit(SessionEvent.UPDATED, {
      conversationId: turnResult.conversationId,
      session,
      decision: turnResult.decision
    });

    let summary = null;

    if (shouldClose(turnResult.decision, turnResult.toolResults)) {
      session.status = CONVERSATION_STATUS.COMPLETED;
      session.completedAt = new Date().toISOString();

      summary = buildConversationSummary({
        ...turnResult,
        session
      });
      await sessionStore.saveSummary(summary);

      this.eventBus?.emit(SessionEvent.COMPLETED, {
        conversationId: turnResult.conversationId,
        outcome: session.outcome
      });

      this.eventBus?.emit(SessionEvent.SUMMARY_CREATED, {
        conversationId: turnResult.conversationId,
        summary
      });

      session.status = CONVERSATION_STATUS.CLOSED;
      session.closedAt = new Date().toISOString();

      this.eventBus?.emit(SessionEvent.CLOSED, {
        conversationId: turnResult.conversationId,
        outcome: session.outcome
      });
    } else {
      session.status = CONVERSATION_STATUS.ACTIVE;
    }

    session = await sessionStore.saveSession(session);

    return {
      ...turnResult,
      session,
      summary,
      recovered: recovery.recovered,
      resumed: isResumed
    };
  }
}

function createAutonomousConversationRuntime(options = {}) {
  return new AutonomousConversationRuntime({
    eventBus: options.eventBus || new EventBus(),
    conversationEngine: options.conversationEngine
  });
}

module.exports = {
  AutonomousConversationRuntime,
  createAutonomousConversationRuntime,
  RESUME_GAP_MS
};
