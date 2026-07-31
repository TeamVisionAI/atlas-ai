/**
 * Sprint 12.2 Phase 3 — Workflow Engine.
 * Evaluates business events and produces mission definitions without mutating Mission Control.
 */

const { AppointmentWorkflowEvaluator } = require("./AppointmentWorkflowEvaluator");
const { WorkflowMissionRegistry } = require("./WorkflowMissionRegistry");

class WorkflowEngine {
  /**
   * @param {Object} [deps]
   * @param {WorkflowMissionRegistry} [deps.registry]
   * @param {Array<{ supports: Function, evaluate: Function }>} [deps.evaluators]
   */
  constructor(deps = {}) {
    this.registry = deps.registry || new WorkflowMissionRegistry();
    this.evaluators = deps.evaluators || [new AppointmentWorkflowEvaluator(deps.appointmentEvaluator)];
  }

  evaluateEvent(businessEvent = {}) {
    const missions = [];

    for (const evaluator of this.evaluators) {
      if (!evaluator.supports(businessEvent)) {
        continue;
      }

      missions.push(...evaluator.evaluate(businessEvent));
    }

    return missions;
  }

  async handleEvent(businessEvent = {}) {
    try {
      const missions = this.evaluateEvent(businessEvent);
      this.registry.upsertFromEvent(businessEvent, missions);
      return missions;
    } catch (error) {
      console.error("[WorkflowEngine] failed to handle business event", {
        eventType: businessEvent.eventType,
        eventId: businessEvent.eventId,
        message: error.message
      });
      return [];
    }
  }

  getMissionDefinitionsForProspect(prospectKey) {
    return this.registry.getMissionDefinitionsForProspect(prospectKey);
  }

  getMissionDefinitionsForEvent(eventId) {
    return this.registry.getMissionDefinitionsForEvent(eventId);
  }
}

module.exports = {
  WorkflowEngine
};
