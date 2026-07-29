/**
 * Sprint 18.3 — Mission Engine v1.
 * Milestone 4 (RX) PR-1 — expanded mission types + never-empty primary mission.
 * Orchestrates "what should the recruiter do next?" — no business-rule duplication.
 * Delegates state detection to Workflow Engine outputs and existing action resolution.
 */

const { loadProspectsForOrganization } = require("../services/supabaseService");
const {
  ACTION_IDS,
  isWorkflowGateActive,
  isFollowUpDue,
  deriveMilestoneLabel,
  getInterviewTimingPhase
} = require("./agentActionEngine");
const { getAgentActionLabel, toMissionAction } = require("./agentActionRegistry");
const { MILESTONES } = require("./workflowConstants");
const {
  MISSION_TYPES,
  MISSION_STATUS,
  buildMissionId
} = require("./configuration/missionTypes");
const { MISSION_PRIORITIES, sortMissions } = require("./configuration/missionPriorities");
const {
  isInterestedOutcome,
  isFollowUpOutcome,
  isScheduleMissionBlockingOutcome
} = require("./configuration/workflowOutcomeConstants");
const { buildMissionContext } = require("./missionContextBuilder");
const { isProductionProspect, filterProductionProspects } = require("./productionProspectFilter");

const CLOSED_MILESTONES = new Set([MILESTONES.CLOSED, MILESTONES.DO_NOT_CONTACT]);

const QUALIFICATION_FIELD_LABELS = Object.freeze({
  city: "City",
  state: "State",
  authorization: "Immigration status",
  occupation: "Occupation",
  interview_type: "Interview type",
  email: "Email",
  name: "Name",
  schedule: "Interview schedule"
});

