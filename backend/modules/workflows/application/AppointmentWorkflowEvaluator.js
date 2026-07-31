/**
 * Sprint 12.2 Phase 3 — Evaluates appointment business events using configuration rules.
 */

const {
  EVENT_CATEGORIES,
  getEventCategory
} = require("../../business-events/domain/EventTypes");
const {
  getAppointmentWorkflowRules,
  APPOINTMENT_WORKFLOW_EVENT_TYPES
} = require("../configuration/appointmentWorkflowRules");
const { createMissionDefinition } = require("../domain/MissionDefinition");

class AppointmentWorkflowEvaluator {
  constructor({ rulesResolver = getAppointmentWorkflowRules } = {}) {
    this.rulesResolver = rulesResolver;
  }

  supports(businessEvent = {}) {
    if (!businessEvent.eventType) {
      return false;
    }

    if (APPOINTMENT_WORKFLOW_EVENT_TYPES.includes(businessEvent.eventType)) {
      return true;
    }

    return getEventCategory(businessEvent.eventType) === EVENT_CATEGORIES.APPOINTMENT;
  }

  evaluate(businessEvent = {}) {
    if (!this.supports(businessEvent)) {
      return [];
    }

    const rules = this.rulesResolver(businessEvent.eventType);

    if (!rules.length) {
      return [];
    }

    const prospectId = this.resolveProspectId(businessEvent);
    const organizationId =
      businessEvent.metadata?.organizationId || businessEvent.payload?.organizationId || null;

    return rules.map((rule) =>
      createMissionDefinition({
        prospectId,
        organizationId,
        missionType: rule.missionType,
        priority: rule.priority,
        reason: rule.reason,
        title: rule.title,
        description: rule.description,
        estimatedMinutes: rule.estimatedMinutes,
        dueDate: rule.dueDate || null,
        primaryActionId: rule.primaryActionId,
        sourceEventType: businessEvent.eventType,
        sourceEventId: businessEvent.eventId,
        metadata: {
          appointmentId: businessEvent.payload?.appointmentId || null,
          scheduledTime: businessEvent.payload?.scheduledTime || null,
          currentState: businessEvent.payload?.currentState || null,
          previousState: businessEvent.payload?.previousState || null,
          ownerRepId: businessEvent.payload?.ownerRepId || null,
          appointmentType: businessEvent.payload?.appointmentType || null
        },
        createdAt: businessEvent.timestamp || new Date().toISOString()
      })
    );
  }

  resolveProspectId(businessEvent = {}) {
    return (
      businessEvent.payload?.prospectPhone ||
      businessEvent.payload?.phone ||
      businessEvent.prospectId ||
      null
    );
  }
}

module.exports = {
  AppointmentWorkflowEvaluator
};
