/**
 * Sprint 13.0 — Executes a single workflow step and returns transition instructions.
 */

class WorkflowRunner {
  /**
   * @param {Object} workflowDefinition
   * @param {import('./WorkflowState').WorkflowState} workflowState
   * @param {import('./WorkflowContext').WorkflowContext} context
   * @returns {Promise<Object>}
   */
  async runStep(workflowDefinition, workflowState, context) {
    const stepName = workflowState.currentStep;
    const stepHandler =
      workflowDefinition.steps?.[stepName] || workflowDefinition.handleStep;

    if (typeof stepHandler !== "function") {
      return {
        failed: true,
        error: `No handler for workflow step "${stepName}"`
      };
    }

    const controls = this._createControls();

    try {
      const result = await stepHandler(context.with({ workflowState }), controls);

      if (controls._resolved) {
        return controls._result;
      }

      return this._normalizeResult(result);
    } catch (error) {
      return {
        failed: true,
        error: error.message || "Workflow step failed"
      };
    }
  }

  _createControls() {
    const controls = {
      _resolved: false,
      _result: null,
      advance(nextStep, data = {}) {
        controls._resolved = true;
        controls._result = { nextStep, data };
      },
      complete(data = {}) {
        controls._resolved = true;
        controls._result = { complete: true, data };
      },
      pause(data = {}) {
        controls._resolved = true;
        controls._result = { pause: true, data };
      },
      fail(error = "Workflow step failed") {
        controls._resolved = true;
        controls._result = {
          failed: true,
          error: typeof error === "string" ? error : error.message
        };
      }
    };

    return controls;
  }

  _normalizeResult(result) {
    if (!result || typeof result !== "object") {
      return {};
    }

    return result;
  }
}

module.exports = {
  WorkflowRunner
};
