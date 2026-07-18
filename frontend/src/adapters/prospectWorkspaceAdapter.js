import {
  adaptMissionControlResponse,
  formatProspectLocation
} from "./missionControlAdapter";
import { formatCanonicalMilestoneLabel, formatWorkflowOwnershipLabel } from "./conversationPreview";
import { formatAtlasDateTime } from "../utils/dateFormatter";
import { normalizeProspectLanguage } from "../types/language";

/**
 * Maps Prospect Workspace API payload to agent workspace model + workspace extensions.
 */
export function adaptProspectWorkspaceResponse(workspacePayload) {
  const missionControlShape = {
    prospect: {
      name: workspacePayload.prospect?.name,
      phone: workspacePayload.prospect?.phone,
      city: workspacePayload.prospect?.city,
      state: workspacePayload.prospect?.state
    },
    brain: workspacePayload.brain,
    businessRules: workspacePayload.businessRules,
    atlasBrief: workspacePayload.atlasBrief,
    suggestedReply: workspacePayload.suggestedReply,
    importantNotes: workspacePayload.importantNotes,
    objections: workspacePayload.objections,
    aiRecommendation: workspacePayload.aiRecommendation,
    workflow: workspacePayload.workflow,
    workflowGate: workspacePayload.workflowGate,
    latestConversation: workspacePayload.latestConversation,
    availableActions: workspacePayload.availableActions
  };

  const workspace = adaptMissionControlResponse(
    missionControlShape,
    {
      phone: workspacePayload.prospect?.phone,
      interview_time: workspacePayload.interview?.datetime,
      appointment_date: workspacePayload.interview?.datetime
    },
    { isLive: true }
  );

  return {
    ...workspace,
    identity: {
      name: workspacePayload.prospect?.name || "—",
      phone: workspacePayload.prospect?.phone || "—",
      prospectNumber: workspacePayload.prospect?.prospect_number || null,
      communicationLanguage: normalizeProspectLanguage(
        workspacePayload.prospect?.communication_language
      ),
      location: formatProspectLocation(
        workspacePayload.prospect?.city,
        workspacePayload.prospect?.state
      )
    },
    owner: workspacePayload.owner || null,
    capture: {
      source: workspacePayload.prospect?.source || null,
      entryMethod: workspacePayload.prospect?.entry_method || null,
      preferredChannel: workspacePayload.prospect?.preferred_communication_channel || null,
      communicationLanguage: workspacePayload.prospect?.communication_language || null
    },
    journey: workspacePayload.journey || null,
    interview: workspacePayload.interview || null,
    activityPreview: workspacePayload.activityPreview || [],
    atlasCoach: workspacePayload.atlasCoach,
    agentState: workspacePayload.agentState || null,
    status: {
      milestone:
        formatCanonicalMilestoneLabel(workspacePayload.workflow?.canonicalMilestone) ||
        workspace.prospect.milestone,
      canonicalMilestone: workspacePayload.workflow?.canonicalMilestone || null,
      workflowOwnership: formatWorkflowOwnershipLabel(
        workspacePayload.workflow?.workflowOwnership
      ),
      priorityTier: workspacePayload.workflow?.missionControlPriorityTier || null,
      stalledAt: workspacePayload.workflow?.stalledAt || null
    },
    raw: workspacePayload
  };
}

export function formatInterviewDateTime(isoString) {
  if (!isoString) {
    return null;
  }

  const parsed = Date.parse(isoString);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return formatAtlasDateTime(new Date(parsed));
}
