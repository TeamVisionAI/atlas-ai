/**
 * Sprint 8A.3 — BR-035 Human Advancement execution.
 * Validates (BR-037), persists prospect/workflow state, emits events, resumes Atlas when appropriate.
 * Does not redesign Mission Control or alter automated conversation pipeline messages.
 */

const {
  findProspectInOrganization,
  updateProspectInOrganization
} = require("../services/supabaseService");
const { requireTenantOrganizationId } = require("./tenantProspectLookup");
const { logConversation } = require("../services/logService");
const { parseSchedulingState, mergeNotesWithSchedulingState } = require("../core/schedulingState");
const {
  buildProfileFromProspect,
  profileToProspectUpdates,
  getEffectiveInterviewType
} = require("../core/informationModel");
const { mapToCanonicalMilestone, deriveDefaultOwnership } = require("../core/milestoneMapper");
const {
  validateMilestoneAdvancement
} = require("../core/milestoneValidationEngine");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("../core/workflowStateStore");
const { loadAgentState, mergeAgentState } = require("../core/agentActionState");
const { buildWorkflowReadModel, fetchMessageHints } = require("../core/workflowReadModel");
const { emitHumanAdvancementEvents } = require("../core/humanAdvancementEvents");
const { getMissionControlState } = require("./missionControlReadModel");
const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

const QUALIFICATION_KEYS = new Set([
  "city",
  "state",
  "authorization",
  "occupation",
  "interviewType",
  "email"
]);

function buildValidationErrorResponse(validation, targetMilestone) {
  return {
    success: false,
    action: "workflow_advance",
    error: validation.invalidTransition ? "INVALID_TRANSITION" : "VALIDATION_FAILED",
    message: validation.errors[0]?.message || "Milestone validation failed.",
    validation: {
      targetMilestone,
      invalidTransition: validation.invalidTransition,
      missingFields: validation.missingFields,
      errors: validation.errors
    }
  };
}

function buildAgentStatePatch(targetMilestone, capturedFields = {}) {
  const patch = {};

  if (targetMilestone === MILESTONES.CLOSED) {
    patch.outcome = "Not Interested";
    patch.closureReason =
      capturedFields.closureReason || capturedFields.notInterestedReason || null;
  }

  if (targetMilestone === MILESTONES.DO_NOT_CONTACT) {
    patch.outcome = "Not Interested";
    patch.closureReason = capturedFields.doNotContactReason || "Do Not Contact";
  }

  if (targetMilestone === MILESTONES.FOLLOW_UP) {
    patch.outcome = capturedFields.outcome || "Needs More Time";
    patch.followUpDate = capturedFields.followUpDate || null;
    patch.followUpTime = capturedFields.followUpTime || null;
  }

  if (targetMilestone === MILESTONES.ORIENTATION) {
    patch.outcome = "Recruited";
    patch.orientationScheduled = capturedFields.orientationScheduled !== false;
  }

  if (targetMilestone === MILESTONES.LICENSING) {
    patch.outcome = "Recruited";
    patch.onboardingUnlocked = true;
  }

  if (capturedFields.outcome) {
    patch.outcome = capturedFields.outcome;
  }

  if (capturedFields.followUpDate) {
    patch.followUpDate = capturedFields.followUpDate;
    patch.followUpTime = capturedFields.followUpTime || null;
  }

  if (capturedFields.orientationScheduled !== undefined) {
    patch.orientationScheduled = Boolean(capturedFields.orientationScheduled);
  }

  if (capturedFields.onboardingUnlocked !== undefined) {
    patch.onboardingUnlocked = Boolean(capturedFields.onboardingUnlocked);
  }

  return patch;
}

function applyInterviewRescheduleAgentReset(targetMilestone, capturedFields, patch) {
  if (
    targetMilestone === MILESTONES.INTERVIEW_SCHEDULED &&
    capturedFields.confirmed
  ) {
    patch.outcome = null;
    patch.followUpDate = null;
    patch.followUpTime = null;
    patch.closureReason = null;
  }

  return patch;
}

function qualificationFieldsChanged(beforeProfile, afterProfile, capturedFields) {
  return Object.keys(capturedFields).some((key) => {
    if (!QUALIFICATION_KEYS.has(key) && key !== "workAuthorized") {
      return false;
    }

    return true;
  });
}

