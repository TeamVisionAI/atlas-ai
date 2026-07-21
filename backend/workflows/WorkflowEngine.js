/**
 * Sprint 13.0 — Workflow Engine foundation.
 * Decides which business workflow executes after the Communication Platform produces an AI response.
 */

const { WorkflowEvent } = require("./WorkflowEvents");
const { WorkflowContext } = require("./WorkflowContext");
const { WorkflowRegistry } = require("./WorkflowRegistry");
const { WorkflowRunner } = require("./WorkflowRunner");
const { WorkflowState, WorkflowStateStore, WorkflowStatus } = require("./WorkflowState");

class WorkflowEngine {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   * @param {WorkflowRegistry} [deps.registry]
   * @param {WorkflowStateStore} [deps.stateStore]
   * @param {WorkflowRunner} [deps.runner]
   * @param {import('../operators/OperatorService').OperatorService|null} [deps.operatorService]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.registry = deps.registry || new WorkflowRegistry();
    this.stateStore = deps.stateStore || new WorkflowStateStore();
    this.runner = deps.runner || new WorkflowRunner();
    this.operatorService = deps.operatorService || null;
  }

  /**
   * @param {Object} definition
   */
  registerWorkflow(definition) {
    return this.registry.register(definition);
  }

  /**
   * @returns {string[]}
   */
  listWorkflows() {
    return this.registry.list();
  }

  /**
   * @param {string} workflowName
   * @param {import('./WorkflowContext').WorkflowContext|Object} contextInput
   * @returns {Promise<WorkflowState>}
   */
  async startWorkflow(workflowName, contextInput) {
    const definition = this.registry.get(workflowName);

    if (!definition) {
      throw new Error(`Unknown workflow: ${workflowName}`);
    }

    const context = this._toContext(contextInput);
    const now = new Date().toISOString();
    const workflowId = crypto.randomUUID();

    const state = new WorkflowState({
      workflowId,
      workflowName,
      currentStep: definition.initialStep,
      status: WorkflowStatus.RUNNING,
      startedAt: now,
      updatedAt: now,
      conversationId: context.conversation?.id || null,
      atlasProspectId: context.prospect?.atlasId || context.conversation?.atlasProspectId || null,
      context: {}
    });

    this.stateStore.save(state);

    this._emit(WorkflowEvent.STARTED, {
      workflow: state.toJSON(),
      context: context.toJSON()
    });

    const updated = await this._runCurrentStep(definition, state, context);

    return updated;
  }

  /**
   * @param {string} workflowId
   * @param {import('./WorkflowContext').WorkflowContext|Object} [contextInput]
   * @returns {Promise<WorkflowState|null>}
   */
  async resumeWorkflow(workflowId, contextInput = {}) {
    const state = this.stateStore.getById(workflowId);

    if (!state) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (state.status === WorkflowStatus.COMPLETED) {
      return state;
    }

    if (state.status === WorkflowStatus.CANCELLED) {
      throw new Error(`Workflow is cancelled: ${workflowId}`);
    }

    if (state.status === WorkflowStatus.FAILED) {
      throw new Error(`Workflow has failed: ${workflowId}`);
    }

    const definition = this.registry.get(state.workflowName);

    if (!definition) {
      throw new Error(`Workflow definition missing: ${state.workflowName}`);
    }

    const context = await this._buildContext(contextInput, state);

    if (state.status === WorkflowStatus.PAUSED) {
      state.status = WorkflowStatus.RUNNING;
      state.touch();
      this.stateStore.save(state);
      this._emit(WorkflowEvent.RESUMED, {
        workflow: state.toJSON(),
        context: context.toJSON()
      });
    }

    return this._runCurrentStep(definition, state, context);
  }

  /**
   * @param {string} workflowId
   * @param {string} [reason]
   * @returns {WorkflowState|null}
   */
  pauseWorkflow(workflowId, reason = null) {
    const state = this.stateStore.getById(workflowId);

    if (!state) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (
      state.status === WorkflowStatus.COMPLETED ||
      state.status === WorkflowStatus.CANCELLED ||
      state.status === WorkflowStatus.FAILED
    ) {
      return state;
    }

    state.status = WorkflowStatus.PAUSED;
    state.touch();
    this.stateStore.save(state);

    this._emit(WorkflowEvent.PAUSED, {
      workflow: state.toJSON(),
      reason
    });

    return state;
  }

  /**
   * @param {string} workflowId
   * @param {Object} [data]
   * @returns {WorkflowState|null}
   */
  completeWorkflow(workflowId, data = {}) {
    const state = this.stateStore.getById(workflowId);

    if (!state) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (state.status === WorkflowStatus.COMPLETED) {
      return state;
    }

    state.status = WorkflowStatus.COMPLETED;
    state.completedAt = new Date().toISOString();
    state.context = { ...state.context, ...data };
    state.touch();
    this.stateStore.save(state);

    this._emit(WorkflowEvent.COMPLETED, {
      workflow: state.toJSON()
    });

    return state;
  }

  /**
   * @param {string} workflowId
   * @param {string} [reason]
   * @returns {WorkflowState|null}
   */
  cancelWorkflow(workflowId, reason = null) {
    const state = this.stateStore.getById(workflowId);

    if (!state) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (state.status === WorkflowStatus.COMPLETED) {
      return state;
    }

    state.status = WorkflowStatus.CANCELLED;
    state.completedAt = new Date().toISOString();
    state.touch();
    this.stateStore.save(state);

    this._emit(WorkflowEvent.CANCELLED, {
      workflow: state.toJSON(),
      reason
    });

    return state;
  }

  /**
   * @param {string} workflowId
   * @param {import('./WorkflowContext').WorkflowContext|Object} contextInput
   * @returns {Promise<WorkflowState|null>}
   */
  async advanceWorkflow(workflowId, contextInput = {}) {
    return this.resumeWorkflow(workflowId, contextInput);
  }

  /**
   * Called by Communication Gateway after AI generates a response.
   * @param {Object} payload
   */
  async processAfterAiResponse(payload) {
    const context = await this._buildContext(payload);
    const conversationId = context.conversation?.id;

    if (!conversationId) {
      return null;
    }

    let state = this.stateStore.getActiveByConversation(conversationId);

    if (!state) {
      const workflowName = this._resolveWorkflowName(context);

      if (!workflowName) {
        return null;
      }

      return this.startWorkflow(workflowName, context);
    }

    if (state.status === WorkflowStatus.PAUSED) {
      return this.resumeWorkflow(state.workflowId, context);
    }

    if (state.status === WorkflowStatus.RUNNING) {
      const definition = this.registry.get(state.workflowName);

      if (!definition) {
        return state;
      }

      return this._runCurrentStep(definition, state, context);
    }

    return state;
  }

  /**
   * @param {string} workflowId
   * @returns {WorkflowState|null}
   */
  getWorkflow(workflowId) {
    return this.stateStore.getById(workflowId);
  }

  /**
   * @param {string} conversationId
   * @returns {WorkflowState|null}
   */
  getActiveWorkflowForConversation(conversationId) {
    return this.stateStore.getActiveByConversation(conversationId);
  }

  /**
   * @param {import('./WorkflowContext').WorkflowContext} context
   * @returns {string|null}
   */
  _resolveWorkflowName(context) {
    void context;
    return null;
  }

  /**
   * @param {import('./WorkflowContext').WorkflowContext|Object} contextInput
   * @param {WorkflowState} [workflowState]
   * @returns {Promise<WorkflowContext>}
   */
  async _buildContext(contextInput, workflowState = null) {
    if (contextInput instanceof WorkflowContext) {
      return workflowState ? contextInput.with({ workflowState }) : contextInput;
    }

    const context = WorkflowContext.fromGatewayPayload({
      ...contextInput,
      workflowState: workflowState || contextInput.workflowState || null
    });

    if (!context.operator && context.conversation?.assignedOperatorId && this.operatorService) {
      const operator = await this.operatorService.getOperator(
        context.conversation.assignedOperatorId
      );

      return context.with({ operator });
    }

    return context;
  }

  _toContext(contextInput) {
    if (contextInput instanceof WorkflowContext) {
      return contextInput;
    }

    return WorkflowContext.fromGatewayPayload(contextInput);
  }

  /**
   * @param {Object} definition
   * @param {WorkflowState} state
   * @param {WorkflowContext} context
   */
  async _runCurrentStep(definition, state, context) {
    const previousStep = state.currentStep;
    const transition = await this.runner.runStep(definition, state, context);

    if (transition.data && typeof transition.data === "object") {
      state.context = { ...state.context, ...transition.data };
    }

    if (transition.failed) {
      state.status = WorkflowStatus.FAILED;
      state.completedAt = new Date().toISOString();
      state.context = {
        ...state.context,
        lastError: transition.error || "Workflow step failed"
      };
      state.touch();
      this.stateStore.save(state);

      this._emit(WorkflowEvent.FAILED, {
        workflow: state.toJSON(),
        error: transition.error || "Workflow step failed"
      });

      return state;
    }

    if (transition.pause) {
      state.status = WorkflowStatus.PAUSED;
      state.touch();
      this.stateStore.save(state);

      this._emit(WorkflowEvent.PAUSED, {
        workflow: state.toJSON()
      });

      return state;
    }

    if (transition.complete) {
      state.status = WorkflowStatus.COMPLETED;
      state.completedAt = new Date().toISOString();
      state.touch();
      this.stateStore.save(state);

      this._emit(WorkflowEvent.COMPLETED, {
        workflow: state.toJSON()
      });

      return state;
    }

    if (transition.nextStep && transition.nextStep !== state.currentStep) {
      state.currentStep = transition.nextStep;
      state.status = WorkflowStatus.RUNNING;
      state.touch();
      this.stateStore.save(state);

      this._emit(WorkflowEvent.STEP_CHANGED, {
        workflow: state.toJSON(),
        previousStep,
        currentStep: state.currentStep
      });
    } else {
      state.status = WorkflowStatus.RUNNING;
      state.touch();
      this.stateStore.save(state);
    }

    return state;
  }

  _emit(eventName, payload) {
    this.eventBus?.emit(eventName, payload);
  }
}

module.exports = {
  WorkflowEngine
};
