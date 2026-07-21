/**
 * Journey #5 Increment 4 — Restore conversation context after gaps.
 */

const agentStore = require("../AgentStore");
const { loadMemory } = require("../MemoryLoader");
const { getState: getWorkflowState } = require("../../workflows/intelligence/WorkflowState");
const sessionStore = require("./ConversationSession");
const { CONVERSATION_STATUS } = require("./ConversationState");

/**
 * @param {Object} input
 * @returns {Promise<Object>}
 */
async function recoverContext(input) {
  const prospectId = input.prospect?.id || input.prospectId;
  const organizationId = input.organization?.id || input.organizationId || null;

  let conversation = null;
  let session = null;

  if (input.conversationId) {
    conversation = await agentStore.getConversation(input.conversationId);
    session = conversation ? await sessionStore.getSession(conversation.id) : null;
  }

  if (!conversation && prospectId) {
    session = await sessionStore.findActiveSessionByProspect(prospectId, organizationId);
    conversation = session
      ? await agentStore.getConversation(session.conversationId)
      : await agentStore.findConversationByProspect(prospectId, organizationId);
  }

  if (!conversation) {
    return {
      recovered: false,
      conversation: null,
      session: null,
      memory: null,
      workflowState: null
    };
  }

  if (!session) {
    session = await sessionStore.getSession(conversation.id);
  }

  const memory = await loadMemory(conversation.id);
  const workflowState = await getWorkflowState(conversation.id);

  return {
    recovered: Boolean(session || memory.history.length > 0),
    conversation,
    session,
    memory,
    workflowState,
    workflowName:
      session?.workflowName ||
      conversation.workflowSnapshot?.name ||
      input.workflowName ||
      null,
    pendingQuestions: session?.pendingQuestions || memory.pendingTasks || [],
    currentStep: session?.currentStep || workflowState?.currentStep || null,
    wasClosed: session?.status === CONVERSATION_STATUS.CLOSED
  };
}

module.exports = {
  recoverContext
};