function startOfDayIso(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function summarizeProspect(prospect) {
  return {
    id: prospect.id || null,
    phone: prospect.phone,
    name:
      prospect.name ||
      [prospect.first_name, prospect.last_name].filter(Boolean).join(" ").trim() ||
      prospect.phone,
    currentStep: prospect.current_step || null
  };
}

function summarizeWorkflowState(workflow, conversationOutcome) {
  const recordedOutcome =
    conversationOutcome?.recordedOutcome?.label ||
    conversationOutcome?.recordedOutcome?.key ||
    null;

  return {
    canonicalMilestone: workflow?.canonicalMilestone || null,
    workflowOwnership: workflow?.workflowOwnership || null,
    recordedOutcome,
    label: recordedOutcome || workflow?.canonicalMilestone || "In Progress"
  };
}

function mapSecondaryActions(availableActions = [], primaryActionId) {
  return availableActions
    .filter((action) => action.id !== primaryActionId)
    .slice(0, 4)
    .map((action) => toMissionAction(action));
}

function buildMissionPrimaryAction(actionId) {
  return {
    id: actionId,
    label: getAgentActionLabel(actionId)
  };
}

function resolvePrimaryActionId(availableActions = [], preferredIds = []) {
  for (const actionId of preferredIds) {
    if (availableActions.some((action) => action.id === actionId)) {
      return actionId;
    }
  }

  const primary = availableActions.find((action) => action.priority === "primary");

  if (primary) {
    return primary.id;
  }

  return availableActions[0]?.id || null;
}

function needsInterviewSchedule({ conversationOutcome, brain }) {
  const workflowRequirements = conversationOutcome?.workflowRequirements || [];

  return (
    workflowRequirements.some((requirement) => requirement.key === "schedule") ||
    brain?.missingFields?.includes("schedule")
  );
}

function hasPendingRequiredInformation(conversationOutcome) {
  return (conversationOutcome?.requiredInputs || []).length > 0;
}

function hasIncompleteQualification({ brain, conversationOutcome }) {
  if (hasPendingRequiredInformation(conversationOutcome)) {
    return true;
  }

  const missingFields = brain?.missingFields || [];
  return missingFields.some((field) => field !== "schedule");
}

function buildMissingInformationSummary({ brain, conversationOutcome }) {
  const labels = new Set();

  for (const input of conversationOutcome?.requiredInputs || []) {
    if (input?.label) {
      labels.add(input.label);
    }
  }

  for (const field of brain?.missingFields || []) {
    if (field === "schedule") {
      continue;
    }

    labels.add(QUALIFICATION_FIELD_LABELS[field] || field);
  }

  return [...labels];
}

function isQualifiedWithoutConversationOutcome(conversationOutcome) {
  if (hasPendingRequiredInformation(conversationOutcome)) {
    return false;
  }

  const workflowRequirements = conversationOutcome?.workflowRequirements || [];
  return workflowRequirements.some((requirement) => requirement.key === "schedule");
}

function isClosedProspect({ agentState, workflow }) {
  if (agentState?.outcome === "Not Interested") {
    return true;
  }

  return CLOSED_MILESTONES.has(workflow?.canonicalMilestone);
}

function shouldGenerateScheduleInterviewMission({ conversationOutcome, agentState, brain }) {
  if (hasIncompleteQualification({ brain, conversationOutcome })) {
    return false;
  }

  if (!needsInterviewSchedule({ conversationOutcome, brain })) {
    return false;
  }

  const recordedKey =
    conversationOutcome?.recordedOutcome?.key || agentState?.outcome || null;

  if (recordedKey && isScheduleMissionBlockingOutcome(recordedKey)) {
    return false;
  }

  if (isInterestedOutcome(recordedKey)) {
    return true;
  }

  return isQualifiedWithoutConversationOutcome(conversationOutcome);
}

function resolveScheduleInterviewReason({ conversationOutcome, agentState }) {
  const recordedKey =
    conversationOutcome?.recordedOutcome?.key || agentState?.outcome || null;

  if (isInterestedOutcome(recordedKey)) {
    return "Prospect is interested and waiting.";
  }

  return "Prospect is qualified and ready to schedule.";
}

function shouldEnterInterviewOutcome({ workflow, prospect, agentState }) {
  if (workflow?.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING) {
    return true;
  }

  return isWorkflowGateActive(prospect, agentState);
}

function shouldGenerateFollowUpMission({ agentState, workflow }) {
  if (isFollowUpOutcome(agentState?.outcome)) {
    return true;
  }

  return workflow?.canonicalMilestone === MILESTONES.FOLLOW_UP;
}

function shouldRecruitProspect({ agentState }) {
  return agentState?.outcome === "Recruited" && !agentState?.orientationScheduled;
}

function shouldBeginOnboarding({ agentState, workflow }) {
  if (agentState?.outcome !== "Recruited") {
    return false;
  }

  if (!agentState?.orientationScheduled) {
    return false;
  }

  if (agentState?.onboardingUnlocked) {
    return false;
  }

  return (
    workflow?.canonicalMilestone === MILESTONES.ORIENTATION ||
    workflow?.canonicalMilestone === MILESTONES.FAST_START
  );
}

function shouldContactProspect(context) {
  const { workflow, brain, agentState, prospect } = context;

  if (hasIncompleteQualification(context)) {
    return false;
  }

  if (shouldGenerateScheduleInterviewMission(context)) {
    return false;
  }

  if (shouldEnterInterviewOutcome({ workflow, prospect, agentState })) {
    return false;
  }

  if (shouldGenerateFollowUpMission(context)) {
    return false;
  }

  if (shouldRecruitProspect(context) || shouldBeginOnboarding(context)) {
    return false;
  }

  const milestone = workflow?.canonicalMilestone;

  if (milestone === MILESTONES.NEW_LEAD || milestone === MILESTONES.GREETING_SENT) {
    return true;
  }

  const agentMilestone = deriveMilestoneLabel(
    brain?.currentStep,
    brain?.missingFields || [],
    agentState || {}
  );

  return agentMilestone === "New Lead";
}

function buildMissionSkeleton({
  prospect,
  missionType,
  title,
  description,
  reason,
  priority,
  primaryActionId,
  availableActions,
  workflow,
  conversationOutcome,
  createdAt,
  dueDate,
  estimatedMinutes = 2
}) {
  if (
    !primaryActionId ||
    !availableActions.some((action) => action.id === primaryActionId)
  ) {
    return null;
  }

  const prospectId = prospect.phone;

  return {
    id: buildMissionId(prospectId, missionType),
    prospectId,
    missionType,
    priority,
    title,
    description,
    reason,
    estimatedMinutes,
    dueDate: dueDate || startOfDayIso(),
    primaryAction: buildMissionPrimaryAction(primaryActionId),
    secondaryActions: mapSecondaryActions(availableActions, primaryActionId),
    status: MISSION_STATUS.PENDING,
    createdAt,
    prospect: summarizeProspect(prospect),
    workflowState: summarizeWorkflowState(workflow, conversationOutcome)
  };
}

function buildEnterInterviewOutcomeMission(context, createdAt) {
  const { prospect, agentState, conversationOutcome, workflow, availableActions } = context;

  if (!shouldEnterInterviewOutcome({ workflow, prospect, agentState })) {
    return null;
  }

  const primaryActionId = resolvePrimaryActionId(availableActions, [
    ACTION_IDS.ENTER_INTERVIEW_OUTCOME
  ]);

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.ENTER_INTERVIEW_OUTCOME,
    title: "Record Interview Outcome",
    description: "Record the interview result so Atlas can continue the workflow.",
    reason: "Interview time has passed and outcome is missing.",
    priority: MISSION_PRIORITIES.CRITICAL,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt,
    dueDate: new Date().toISOString(),
    estimatedMinutes: 3
  });
}

