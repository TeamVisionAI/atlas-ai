/**
 * Milestone 4 PR-1.1 — Single mission decision context for all mission endpoints.
 */

const { findProspectInOrganization } = require("../services/supabaseService");
const { getOrganizationSettings } = require("./organizationSettingsEngine");
const { getMissionControlState } = require("./missionControlReadModel");
const { fetchConversationThread } = require("./missionControlLiveReadModel");
const { buildWorkflowReadModel } = require("./workflowReadModel");
const { buildConversationOutcomeReadModel } = require("./conversationOutcomeEngine");
const { loadAgentState } = require("./agentActionState");
const { resolveAvailableActions } = require("./agentActionEngine");
const { isProductionProspect } = require("./productionProspectFilter");

/**
 * @param {Object} params
 * @param {Object} params.prospect
 * @param {Object} params.brain
 * @param {Object} params.agentState
 * @param {Array} [params.conversationMessages]
 */
async function composeMissionDecisionContext({
  prospect,
  brain,
  agentState,
  conversationMessages = []
}) {
  const organizationSettings = getOrganizationSettings();

  const [workflow, conversationOutcome] = await Promise.all([
    buildWorkflowReadModel({ prospect, brain, agentState }),
    Promise.resolve(
      buildConversationOutcomeReadModel({
        prospect,
        brain,
        conversationMessages
      })
    )
  ]);

  const availableActions = resolveAvailableActions({
    prospect,
    currentStep: brain.currentStep,
    missingFields: brain.missingFields,
    interviewType: brain.interviewType,
    agentState,
    organizationSettings
  });

  return {
    prospect,
    brain,
    agentState,
    conversationOutcome,
    workflow,
    availableActions,
    conversationMessages
  };
}

/**
 * Loads the canonical mission context used by Mission Engine and Mission Control.
 *
 * @param {string} phone
 * @param {string} organizationId
 * @param {Object} [options]
 * @param {Array} [options.conversationMessages] — skip fetch when already loaded
 * @param {Object} [options.latestMessage] — optional hint for mission control state
 */
async function buildMissionContext(phone, organizationId, options = {}) {
  if (!phone || !organizationId || !isProductionProspect(phone)) {
    return null;
  }

  const prospect = await findProspectInOrganization(phone, organizationId);

  if (!prospect) {
    return null;
  }

  const conversationMessages =
    options.conversationMessages ??
    (await fetchConversationThread(phone));

  const latestMessage =
    options.latestMessage ||
    conversationMessages[conversationMessages.length - 1] ||
    null;

  const missionControl = await getMissionControlState(phone, {
    organizationId,
    ...(latestMessage ? { latestMessage } : {})
  });

  if (!missionControl) {
    return null;
  }

  const agentState = loadAgentState(phone);

  return composeMissionDecisionContext({
    prospect,
    brain: missionControl.brain,
    agentState,
    conversationMessages
  });
}

module.exports = {
  composeMissionDecisionContext,
  buildMissionContext
};
