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
const {
  hasCanonicalRecordedOutcome,
  resolveCanonicalAppointmentOutcome
} = require("./appointmentOutcomeState");
const { mapAppointmentSlugToOutcomeId } = require("./interviewOutcomeSlugMap");
const {
  findPersistedAppointmentForProspect,
  findLatestPersistedAppointmentForProspect
} = require("../services/appointmentListService");
const { logInterviewerTrace } = require("../dev/interviewerTrace");
const {
  formatPreferredLanguageLabel,
  resolveProspectPreferredLanguage
} = require("./prospectLanguage");

function buildProspectIdentity(prospect) {
  if (!prospect) {
    return null;
  }

  const firstName = prospect.first_name || "";
  const lastName = prospect.last_name || "";
  const composedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const preferredLanguage = resolveProspectPreferredLanguage(prospect);

  return {
    phone: prospect.phone,
    name: composedName || prospect.name || "—",
    first_name: firstName || null,
    last_name: lastName || null,
    prospect_number: prospect.prospect_number || null,
    preferred_language: preferredLanguage,
    preferred_language_label: formatPreferredLanguageLabel(preferredLanguage),
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

function buildInterviewBlock(
  prospect,
  agentState,
  workflowGate,
  activeAppointment = null,
  latestAppointment = null
) {
  const lifecycleAppointment = activeAppointment || latestAppointment || null;
  const lifecycleState = lifecycleAppointment?.metadata?.lifecycleState || null;
  const appointmentStatus = lifecycleAppointment?.status || null;
  const isCancelledLifecycle =
    lifecycleState === "cancelled" || appointmentStatus === "cancelled";

  const prospectInterviewMs = parseInterviewDatetime(prospect);
  const appointmentInterviewMs = activeAppointment?.startDateTime
    ? Date.parse(activeAppointment.startDateTime)
    : Number.NaN;
  let interviewMs = Number.isFinite(appointmentInterviewMs)
    ? appointmentInterviewMs
    : prospectInterviewMs;

  if (isCancelledLifecycle && !activeAppointment) {
    interviewMs = lifecycleAppointment?.startDateTime
      ? Date.parse(lifecycleAppointment.startDateTime)
      : Number.NaN;
  }

  const now = Date.now();
  const recordedOutcome = hasCanonicalRecordedOutcome(lifecycleAppointment);
  const appointmentOutcomeLabel = recordedOutcome
    ? mapAppointmentSlugToOutcomeId(resolveCanonicalAppointmentOutcome(lifecycleAppointment))
    : null;

  return {
    datetime: interviewMs ? new Date(interviewMs).toISOString() : null,
    type: activeAppointment?.meetingType || prospect?.interview_type || null,
    isPast: interviewMs !== null && interviewMs < now,
    outcome: agentState?.outcome || appointmentOutcomeLabel || null,
    calendarEventId: activeAppointment?.calendarEventId || prospect?.calendar_event_id || null,
    gateActive: Boolean(workflowGate?.active) && !recordedOutcome,
    appointmentId: resolvePersistedAppointmentId(activeAppointment || lifecycleAppointment),
    lifecycleState,
    appointmentStatus,
    ownerRepId: activeAppointment?.ownerRepId || null,
    interviewerUserId: activeAppointment?.interviewerUserId || null,
    interviewerName: activeAppointment?.interviewerName || null
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
  let latestAppointment = null;

  try {
    activeAppointment = await findPersistedAppointmentForProspect(resolvedPhone, organizationId);
    latestAppointment =
      activeAppointment ||
      (await findLatestPersistedAppointmentForProspect(resolvedPhone, organizationId));
  } catch (error) {
    console.error("[prospect-workspace/activeAppointment]", error.message);
  }

  const interview = buildInterviewBlock(
    prospectRow || missionControl.prospect,
    missionControl.agentState,
    missionControl.workflowGate,
    activeAppointment,
    latestAppointment
  );
  let activityPreview = [];

  try {
    activityPreview = await listProspectActivityPreview(resolvedPhone, 5);
  } catch (error) {
    console.error("[prospect-workspace/activityPreview]", error.message);
  }

  const editorProfile = buildProspectEditorProfile(prospectRow || missionControl.prospect);

  logInterviewerTrace({
    authenticatedUserId: null,
    authenticatedUserName: null,
    interviewerUserId: interview?.interviewerUserId || activeAppointment?.interviewerUserId || null,
    interviewerName: interview?.interviewerName || activeAppointment?.interviewerName || null,
    appointmentId: interview?.appointmentId || null,
    source: "missionControl.readModel.interview"
  });

  return {
    prospect,
    editorProfile,
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
