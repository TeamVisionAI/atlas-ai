/**
 * Sprint 13.1 — Team Vision recruiting workflow exports.
 */

const { RecruitingState, RECRUITING_STATE_ORDER, TEAM_VISION_RECRUITING_WORKFLOW } =
  require("./RecruitingStates");
const {
  ValidationGate,
  validateLocation,
  validateWorkAuthorization,
  validateContactInformation,
  validateInterviewType,
  validateInterviewSchedule,
  getValidatorForState,
  getNextState,
  isTerminalState,
  isAutoAdvanceState
} = require("./RecruitingTransitions");
const { RecruitingContext } = require("./RecruitingContext");
const { RecruitingWorkflow, createRecruitingWorkflowDefinition } = require("./RecruitingWorkflow");
const {
  SUPPORTED_RECRUITING_CHANNELS,
  registerTeamVisionRecruitingWorkflow
} = require("./RecruitingWorkflowDefinition");

module.exports = {
  RecruitingState,
  RECRUITING_STATE_ORDER,
  TEAM_VISION_RECRUITING_WORKFLOW,
  ValidationGate,
  validateLocation,
  validateWorkAuthorization,
  validateContactInformation,
  validateInterviewType,
  validateInterviewSchedule,
  getValidatorForState,
  getNextState,
  isTerminalState,
  isAutoAdvanceState,
  RecruitingContext,
  RecruitingWorkflow,
  createRecruitingWorkflowDefinition,
  SUPPORTED_RECRUITING_CHANNELS,
  registerTeamVisionRecruitingWorkflow
};
