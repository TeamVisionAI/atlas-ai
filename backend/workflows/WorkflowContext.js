/**
 * Sprint 13.0 — Context passed to every workflow step handler.
 */

class WorkflowContext {
  /**
   * @param {Object} params
   * @param {Object|null} [params.prospect]
   * @param {Object|null} [params.conversation]
   * @param {import('../communication/models/GatewayMessage').GatewayMessage|null} [params.message]
   * @param {Object|null} [params.operator]
   * @param {import('./WorkflowState').WorkflowState|null} [params.workflowState]
   * @param {Object|null} [params.aiResult]
   * @param {import('../communication/models/GatewayMessage').GatewayMessage|null} [params.outboundMessage]
   * @param {Object} [params.metadata]
   */
  constructor({
    prospect = null,
    conversation = null,
    message = null,
    operator = null,
    workflowState = null,
    aiResult = null,
    outboundMessage = null,
    metadata = {}
  } = {}) {
    this.prospect = prospect;
    this.conversation = conversation;
    this.message = message;
    this.operator = operator;
    this.workflowState = workflowState;
    this.aiResult = aiResult;
    this.outboundMessage = outboundMessage;
    this.metadata = metadata;
  }

  /**
   * @param {Object} params
   * @returns {WorkflowContext}
   */
  static fromGatewayPayload({
    prospect = null,
    conversation = null,
    inboundMessage = null,
    operator = null,
    workflowState = null,
    aiResult = null,
    outboundMessage = null,
    metadata = {}
  }) {
    return new WorkflowContext({
      prospect,
      conversation,
      message: inboundMessage,
      operator,
      workflowState,
      aiResult,
      outboundMessage,
      metadata
    });
  }

  /**
   * @param {Object} patch
   * @returns {WorkflowContext}
   */
  with(patch = {}) {
    return new WorkflowContext({
      prospect: patch.prospect !== undefined ? patch.prospect : this.prospect,
      conversation: patch.conversation !== undefined ? patch.conversation : this.conversation,
      message: patch.message !== undefined ? patch.message : this.message,
      operator: patch.operator !== undefined ? patch.operator : this.operator,
      workflowState:
        patch.workflowState !== undefined ? patch.workflowState : this.workflowState,
      aiResult: patch.aiResult !== undefined ? patch.aiResult : this.aiResult,
      outboundMessage:
        patch.outboundMessage !== undefined ? patch.outboundMessage : this.outboundMessage,
      metadata: { ...this.metadata, ...(patch.metadata || {}) }
    });
  }

  toJSON() {
    return {
      prospect: this.prospect,
      conversation: this.conversation,
      message: this.message,
      operator: this.operator,
      workflowState: this.workflowState?.toJSON?.() || this.workflowState,
      aiResult: this.aiResult,
      outboundMessage: this.outboundMessage,
      metadata: this.metadata
    };
  }
}

module.exports = {
  WorkflowContext
};
