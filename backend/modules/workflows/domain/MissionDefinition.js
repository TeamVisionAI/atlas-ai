/**
 * Sprint 12.2 Phase 3 — Workflow-produced mission definition (Mission Engine compatible shape).
 */

const { MISSION_STATUS, buildMissionId, isValidMissionType } = require("../../../core/configuration/missionTypes");
const { getAgentActionLabel } = require("../../../core/agentActionRegistry");
const { WorkflowDomainError } = require("./WorkflowDomainError");

function createMissionDefinition(input = {}) {
  const {
    prospectId,
    organizationId,
    missionType,
    priority,
    reason,
    title,
    description,
    estimatedMinutes = 5,
    dueDate = null,
    primaryActionId,
    sourceEventType,
    sourceEventId,
    metadata = {}
  } = input;

  if (!prospectId || !missionType) {
    throw new WorkflowDomainError("Mission definition requires prospectId and missionType.", {
      code: "INVALID_MISSION_DEFINITION"
    });
  }

  if (!isValidMissionType(missionType)) {
    throw new WorkflowDomainError(`Unknown mission type "${missionType}".`, {
      code: "UNKNOWN_MISSION_TYPE"
    });
  }

  return Object.freeze({
    id: buildMissionId(prospectId, missionType),
    prospectId,
    organizationId: organizationId || null,
    missionType,
    priority: priority || "Medium",
    status: MISSION_STATUS.PENDING,
    title: title || missionType,
    description: description || reason || title || missionType,
    reason: reason || description || title || missionType,
    estimatedMinutes,
    dueDate,
    primaryAction: primaryActionId
      ? {
          id: primaryActionId,
          label: getAgentActionLabel(primaryActionId)
        }
      : null,
    secondaryActions: [],
    sourceEventType: sourceEventType || null,
    sourceEventId: sourceEventId || null,
    metadata,
    createdAt: input.createdAt || new Date().toISOString()
  });
}

module.exports = {
  createMissionDefinition
};
