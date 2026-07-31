/**
 * Sprint 12.2 Phase 3 — Configuration-driven appointment event → mission rules.
 * Extend this map to add workflow behavior without changing engine code.
 */

const { ACTION_IDS } = require("../../../core/agentActionEngine");
const { MISSION_TYPES } = require("../../../core/configuration/missionTypes");
const { MISSION_PRIORITIES } = require("../../../core/configuration/missionPriorities");
const { APPOINTMENT_EVENTS } = require("../../business-events/domain/EventTypes");

const APPOINTMENT_WORKFLOW_RULES = Object.freeze({
  [APPOINTMENT_EVENTS.APPOINTMENT_CREATED]: [
    {
      missionType: MISSION_TYPES.REVIEW_PROSPECT,
      priority: MISSION_PRIORITIES.LOW,
      primaryActionId: ACTION_IDS.NOTES,
      reason: "Review prospect details before the scheduled interview.",
      estimatedMinutes: 5
    }
  ],
  [APPOINTMENT_EVENTS.APPOINTMENT_CONFIRMED]: [],
  [APPOINTMENT_EVENTS.APPOINTMENT_RESCHEDULED]: [
    {
      missionType: MISSION_TYPES.REVIEW_PROSPECT,
      priority: MISSION_PRIORITIES.MEDIUM,
      primaryActionId: ACTION_IDS.RESCHEDULE,
      reason: "Confirm the rescheduled interview details with the prospect.",
      estimatedMinutes: 5
    }
  ],
  [APPOINTMENT_EVENTS.APPOINTMENT_CANCELLED]: [
    {
      missionType: MISSION_TYPES.RESCHEDULE_INTERVIEW,
      priority: MISSION_PRIORITIES.MEDIUM,
      primaryActionId: ACTION_IDS.RESCHEDULE,
      reason: "Appointment was cancelled — offer a new time.",
      estimatedMinutes: 10
    }
  ],
  [APPOINTMENT_EVENTS.APPOINTMENT_COMPLETED]: [
    {
      missionType: MISSION_TYPES.FOLLOW_UP,
      priority: MISSION_PRIORITIES.MEDIUM,
      primaryActionId: ACTION_IDS.WHATSAPP,
      reason: "Follow up after the interview was completed.",
      estimatedMinutes: 10
    }
  ],
  [APPOINTMENT_EVENTS.APPOINTMENT_NO_SHOW]: [
    {
      missionType: MISSION_TYPES.FOLLOW_UP,
      priority: MISSION_PRIORITIES.HIGH,
      primaryActionId: ACTION_IDS.CALL,
      reason: "Prospect missed the scheduled interview.",
      estimatedMinutes: 10
    },
    {
      missionType: MISSION_TYPES.RESCHEDULE_INTERVIEW,
      priority: MISSION_PRIORITIES.HIGH,
      primaryActionId: ACTION_IDS.RESCHEDULE,
      reason: "Reschedule the interview after a no-show.",
      estimatedMinutes: 10
    }
  ],
  [APPOINTMENT_EVENTS.APPOINTMENT_RECRUITED]: [
    {
      missionType: MISSION_TYPES.BEGIN_ONBOARDING,
      priority: MISSION_PRIORITIES.HIGH,
      primaryActionId: ACTION_IDS.NOTES,
      reason: "Prospect was recruited — begin onboarding.",
      estimatedMinutes: 15
    }
  ],
  [APPOINTMENT_EVENTS.APPOINTMENT_BECAME_CLIENT]: [
    {
      missionType: MISSION_TYPES.REVIEW_FNA,
      priority: MISSION_PRIORITIES.HIGH,
      primaryActionId: ACTION_IDS.NOTES,
      reason: "Prospect became a client — review FNA next steps.",
      estimatedMinutes: 15
    }
  ],
  [APPOINTMENT_EVENTS.APPOINTMENT_HUMAN_ASSIST]: [
    {
      missionType: MISSION_TYPES.CALL_PROSPECT,
      priority: MISSION_PRIORITIES.CRITICAL,
      primaryActionId: ACTION_IDS.CALL,
      reason: "Human assist was requested for this appointment.",
      estimatedMinutes: 10
    }
  ],
  [APPOINTMENT_EVENTS.INTERVIEW_COMPLETED]: [
    {
      missionType: MISSION_TYPES.ENTER_INTERVIEW_OUTCOME,
      priority: MISSION_PRIORITIES.MEDIUM,
      primaryActionId: ACTION_IDS.ENTER_INTERVIEW_OUTCOME,
      reason: "Capture or confirm the interview outcome.",
      estimatedMinutes: 5
    }
  ]
});

const APPOINTMENT_WORKFLOW_EVENT_TYPES = Object.freeze(Object.keys(APPOINTMENT_WORKFLOW_RULES));

function getAppointmentWorkflowRules(eventType) {
  return APPOINTMENT_WORKFLOW_RULES[eventType] || [];
}

module.exports = {
  APPOINTMENT_WORKFLOW_RULES,
  APPOINTMENT_WORKFLOW_EVENT_TYPES,
  getAppointmentWorkflowRules
};
