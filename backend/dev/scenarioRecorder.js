/**
 * Sprint 8A.4a — Records simulator scenario runs for golden scenario reports.
 */

const crypto = require("crypto");

function createScenarioRecorder(scenarioName) {
  const correlationId = `scenario:${scenarioName}:${crypto.randomUUID()}`;

  return {
    scenarioName,
    correlationId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    initialState: null,
    actionsPerformed: [],
    eventsEmitted: [],
    finalState: null,
    expectedResult: null,
    actualResult: null,
    pass: null,
    timestamps: [],

    setInitialState(state) {
      this.initialState = state;
      this._stamp("initial_state_captured");
    },

    recordAction(action, result = {}) {
      this.actionsPerformed.push({
        action,
        at: new Date().toISOString(),
        resultSummary: {
          success: result.success,
          error: result.error || null,
          targetMilestone: result.targetMilestone || null
        }
      });
      this._stamp(`action:${action}`);

      if (Array.isArray(result.eventsEmitted)) {
        this.eventsEmitted.push(...result.eventsEmitted);
      }
    },

    setExpected(expected) {
      this.expectedResult = expected;
    },

    finalize(finalState, actualResult) {
      this.finalState = finalState;
      this.actualResult = actualResult;
      this.completedAt = new Date().toISOString();
      this.pass = evaluatePass(this.expectedResult, actualResult);
      this._stamp("scenario_completed");
      return this.toReport();
    },

    _stamp(label) {
      this.timestamps.push({ label, at: new Date().toISOString() });
    },

    toReport() {
      return {
        scenarioName: this.scenarioName,
        correlationId: this.correlationId,
        startedAt: this.startedAt,
        completedAt: this.completedAt,
        initialState: this.initialState,
        actionsPerformed: this.actionsPerformed,
        eventsEmitted: [...new Set(this.eventsEmitted)],
        finalState: this.finalState,
        expectedResult: this.expectedResult,
        actualResult: this.actualResult,
        pass: this.pass,
        timestamps: this.timestamps
      };
    }
  };
}

function evaluatePass(expected, actual) {
  if (!expected) {
    return actual?.success !== false;
  }

  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) {
      return false;
    }
  }

  return true;
}

module.exports = {
  createScenarioRecorder,
  evaluatePass
};
