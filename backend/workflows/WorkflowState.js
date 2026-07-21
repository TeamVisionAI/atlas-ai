/**
 * Sprint 13.0 — Workflow instance state model and in-memory store.
 */

const WorkflowStatus = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed"
});

class WorkflowState {
  /**
   * @param {Object} params
   * @param {string} params.workflowId
   * @param {string} params.workflowName
   * @param {string} params.currentStep
   * @param {string} [params.status]
   * @param {string} params.startedAt
   * @param {string} params.updatedAt
   * @param {string|null} [params.completedAt]
   * @param {string|null} [params.conversationId]
   * @param {string|null} [params.atlasProspectId]
   * @param {Object} [params.context]
   */
  constructor(params) {
    this.workflowId = params.workflowId;
    this.workflowName = params.workflowName;
    this.currentStep = params.currentStep;
    this.status = params.status || WorkflowStatus.PENDING;
    this.startedAt = params.startedAt;
    this.updatedAt = params.updatedAt;
    this.completedAt = params.completedAt || null;
    this.conversationId = params.conversationId || null;
    this.atlasProspectId = params.atlasProspectId || null;
    this.context = params.context || {};
  }

  touch() {
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      currentStep: this.currentStep,
      status: this.status,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      conversationId: this.conversationId,
      atlasProspectId: this.atlasProspectId,
      context: this.context
    };
  }
}

class WorkflowStateStore {
  constructor() {
    /** @type {Map<string, WorkflowState>} */
    this._byId = new Map();
    /** @type {Map<string, string>} */
    this._activeByConversation = new Map();
  }

  /**
   * @param {WorkflowState} state
   */
  save(state) {
    this._byId.set(state.workflowId, state);

    if (
      state.conversationId &&
      state.status !== WorkflowStatus.COMPLETED &&
      state.status !== WorkflowStatus.CANCELLED &&
      state.status !== WorkflowStatus.FAILED
    ) {
      this._activeByConversation.set(state.conversationId, state.workflowId);
    }

    if (
      state.conversationId &&
      (state.status === WorkflowStatus.COMPLETED ||
        state.status === WorkflowStatus.CANCELLED ||
        state.status === WorkflowStatus.FAILED)
    ) {
      const activeId = this._activeByConversation.get(state.conversationId);

      if (activeId === state.workflowId) {
        this._activeByConversation.delete(state.conversationId);
      }
    }
  }

  /**
   * @param {string} workflowId
   * @returns {WorkflowState|null}
   */
  getById(workflowId) {
    return this._byId.get(workflowId) || null;
  }

  /**
   * @param {string} conversationId
   * @returns {WorkflowState|null}
   */
  getActiveByConversation(conversationId) {
    const workflowId = this._activeByConversation.get(conversationId);

    if (!workflowId) {
      return null;
    }

    return this._byId.get(workflowId) || null;
  }

  /**
   * @returns {WorkflowState[]}
   */
  listAll() {
    return Array.from(this._byId.values());
  }

  clear() {
    this._byId.clear();
    this._activeByConversation.clear();
  }
}

module.exports = {
  WorkflowStatus,
  WorkflowState,
  WorkflowStateStore
};
