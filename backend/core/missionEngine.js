/**
 * Sprint 18.3 — Mission Engine v1.
 * Orchestrates "what should the recruiter do next?" — no business-rule duplication.
 * Delegates state detection to Workflow Engine outputs and existing action resolution.
 */

const { findProspectInOrganization, loadProspectsForOrganization } = require("../services/supabaseService");
const { getOrganizationSettings } = require("./organizationSettingsEngine");
const { getMissionControlState } = require("./missionControlReadModel");
const { buildWorkflowReadModel } = require("./workflowReadModel");
const { buildConversationOutcomeReadModel } = require("./conversationOutcomeEngine");
const { loadAgentState } = require("./agentActionState");
const { resolveAvailableActions, ACTION_IDS, isWorkflowGateActive } = require("./agentActionEngine");
const { getAgentActionLabel, toMissionAction } = require("./agentActionRegistry");
const { MILESTONES } = require("./workflowConstants");
const {
  MISSION_TYPES,
  MISSION_STATUS,
  buildMissionId
} = require("./configuration/missionTypes");
const { MISSION_PRIORITIES, sortMissions } = require("./configuration/missionPriorities");
const { isProductionProspect, filterProductionProspects } = require("./productionProspectFilter");

const INTERESTED_OUTCOMES = new Set(["Interested", "Information Collected"]);

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

function isInterestedAndAwaitingSchedule({ conversationOutcome, agentState, brain }) {
  const recordedKey =
    conversationOutcome?.recordedOutcome?.key || agentState?.outcome || null;

  if (!INTERESTED_OUTCOMES.has(recordedKey)) {
    return false;
  }

  const workflowRequirements = conversationOutcome?.workflowRequirements || [];
  const needsSchedule =
    workflowRequirements.some((requirement) => requirement.key === "schedule") ||
    brain?.missingFields?.includes("schedule");

  return needsSchedule;
}

function shouldEnterInterviewOutcome({ workflow, prospect, agentState }) {
  if (workflow?.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING) {
    return true;
  }

  return isWorkflowGateActive(prospect, agentState);
}

function buildScheduleInterviewMission(context, createdAt) {
  const { prospect, brain, agentState, conversationOutcome, workflow, availableActions } =
    context;

  if (!isInterestedAndAwaitingSchedule({ conversationOutcome, agentState, brain })) {
    return null;
  }

  const prospectId = prospect.phone;
  const primaryActionId = ACTION_IDS.SCHEDULE;

  return {
    id: buildMissionId(prospectId, MISSION_TYPES.SCHEDULE_INTERVIEW),
    prospectId,
    missionType: MISSION_TYPES.SCHEDULE_INTERVIEW,
    priority: MISSION_PRIORITIES.HIGH,
    title: "Schedule Interview",
    description: "Book an interview time for this interested prospect.",
    reason: "Prospect is interested and waiting.",
    estimatedMinutes: 2,
    dueDate: startOfDayIso(),
    primaryAction: buildMissionPrimaryAction(primaryActionId),
    secondaryActions: mapSecondaryActions(availableActions, primaryActionId),
    status: MISSION_STATUS.PENDING,
    createdAt,
    prospect: summarizeProspect(prospect),
    workflowState: summarizeWorkflowState(workflow, conversationOutcome)
  };
}

function buildEnterInterviewOutcomeMission(context, createdAt) {
  const { prospect, brain, agentState, conversationOutcome, workflow, availableActions } =
    context;

  if (!shouldEnterInterviewOutcome({ workflow, prospect, agentState })) {
    return null;
  }

  const prospectId = prospect.phone;
  const primaryActionId = ACTION_IDS.ENTER_INTERVIEW_OUTCOME;

  return {
    id: buildMissionId(prospectId, MISSION_TYPES.ENTER_INTERVIEW_OUTCOME),
    prospectId,
    missionType: MISSION_TYPES.ENTER_INTERVIEW_OUTCOME,
    priority: MISSION_PRIORITIES.CRITICAL,
    title: "Enter Interview Outcome",
    description: "Record the interview result so Atlas can continue the workflow.",
    reason: "Interview time has passed and outcome is missing.",
    estimatedMinutes: 3,
    dueDate: new Date().toISOString(),
    primaryAction: buildMissionPrimaryAction(primaryActionId),
    secondaryActions: mapSecondaryActions(availableActions, primaryActionId),
    status: MISSION_STATUS.PENDING,
    createdAt,
    prospect: summarizeProspect(prospect),
    workflowState: summarizeWorkflowState(workflow, conversationOutcome)
  };
}

function generateMissionsFromContext(context) {
  const createdAt = new Date().toISOString();
  const missions = [
    buildEnterInterviewOutcomeMission(context, createdAt),
    buildScheduleInterviewMission(context, createdAt)
  ].filter(Boolean);

  return sortMissions(missions);
}

async function buildMissionContext(phone, organizationId) {
  if (!phone || !organizationId || !isProductionProspect(phone)) {
    return null;
  }

  const prospect = await findProspectInOrganization(phone, organizationId);

  if (!prospect) {
    return null;
  }

  const missionControl = await getMissionControlState(phone, { organizationId });

  if (!missionControl) {
    return null;
  }

  const agentState = loadAgentState(phone);
  const organizationSettings = getOrganizationSettings();
  const brain = missionControl.brain;

  const [workflow, conversationOutcome] = await Promise.all([
    buildWorkflowReadModel({ prospect, brain, agentState }),
    Promise.resolve(
      buildConversationOutcomeReadModel({
        prospect,
        brain,
        conversationMessages: []
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
    availableActions
  };
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
  generateMissionsForProspect,
  getHighestPriorityMissionForProspect,
  generateMissionsForOrganization,
  getMissionById,
  recalculateMissions,
  buildMissionContext
};