async function persistProspectAdvancement(
  prospect,
  mergedProfile,
  capturedFields,
  targetMilestone,
  organizationId
) {
  const schedulingState = parseSchedulingState(prospect.notes);
  const profileForPersist = { ...mergedProfile };

  if (!profileForPersist.interviewType) {
    const effectiveType = getEffectiveInterviewType(profileForPersist);

    if (effectiveType) {
      profileForPersist.interviewType = effectiveType;
    }
  }

  const updates = profileToProspectUpdates(profileForPersist, schedulingState);

  if (mergedProfile.email) {
    updates.notes = mergeNotesWithSchedulingState(
      `EMAIL:${mergedProfile.email}`,
      schedulingState
    );
  }

  if (
    targetMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
    capturedFields.confirmed === true ||
    mergedProfile.confirmed
  ) {
    const interviewDateTime =
      capturedFields.interviewDateTime || mergedProfile.preferredTime || null;

    if (interviewDateTime && !Number.isNaN(Date.parse(interviewDateTime))) {
      updates.current_step = "CONFIRMED";
      updates.interview_time = interviewDateTime;
      updates.appointment_date =
        mergedProfile.appointmentDate || interviewDateTime.slice(0, 10);
    } else if (mergedProfile.preferredTime && mergedProfile.appointmentDate) {
      updates.current_step = "CONFIRMED";
      updates.interview_time = mergedProfile.preferredTime;
      updates.appointment_date = mergedProfile.appointmentDate;
    }
  }

  return updateProspectInOrganization(prospect.phone, organizationId, updates);
}

/**
 * Executes BR-035 human advancement after BR-037 validation.
 */