function buildCompleteQualificationMission(context, createdAt) {
  const { prospect, brain, conversationOutcome, workflow, availableActions, agentState } = context;

  if (!hasIncompleteQualification({ brain, conversationOutcome })) {
    return null;
  }

  if (shouldEnterInterviewOutcome({ workflow, prospect, agentState })) {
    return null;
  }

  const missingSummary = buildMissingInformationSummary({ brain, conversationOutcome });
  const reason =
    missingSummary.length > 0
      ? `Missing required information: ${missingSummary.join(", ")}.`
      : "Complete remaining qualification details before advancing the workflow.";

  const primaryActionId = resolvePrimaryActionId(availableActions, [
    ACTION_IDS.WHATSAPP,
    ACTION_IDS.CALL,
    ACTION_IDS.NOTES
  ]);

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.COMPLETE_QUALIFICATION,
    title: "Complete Qualification",
    description: "Capture the remaining qualification details for this prospect.",
    reason,
    priority: MISSION_PRIORITIES.HIGH,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt,
    estimatedMinutes: 4
  });
}

function buildScheduleInterviewMission(context, createdAt) {
  const { prospect, agentState, conversationOutcome, workflow, availableActions, brain } =
    context;

  if (!shouldGenerateScheduleInterviewMission({ conversationOutcome, agentState, brain })) {
    return null;
  }

  const primaryActionId = resolvePrimaryActionId(availableActions, [ACTION_IDS.SCHEDULE]);

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.SCHEDULE_INTERVIEW,
    title: "Schedule Interview",
    description: "Book an interview time for this interested prospect.",
    reason: resolveScheduleInterviewReason({ conversationOutcome, agentState }),
    priority: MISSION_PRIORITIES.HIGH,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt
  });
}

