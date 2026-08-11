/**
 * Sprint 18.1 — Quick Capture post-create guidance from workflow engines.
 */

const { buildProfileFromProspect, getMissingFields } = require("./informationModel");
const { assessQualificationFromProspect } = require("./recruitingQualificationEngine");
const { buildRequiredInputs } = require("./conversationOutcomeEngine");
const { loadPersistedWorkflowState } = require("./workflowStateStore");
const { MILESTONES } = require("./workflowConstants");

const RECOMMENDED_ACTIONS = Object.freeze({
  REQUIRED_INFORMATION: "required_information",
  SCHEDULE_INTERVIEW: "schedule_interview",
  CONVERSATION_OUTCOME: "conversation_outcome",
  COMPLETE_FNA: "complete_fna",
  START_ORIENTATION: "start_orientation",
  COLLECT_LICENSE: "collect_license",
  FOLLOW_UP: "follow_up",
  SEND_ZOOM_LINK: "send_zoom_link"
});

const ESTIMATED_MINUTES = Object.freeze({
  [RECOMMENDED_ACTIONS.REQUIRED_INFORMATION]: 2,
  [RECOMMENDED_ACTIONS.SCHEDULE_INTERVIEW]: 5,
  [RECOMMENDED_ACTIONS.CONVERSATION_OUTCOME]: 2,
  [RECOMMENDED_ACTIONS.COMPLETE_FNA]: 10,
  [RECOMMENDED_ACTIONS.START_ORIENTATION]: 5,
  [RECOMMENDED_ACTIONS.COLLECT_LICENSE]: 8,
  [RECOMMENDED_ACTIONS.FOLLOW_UP]: 3,
  [RECOMMENDED_ACTIONS.SEND_ZOOM_LINK]: 1
});

async function resolveQuickCaptureRecommendedAction(prospect) {
  const assessment = assessQualificationFromProspect(prospect);
  const profile = buildProfileFromProspect(prospect);
  const missingFields = getMissingFields(profile);
  const requiredInputs = buildRequiredInputs(prospect, profile, missingFields);
  const workflow = await loadPersistedWorkflowState(prospect.phone, {
    organizationId: prospect.organization_id || null,
    prospectId: prospect.id || null
  });
  const milestone = workflow?.canonicalMilestone || MILESTONES.NEW_LEAD;

  if (requiredInputs.length > 0 || assessment.preScheduleFields?.length > 0) {
    return RECOMMENDED_ACTIONS.REQUIRED_INFORMATION;
  }

  if (milestone === MILESTONES.LICENSING) {
    return RECOMMENDED_ACTIONS.COLLECT_LICENSE;
  }

  if (milestone === MILESTONES.ORIENTATION) {
    return RECOMMENDED_ACTIONS.START_ORIENTATION;
  }

  if (milestone === MILESTONES.FOLLOW_UP) {
    return RECOMMENDED_ACTIONS.FOLLOW_UP;
  }

  if (assessment.readyForScheduling || missingFields.includes("schedule")) {
    return RECOMMENDED_ACTIONS.SCHEDULE_INTERVIEW;
  }

  if (profile.interviewType?.toLowerCase?.().includes("zoom") && missingFields.includes("email")) {
    return RECOMMENDED_ACTIONS.SEND_ZOOM_LINK;
  }

  return RECOMMENDED_ACTIONS.CONVERSATION_OUTCOME;
}

async function buildQuickCaptureGuidance(prospect) {
  const recommendedAction = await resolveQuickCaptureRecommendedAction(prospect);

  return {
    recommendedAction,
    estimatedMinutes: ESTIMATED_MINUTES[recommendedAction] || 2
  };
}

module.exports = {
  RECOMMENDED_ACTIONS,
  ESTIMATED_MINUTES,
  resolveQuickCaptureRecommendedAction,
  buildQuickCaptureGuidance
};
