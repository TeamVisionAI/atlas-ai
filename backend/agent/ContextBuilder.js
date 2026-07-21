/**
 * Journey #5 Increment 1 — Assembles turn context. No decisions.
 */

const DEFAULT_WORKFLOW = Object.freeze({
  id: "generic-intake",
  name: "Generic Intake",
  currentStep: "collect_contact",
  currentObjective: "Collect contact information",
  requiredFields: ["name", "email", "phone"]
});

const FIELD_LABELS = Object.freeze({
  name: "full name",
  email: "email address",
  phone: "phone number",
  city: "city",
  interviewType: "preferred meeting type",
  preferredDate: "preferred date",
  preferredTime: "preferred time"
});

/**
 * @param {Object} input
 * @param {Object} conversation
 * @returns {Object}
 */
function buildContext(input, conversation) {
  const workflowSnapshot =
    input.workflow || conversation.workflowSnapshot || DEFAULT_WORKFLOW;

  return {
    organization: input.organization || conversation.organizationSnapshot || null,
    prospect: input.prospect || {
      id: conversation.prospectId,
      displayName: conversation.prospectName
    },
    conversation: {
      id: conversation.id,
      channel: conversation.channel,
      ownership: conversation.ownership,
      language: conversation.language
    },
    workflow: {
      id: workflowSnapshot.id || workflowSnapshot.name || DEFAULT_WORKFLOW.id,
      name: workflowSnapshot.name || input.workflowName || DEFAULT_WORKFLOW.name,
      workflowName: input.workflowName || workflowSnapshot.name || DEFAULT_WORKFLOW.name,
      currentStep: workflowSnapshot.currentStep || DEFAULT_WORKFLOW.currentStep,
      currentObjective:
        workflowSnapshot.currentObjective || DEFAULT_WORKFLOW.currentObjective,
      requiredFields:
        workflowSnapshot.requiredFields || DEFAULT_WORKFLOW.requiredFields
    },
    knownFacts: input.knownFacts || {},
    previousMessages: input.previousMessages || [],
    meetingState: input.meetingState || conversation.meetingStateSnapshot || null,
    currentTime: input.currentTime || new Date().toISOString(),
    language: input.language || conversation.language || "en",
    inboundMessage: {
      id: input.messageId || null,
      text: input.text || "",
      channel: input.channel || conversation.channel,
      timestamp: input.timestamp || new Date().toISOString()
    }
  };
}

function getFieldLabel(fieldName) {
  return FIELD_LABELS[fieldName] || fieldName.replace(/([A-Z])/g, " $1").trim();
}

module.exports = {
  DEFAULT_WORKFLOW,
  buildContext,
  getFieldLabel
};
