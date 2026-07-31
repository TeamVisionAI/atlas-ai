/**
 * Sprint 10.2a — Prospect Workspace aggregated read model.
 * Sprint 19.1 — Pure composition; orchestration lives in application service.
 */

const { findProspectInOrganization } = require("../services/supabaseService");
const { findUserById } = require("../services/atlasUserService");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const { buildJourneyProgress } = require("./journeyProgressMapper");
const { listProspectActivityPreview } = require("./prospectActivityFeedReadModel");
const { buildProspectEditorProfile } = require("./prospectWorkspaceProfileEngine");
const { resolvePersistedAppointmentId } = require("./appointmentListQuery");
const { findPersistedAppointmentForProspect } = require("../services/appointmentListService");

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

function buildInterviewBlock(prospect, agentState, workflowGate, activeAppointment = null) {
  const prospectInterviewMs = parseInterviewDatetime(prospect);
  const appointmentInterviewMs = activeAppointment?.startDateTime
    ? Date.parse(activeAppointment.startDateTime)
    : Number.NaN;
  const interviewMs = Number.isFinite(appointmentInterviewMs)
    ? appointmentInterviewMs
    : prospectInterviewMs;
  const now = Date.now();

  return {
    datetime: interviewMs ? new Date(interviewMs).toISOString() : null,
    type: activeAppointment?.meetingType || prospect?.interview_type || null,
    isPast: interviewMs !== null && interviewMs < now,
    outcome: agentState?.outcome || null,
    calendarEventId: activeAppointment?.calendarEventId || prospect?.calendar_event_id || null,
    gateActive: Boolean(workflowGate?.active),
    appointmentId: resolvePersistedAppointmentId(activeAppointment),
    ownerRepId: activeAppointment?.ownerRepId || null
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

async function composeProspectWorkspaceFromMissionControl(phone, missionControl, organizationId) {
  const resolvedPhone = missionControl.prospect?.phone || phone;
  const prospectRow = await findProspectInOrganization(resolvedPhone, organizationId);
  const prospect = buildProspectIdentity(prospectRow || missionControl.prospect);
  const owner = await resolveOwner(prospect?.owner_user_id);
  const canonicalMilestone = missionControl.workflow?.canonicalMilestone || null;
  const journey = buildJourneyProgress(canonicalMilestone);
  let activeAppointment = null;

  try {
    activeAppointment = await findPersistedAppointmentForProspect(resolvedPhone, organizationId);
  } catch (error) {
    console.error("[prospect-workspace/activeAppointment]", error.message);
  }

  const interview = buildInterviewBlock(
    prospectRow || missionControl.prospect,
    missionControl.agentState,
    missionControl.workflowGate,
    activeAppointment
  );
  let activityPreview = [];

  try {
    activityPreview = await listProspectActivityPreview(resolvedPhone, 5);
  } catch (error) {
    console.error("[prospect-workspace/activityPreview]", error.message);
  }

  return {
    prospect,
    editorProfile: buildProspectEditorProfile(prospectRow || missionControl.prospect),
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
    conversationMessages: missionControl.conversationMessages || [],
    journey,
    interview,
    activityPreview,
    atlasCoach: null,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  composeProspectWorkspaceFromMissionControl,
  buildProspectIdentity,
  buildInterviewBlock
};
