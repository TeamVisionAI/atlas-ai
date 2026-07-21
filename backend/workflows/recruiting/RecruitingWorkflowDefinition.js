/**
 * Sprint 13.1 — Team Vision recruiting workflow registration helper.
 */

const { CHANNEL } = require("../../communication/models/Channel");
const {
  TEAM_VISION_RECRUITING_WORKFLOW
} = require("./RecruitingStates");
const { createRecruitingWorkflowDefinition } = require("./RecruitingWorkflow");

const SUPPORTED_RECRUITING_CHANNELS = new Set([
  CHANNEL.MESSENGER,
  CHANNEL.INSTAGRAM,
  CHANNEL.ATLAS_CHAT
]);

/**
 * @param {import('../WorkflowEngine').WorkflowEngine} workflowEngine
 * @param {import('../../communication/events/EventBus').EventBus} eventBus
 */
function registerTeamVisionRecruitingWorkflow(workflowEngine, eventBus) {
  const definition = createRecruitingWorkflowDefinition({ eventBus });
  workflowEngine.registerWorkflow(definition);

  workflowEngine.setWorkflowResolver((context) => {
    const channel = context.conversation?.channel || context.message?.channel;

    if (!channel || !SUPPORTED_RECRUITING_CHANNELS.has(channel)) {
      return null;
    }

    return TEAM_VISION_RECRUITING_WORKFLOW.name;
  });

  return definition;
}

module.exports = {
  SUPPORTED_RECRUITING_CHANNELS,
  registerTeamVisionRecruitingWorkflow,
  createRecruitingWorkflowDefinition
};