async function advanceProspectWorkflow(phone, payload = {}) {
  let organizationId = null;

  try {
    organizationId = requireTenantOrganizationId(payload.organizationId);
  } catch {
    return {
      success: false,
      action: "workflow_advance",
      error: "TENANT_ORGANIZATION_REQUIRED",
      message: "Organization context is required for workflow advancement."
    };
  }

  const targetMilestone = payload.targetMilestone;
  const capturedFields = {
    ...(payload.capturedFields || {}),
    interactionNotes: payload.interactionNotes || payload.notes || null
  };

  if (targetMilestone === MILESTONES.ORIENTATION && !capturedFields.outcome) {
    capturedFields.outcome = "Recruited";
  }

  if (targetMilestone === MILESTONES.FOLLOW_UP && !capturedFields.outcome) {
    capturedFields.outcome = "Needs More Time";
  }

  const prospect = await findProspectInOrganization(phone, organizationId);

  if (!prospect) {
    return {
      success: false,
      action: "workflow_advance",
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  const agentState = loadAgentState(phone);
  const persisted = await loadPersistedWorkflowState(phone, {
    organizationId,
    prospectId: prospect.id || null
  });
  const messageHints = await fetchMessageHints(phone);

  const missionControl = await getMissionControlState(phone);
  const brain = missionControl?.brain || { currentStep: prospect.current_step, missingFields: [] };

  const mergedAgentState = {
    ...agentState,
    manualAgentOwnership: persisted.manualAgentOwnership,
    doNotContact: persisted.doNotContact
  };

  const currentMilestone =
    persisted.canonicalMilestone ||
    mapToCanonicalMilestone({
      prospect,
      currentStep: brain.currentStep,
      missingFields: brain.missingFields || [],
      agentState: mergedAgentState,
      messageHints
    });

  const validation = validateMilestoneAdvancement({
    currentMilestone,
    targetMilestone,
    prospect,
    capturedFields,
    explicitProfileFields: payload.explicitProfileFields || []
  });

  if (!validation.valid) {
    return buildValidationErrorResponse(validation, targetMilestone);
  }

  // Implements BR-039 — INTERVIEW_SCHEDULED requires a persisted appointment row.
  if (targetMilestone === MILESTONES.INTERVIEW_SCHEDULED) {
    if (!capturedFields.appointmentId) {
      const { findActiveAppointmentForProspect } = require("./activeAppointmentResolver");
      const activeAppointment = await findActiveAppointmentForProspect(phone, organizationId);

      if (!activeAppointment) {
        return {
          success: false,
          action: "workflow_advance",
          error: "APPOINTMENT_REQUIRED",
          message:
            "INTERVIEW_SCHEDULED requires a persisted appointment. Schedule or repair the appointment first."
        };
      }

      capturedFields.appointmentId = activeAppointment.id;
    }
  }

  const beforeProfile = buildProfileFromProspect(prospect);
  const mergedProfile = validation.mergedProfile;
  const ownershipBefore =
    persisted.workflowOwnership ||
    deriveDefaultOwnership(currentMilestone, mergedAgentState);

  await persistProspectAdvancement(
    prospect,
    mergedProfile,
    capturedFields,
    targetMilestone,
    organizationId
  );

  const agentPatch = buildAgentStatePatch(targetMilestone, capturedFields);
  applyInterviewRescheduleAgentReset(targetMilestone, capturedFields, agentPatch);

  if (targetMilestone === MILESTONES.DO_NOT_CONTACT) {
    agentPatch.closureReason = capturedFields.doNotContactReason || "Do Not Contact";
  }

  mergeAgentState(phone, agentPatch);

  if (payload.interactionNotes) {
    const notes = loadAgentState(phone).agentNotes || [];
    mergeAgentState(phone, {
      agentNotes: [
        ...notes,
        {
          text: payload.interactionNotes,
          at: new Date().toISOString(),
          type: payload.interactionType || "human_advancement"
        }
      ]
    });
  }

  const updatedAgentState = loadAgentState(phone);
  const updatedProspect = await findProspectInOrganization(phone, organizationId);

  // BR-135 — Manual TAKE OVER is sticky through BR-035 advancement.
  // Only explicit RETURN TO ATLAS (or equivalent release) may clear HUMAN ownership.
  const {
    hasActiveStickyHumanHold
  } = require("./conversationsCenter/conversationsCenterOwnershipService");
  const stickyHumanHold = hasActiveStickyHumanHold(persisted);

  const workflowAgentState = {
    ...updatedAgentState,
    doNotContact: targetMilestone === MILESTONES.DO_NOT_CONTACT,
    manualAgentOwnership: stickyHumanHold ? true : false
  };

  const ownershipAfter = stickyHumanHold
    ? OWNERSHIP.AGENT
    : deriveDefaultOwnership(targetMilestone, workflowAgentState);

  await savePersistedWorkflowState(
    phone,
    {
      canonicalMilestone: targetMilestone,
      workflowOwnership: ownershipAfter,
      needsHumanAttention: false,
      stalledAt: null,
      stallEpisodeKey: null,
      reconcileEpisodeKey: null,
      manualAgentOwnership: stickyHumanHold,
      // Preserve TAKE OVER seal timestamps; do not invent returnedToAtlasAt.
      ...(stickyHumanHold
        ? { humanTakenOverAt: persisted.humanTakenOverAt }
        : {}),
      doNotContact: targetMilestone === MILESTONES.DO_NOT_CONTACT
    },
    {
      organizationId,
      prospectId: prospect.id || null
    }
  );

  const interviewScheduled =
    targetMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
    targetMilestone === MILESTONES.INTERVIEW_DUE;

  const events = await emitHumanAdvancementEvents({
    phone,
    previousMilestone: currentMilestone,
    targetMilestone,
    ownershipBefore,
    ownershipAfter,
    capturedFields,
    interactionType: payload.interactionType || null,
    qualificationChanged: qualificationFieldsChanged(
      beforeProfile,
      mergedProfile,
      capturedFields
    ),
    interviewScheduled
  });

  if (payload.interactionNotes) {
    await logConversation({
      phone,
      name: updatedProspect.name,
      direction: "outgoing",
      message: `[Agent note] ${payload.interactionNotes}`,
      intent: "HUMAN_ADVANCEMENT",
      pipeline: "AGENT",
      currentStep: updatedProspect.current_step,
      language: updatedProspect.language || "en",
      city: updatedProspect.city,
      state: updatedProspect.state
    });
  }

  const refreshedMission = await getMissionControlState(phone);
  const workflow = await buildWorkflowReadModel({
    prospect: updatedProspect,
    brain: refreshedMission.brain,
    agentState: loadAgentState(phone)
  });

  // Implements BR-192 — terminal close cancels open follow-ups. Fail-soft.
  if (
    targetMilestone === MILESTONES.CLOSED ||
    targetMilestone === MILESTONES.DO_NOT_CONTACT
  ) {
    try {
      const followUpApplicationService = require("../application/followUpApplicationService");
      await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
        organizationId,
        prospectId: prospect.id || updatedProspect?.id || null,
        subjectPhone: phone,
        actorUserId: payload.actorUserId || payload.agentId || "system",
        targetMilestone,
        outcome: capturedFields.outcome || updatedAgentState.outcome || null
      });
    } catch (error) {
      console.warn("[follow-ups] cancel on terminal close failed", error.message);
    }
  }

  return {
    success: true,
    action: "workflow_advance",
    message: "Prospect advanced successfully.",
    previousMilestone: currentMilestone,
    targetMilestone,
    workflowOwnership: ownershipAfter,
    workflow,
    eventsEmitted: events
      .filter((entry) => entry.success)
      .map((entry) => entry.envelope?.eventType)
      .filter(Boolean)
  };
}

module.exports = {
  advanceProspectWorkflow
};
