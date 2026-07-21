/**
 * Sprint 13.1 — Team Vision recruiting workflow step execution.
 * Owns business progression; never sends messages or calls channel APIs.
 */

const { WorkflowEvent } = require("../WorkflowEvents");
const { RecruitingContext } = require("./RecruitingContext");
const { RecruitingState, TEAM_VISION_RECRUITING_WORKFLOW } = require("./RecruitingStates");
const {
  getValidatorForState,
  getNextState,
  isTerminalState,
  isAutoAdvanceState
} = require("./RecruitingTransitions");

class RecruitingWorkflow {
  /**
   * @param {Object} [deps]
   * @param {import('../../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
  }

  /**
   * @param {import('../WorkflowContext').WorkflowContext} context
   * @param {Object} runner
   */
  async handleStep(context, runner) {
    const recruitingContext = RecruitingContext.fromEngineContext(context);
    const currentState = context.workflowState?.currentStep || RecruitingState.NEW_LEAD;

    if (isTerminalState(currentState)) {
      runner.complete(recruitingContext.toWorkflowContextPatch());
      return;
    }

    if (isAutoAdvanceState(currentState)) {
      const nextState = getNextState(currentState);

      if (!nextState) {
        return;
      }

      if (currentState === RecruitingState.REMINDER_SEQUENCE) {
        runner.complete({
          ...recruitingContext.toWorkflowContextPatch(),
          completedReason: "interview_completed"
        });
        return;
      }

      runner.advance(nextState, recruitingContext.toWorkflowContextPatch());
      return;
    }

    const newlyCollected = recruitingContext.mergeExtractedFields();

    if (newlyCollected.length > 0) {
      this._emit(WorkflowEvent.DATA_COLLECTED, {
        workflow: context.workflowState?.toJSON?.() || context.workflowState,
        fields: newlyCollected,
        collectedData: recruitingContext.collectedData
      });
    }

    const validator = getValidatorForState(currentState);

    if (!validator) {
      return;
    }

    const validation = validator(recruitingContext.collectedData);

    if (!validation.valid) {
      this._emit(WorkflowEvent.VALIDATION_FAILED, {
        workflow: context.workflowState?.toJSON?.() || context.workflowState,
        gate: validation.gate,
        missing: validation.missing,
        collectedData: recruitingContext.collectedData
      });
      return;
    }

    const nextState = getNextState(currentState);

    if (!nextState) {
      return;
    }

    const patch = recruitingContext.toWorkflowContextPatch();

    if (nextState === RecruitingState.INTERVIEW_SCHEDULED) {
      this._emit(WorkflowEvent.INTERVIEW_REQUESTED, {
        workflow: context.workflowState?.toJSON?.() || context.workflowState,
        collectedData: recruitingContext.collectedData,
        interview: {
          interviewType: recruitingContext.collectedData.interviewType,
          preferredDate: recruitingContext.collectedData.preferredDate,
          preferredTime: recruitingContext.collectedData.preferredTime
        }
      });
    }

    if (nextState === RecruitingState.INTERVIEW_COMPLETED) {
      runner.complete(patch);
      return;
    }

    runner.advance(nextState, patch);
  }

  /**
   * @param {string} eventName
   * @param {Object} payload
   */
  _emit(eventName, payload) {
    this.eventBus?.emit(eventName, payload);
  }
}

/**
 * @param {Object} [deps]
 * @param {import('../../communication/events/EventBus').EventBus} [deps.eventBus]
 * @returns {Object}
 */
function createRecruitingWorkflowDefinition(deps = {}) {
  const workflow = new RecruitingWorkflow({ eventBus: deps.eventBus });

  return {
    name: TEAM_VISION_RECRUITING_WORKFLOW.name,
    version: TEAM_VISION_RECRUITING_WORKFLOW.version,
    description: TEAM_VISION_RECRUITING_WORKFLOW.description,
    supportedChannels: TEAM_VISION_RECRUITING_WORKFLOW.supportedChannels,
    initialStep: RecruitingState.NEW_LEAD,
    handleStep: (context, runner) => workflow.handleStep(context, runner)
  };
}

module.exports = {
  RecruitingWorkflow,
  createRecruitingWorkflowDefinition
};