function buildFollowUpMission(context, createdAt) {
  const { prospect, agentState, conversationOutcome, workflow, availableActions } = context;

  if (!shouldGenerateFollowUpMission({ agentState, workflow })) {
    return null;
  }

  if (shouldEnterInterviewOutcome({ workflow, prospect, agentState })) {
    return null;
  }

  const due = isFollowUpDue(agentState);
  const primaryActionId = resolvePrimaryActionId(
    availableActions,
    due
      ? [ACTION_IDS.CALL, ACTION_IDS.WHATSAPP, ACTION_IDS.RESCHEDULE]
      : [ACTION_IDS.WHATSAPP, ACTION_IDS.CALL, ACTION_IDS.RESCHEDULE]
  );

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.FOLLOW_UP,
    title: "Follow Up",
    description: "Reconnect with the prospect and confirm the next step.",
    reason: due
      ? "Follow-up date has arrived — contact the prospect now."
      : "Prospect is waiting for follow-up.",
    priority: due ? MISSION_PRIORITIES.HIGH : MISSION_PRIORITIES.MEDIUM,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt,
    dueDate: due ? new Date().toISOString() : startOfDayIso(),
    estimatedMinutes: 3
  });
}

function buildRecruitProspectMission(context, createdAt) {
  const { prospect, agentState, conversationOutcome, workflow, availableActions } = context;

  if (!shouldRecruitProspect({ agentState })) {
    return null;
  }

  const primaryActionId = resolvePrimaryActionId(availableActions, [
    ACTION_IDS.NOTES,
    ACTION_IDS.CALL,
    ACTION_IDS.WHATSAPP
  ]);

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.RECRUIT_PROSPECT,
    title: "Recruit Prospect",
    description: "Complete recruitment steps and schedule orientation.",
    reason: "Prospect was recruited — orientation is not scheduled yet.",
    priority: MISSION_PRIORITIES.HIGH,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt,
    estimatedMinutes: 5
  });
}

function buildBeginOnboardingMission(context, createdAt) {
  const { prospect, agentState, conversationOutcome, workflow, availableActions } = context;

  if (!shouldBeginOnboarding({ agentState, workflow })) {
    return null;
  }

  const primaryActionId = resolvePrimaryActionId(availableActions, [
    ACTION_IDS.NOTES,
    ACTION_IDS.CALL,
    ACTION_IDS.WHATSAPP
  ]);

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.BEGIN_ONBOARDING,
    title: "Begin Onboarding",
    description: "Start onboarding activities for this recruited prospect.",
    reason: "Orientation is scheduled — onboarding has not started yet.",
    priority: MISSION_PRIORITIES.MEDIUM,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt,
    estimatedMinutes: 5
  });
}

function buildContactProspectMission(context, createdAt) {
  const { prospect, conversationOutcome, workflow, availableActions } = context;

  if (!shouldContactProspect(context)) {
    return null;
  }

  const primaryActionId = resolvePrimaryActionId(availableActions, [
    ACTION_IDS.WHATSAPP,
    ACTION_IDS.CALL,
    ACTION_IDS.NOTES
  ]);

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.CALL_PROSPECT,
    title: "Contact Prospect",
    description: "Reach out and move this prospect forward.",
    reason: "Prospect needs recruiter contact to continue.",
    priority: MISSION_PRIORITIES.MEDIUM,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt
  });
}

function buildReviewProspectMission(context, createdAt) {
  const { prospect, conversationOutcome, workflow, availableActions } = context;

  const timing = getInterviewTimingPhase(prospect);
  const hasConfirmedInterview =
    prospect?.current_step === "CONFIRMED" || Boolean(prospect?.calendar_event_id);

  let reason = "Review this prospect and take the next best action.";

  if (hasConfirmedInterview && timing === "future") {
    reason = "Interview is scheduled — confirm details and stay ready.";
  } else if (hasConfirmedInterview && timing === "soon") {
    reason = "Interview is coming up soon — confirm the prospect is prepared.";
  }

  const primaryActionId = resolvePrimaryActionId(availableActions, [
    ACTION_IDS.SEND_ZOOM_LINK,
    ACTION_IDS.SEND_OFFICE_LOCATION,
    ACTION_IDS.WHATSAPP,
    ACTION_IDS.CALL,
    ACTION_IDS.NOTES
  ]);

  if (!primaryActionId) {
    return null;
  }

  return buildMissionSkeleton({
    prospect,
    missionType: MISSION_TYPES.REVIEW_PROSPECT,
    title: "Review Prospect",
    description: "Review the latest activity and decide the next step.",
    reason,
    priority: MISSION_PRIORITIES.LOW,
    primaryActionId,
    availableActions,
    workflow,
    conversationOutcome,
    createdAt
  });
}

