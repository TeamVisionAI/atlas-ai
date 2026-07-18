/**
 * Sprint 10.2a — Prospect Workspace aggregated read model.
 * Composes existing Mission Control engines; no duplicated business logic.
 */

const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { findProspect } = require("../services/supabaseService");
const { findUserById } = require("../services/atlasUserService");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const { buildJourneyProgress } = require("./journeyProgressMapper");
const { isProductionProspect } = require("./productionProspectFilter");

function buildProspectIdentity(prospect) {
  if (!prospect) {
    return null;
  }

  const firstName = prospect.first_name || "";
  const lastName = prospect.last_name || "";
  const composedName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    phone: prospect.phone,
    name: composedName || prospect.name || "—",
    first_name: firstName || null,
    last_name: lastName || null,
    prospect_number: prospect.prospect_number || null,
    communication_language: prospect.communication_language || prospect.language || null,
    city: prospect.city || null,
    state: prospect.state || null,
    source: prospect.source || null,
    entry_method: prospect.entry_method || null,
    owner_user_id: prospect.owner_user_id || null,
    created_by_user_id: prospect.created_by_user_id || null,
    preferred_communication_channel: prospect.preferred_communication_channel || null,
    interview_type: prospect.interview_type || null,
    calendar_event_id: prospect.calendar_event_id || null,
    current_step: prospect.current_step || null
  };
}

function buildInterviewBlock(prospect, agentState, workflowGate) {
  const interviewMs = parseInterviewDatetime(prospect);
  const now = Date.now();

  return {
    datetime: interviewMs ? new Date(interviewMs).toISOString() : null,
    type: prospect?.interview_type || null,
    isPast: interviewMs !== null && interviewMs < now,
    outcome: agentState?.outcome || null,
    calendarEventId: prospect?.calendar_event_id || null,
    gateActive: Boolean(workflowGate?.active)
  };
}

async function resolveOwner(ownerUserId) {
  if (!ownerUserId) {
    return null;
  }

  try {
    const user = await findUserById(ownerUserId);

    if (!user) {
      return { id: ownerUserId, display_name: null };
    }

    return {
      id: user.id,
      display_name: user.display_name || user.email || null
    };
  } catch {
    return { id: ownerUserId, display_name: null };
  }
}

async function buildProspectWorkspaceReadModel(phone) {
  if (!phone) {
    return null;
  }

  if (!isProductionProspect(phone) && phone !== "latest") {
    return null;
  }

  const missionControl = await getMissionControlWithActions(phone);

  if (!missionControl) {
    return null;
  }

  const resolvedPhone = missionControl.prospect?.phone || phone;
  const prospectRow = await findProspect(resolvedPhone);
  const prospect = buildProspectIdentity(prospectRow || missionControl.prospect);
  const owner = await resolveOwner(prospect?.owner_user_id);
  const canonicalMilestone = missionControl.workflow?.canonicalMilestone || null;
  const journey = buildJourneyProgress(canonicalMilestone);
  const interview = buildInterviewBlock(
    prospectRow || missionControl.prospect,
    missionControl.agentState,
    missionControl.workflowGate
  );

  return {
    prospect,
    owner,
    workflow: missionControl.workflow,
    workflowGate: missionControl.workflowGate,
    availableActions: missionControl.availableActions,
    agentState: missionControl.agentState,
    brain: missionControl.brain,
    businessRules: missionControl.businessRules,
    atlasBrief: missionControl.atlasBrief,
    suggestedReply: missionControl.suggestedReply,
    importantNotes: missionControl.importantNotes,
    objections: missionControl.objections,
    aiRecommendation: missionControl.aiRecommendation,
    latestConversation: missionControl.latestConversation,
    journey,
    interview,
    activityPreview: [],
    atlasCoach: null,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildProspectWorkspaceReadModel,
  buildProspectIdentity,
  buildInterviewBlock
};