function buildTypedMissions(context, createdAt) {
  return [
    buildEnterInterviewOutcomeMission(context, createdAt),
    buildCompleteQualificationMission(context, createdAt),
    buildScheduleInterviewMission(context, createdAt),
    buildFollowUpMission(context, createdAt),
    buildRecruitProspectMission(context, createdAt),
    buildBeginOnboardingMission(context, createdAt),
    buildContactProspectMission(context, createdAt)
  ].filter(Boolean);
}

function ensurePrimaryMission(missions, context, createdAt) {
  if (missions.length > 0) {
    return missions;
  }

  if (isClosedProspect(context)) {
    const { prospect, conversationOutcome, workflow, availableActions } = context;
    const primaryActionId = resolvePrimaryActionId(availableActions, [ACTION_IDS.NOTES]);
    const closedMission = buildMissionSkeleton({
      prospect,
      missionType: MISSION_TYPES.REVIEW_PROSPECT,
      title: "Review Prospect",
      description: "Review closed prospect history.",
      reason: "Prospect is closed — review notes and history only.",
      priority: MISSION_PRIORITIES.LOW,
      primaryActionId,
      availableActions,
      workflow,
      conversationOutcome,
      createdAt
    });

    if (closedMission) {
      return [closedMission];
    }
  }

  const reviewMission = buildReviewProspectMission(context, createdAt);
  return reviewMission ? [reviewMission] : [];
}

function generateMissionsFromContext(context) {
  const createdAt = new Date().toISOString();
  const typedMissions = buildTypedMissions(context, createdAt);
  const sorted = sortMissions(typedMissions);

  return ensurePrimaryMission(sorted, context, createdAt);
}

function getPrimaryMissionFromContext(context) {
  const missions = generateMissionsFromContext(context);
  return missions[0] || null;
}

async function generateMissionsForProspect(phone, organizationId) {
  const context = await buildMissionContext(phone, organizationId);

  if (!context) {
    return [];
  }

  return generateMissionsFromContext(context);
}

async function getHighestPriorityMissionForProspect(phone, organizationId) {
  const missions = await generateMissionsForProspect(phone, organizationId);
  return missions[0] || null;
}

async function loadOrganizationProspects(organizationId) {
  const data = await loadProspectsForOrganization(organizationId);
  return filterProductionProspects(data || []);
}

async function generateMissionsForOrganization(organizationId, options = {}) {
  const { prospectPhone } = options;
  const prospects = await loadOrganizationProspects(organizationId);
  const targetProspects = prospectPhone
    ? prospects.filter((prospect) => prospect.phone === prospectPhone)
    : prospects;

  const missionSets = await Promise.all(
    targetProspects.map(async (prospect) =>
      generateMissionsForProspect(prospect.phone, organizationId)
    )
  );

  return sortMissions(missionSets.flat());
}

async function getMissionById(missionId, organizationId) {
  const missions = await generateMissionsForOrganization(organizationId);
  return missions.find((mission) => mission.id === missionId) || null;
}

async function recalculateMissions(organizationId, options = {}) {
  const missions = await generateMissionsForOrganization(organizationId, options);

  return {
    generatedAt: new Date().toISOString(),
    total: missions.length,
    primaryMission: missions[0] || null,
    missions
  };
}

module.exports = {
  generateMissionsFromContext,
  getPrimaryMissionFromContext,
  generateMissionsForProspect,
  getHighestPriorityMissionForProspect,
  generateMissionsForOrganization,
  getMissionById,
  recalculateMissions,
  buildMissionContext,
  shouldGenerateScheduleInterviewMission,
  hasIncompleteQualification,
  hasPendingRequiredInformation
};
