const { findProspect, updateProspect } = require("../services/supabaseService");
const { sendTextMessage } = require("../services/whatsappService");
const { logConversation } = require("../services/logService");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");
const { cancelInterview } = require("../services/calendarService");
const { releaseSlotByIso } = require("../core/capacityEngine");
const {
  parseSchedulingState,
  mergeNotesWithSchedulingState,
  clearSchedulingFromNotes
} = require("../core/schedulingState");
const { extractEmailFromNotes } = require("../core/informationModel");
const {
  ACTION_IDS,
  resolveAvailableActions,
  normalizeInterviewType
} = require("../core/agentActionEngine");
const {
  loadAgentState,
  mergeAgentState,
  clearResourceFlags
} = require("../core/agentActionState");
const {
  buildZoomLinkMessage,
  buildOfficeLocationMessage,
  buildMissedAppointmentMessage,
  buildAgentNoteTimelineMessage,
  buildAgentActionTimelineMessage
} = require("../core/agentActionCopy");
const { getMissionControlState } = require("./conversationController");
const { buildWorkflowReadModel } = require("../core/workflowReadModel");
const { isProductionProspect } = require("../core/productionProspectFilter");

function buildActionError(action, error, message) {
  return {
    success: false,
    action,
    error,
    message
  };
}

function buildActionSuccess(action, message, workflowState = null) {
  return {
    success: true,
    action,
    message,
    workflowState
  };
}

function normalizeWhatsAppPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function logAgentTimeline(prospect, message, pipeline = "AGENT") {
  await logConversation({
    phone: prospect.phone,
    name: prospect.name,
    direction: "outgoing",
    message,
    intent: "AGENT_ACTION",
    pipeline,
    currentStep: prospect.current_step || "AGENT",
    language: prospect.language || "en",
    city: prospect.city,
    state: prospect.state
  });
}

async function sendWhatsAppOrFail(prospect, message) {
  const result = await sendTextMessage(normalizeWhatsAppPhone(prospect.phone), message);

  if (!result.success) {
    return buildActionError(
      "send_message",
      "WHATSAPP_SEND_FAILED",
      result.error || "Failed to send WhatsApp message."
    );
  }

  await logAgentTimeline(prospect, message);
  return null;
}

async function executeAgentAction(phone, action, payload = {}) {
  if (!isProductionProspect(phone)) {
    return buildActionError(action, "PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const prospect = await findProspect(phone);

  if (!prospect) {
    return buildActionError(action, "PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const agentState = loadAgentState(phone);
  const organizationSettings = getOrganizationSettings();
  const language = prospect.language === "es" ? "es" : "en";

  switch (action) {
    case ACTION_IDS.SEND_ZOOM_LINK: {
      const url = organizationSettings.zoomInterviewUrl;

      if (!url) {
        return buildActionError(
          action,
          "ZOOM_URL_NOT_CONFIGURED",
          "Zoom interview URL is not configured."
        );
      }

      if (agentState.flags?.zoom_link_sent) {
        return buildActionError(action, "ALREADY_SENT", "Zoom link was already sent.");
      }

      const message = buildZoomLinkMessage({ url, language });
      const sendError = await sendWhatsAppOrFail(prospect, message);

      if (sendError) {
        return { ...sendError, action };
      }

      const workflowState = mergeAgentState(phone, {
        flags: { zoom_link_sent: true }
      }).flags;

      return buildActionSuccess(action, "Zoom link sent via WhatsApp.", {
        flags: workflowState
      });
    }

    case ACTION_IDS.SEND_OFFICE_LOCATION: {
      if (agentState.flags?.office_location_sent) {
        return buildActionError(action, "ALREADY_SENT", "Office location was already sent.");
      }

      const message = buildOfficeLocationMessage({
        office: organizationSettings.office,
        language
      });
      const sendError = await sendWhatsAppOrFail(prospect, message);

      if (sendError) {
        return { ...sendError, action };
      }

      const workflowState = mergeAgentState(phone, {
        flags: { office_location_sent: true }
      }).flags;

      return buildActionSuccess(action, "Office location sent via WhatsApp.", {
        flags: workflowState
      });
    }

    case ACTION_IDS.SEND_MISSED_APPOINTMENT: {
      if (agentState.flags?.missed_appointment_sent) {
        return buildActionError(
          action,
          "ALREADY_SENT",
          "Missed appointment message was already sent."
        );
      }

      const message = buildMissedAppointmentMessage({
        name: prospect.name,
        language
      });
      const sendError = await sendWhatsAppOrFail(prospect, message);

      if (sendError) {
        return { ...sendError, action };
      }

      const workflowState = mergeAgentState(phone, {
        flags: { missed_appointment_sent: true },
        outcome: "No Show"
      });

      return buildActionSuccess(action, "Missed appointment message sent via WhatsApp.", {
        flags: workflowState.flags,
        outcome: workflowState.outcome
      });
    }

    case ACTION_IDS.NOTES: {
      const text = String(payload.text || "").trim();

      if (!text) {
        return buildActionError(action, "NOTE_REQUIRED", "Note text is required.");
      }

      const nextNotes = [...(agentState.agentNotes || []), text];
      mergeAgentState(phone, { agentNotes: nextNotes });
      await logAgentTimeline(prospect, buildAgentNoteTimelineMessage(text));

      return buildActionSuccess(action, "Agent note saved.", {
        agentNotes: nextNotes
      });
    }

    case ACTION_IDS.RESCHEDULE: {
      if (prospect.calendar_event_id) {
        await cancelInterview(prospect.calendar_event_id, {
          startTimeISO: prospect.appointment_date,
          interviewType: prospect.interview_type
        });
      } else if (prospect.appointment_date && prospect.interview_type) {
        releaseSlotByIso(prospect.appointment_date, prospect.interview_type);
      }

      const email = extractEmailFromNotes(prospect.notes);
      const schedulingState = parseSchedulingState(prospect.notes);

      await updateProspect(prospect.phone, {
        current_step: "SCHEDULE",
        interview_time: null,
        appointment_date: null,
        calendar_event_id: null,
        appointment_type: schedulingState.phase || null,
        notes: clearSchedulingFromNotes(prospect.notes, email)
      });

      const workflowState = clearResourceFlags(phone);

      await logAgentTimeline(
        prospect,
        buildAgentActionTimelineMessage("Interview reschedule initiated")
      );

      return buildActionSuccess(action, "Interview reset for rescheduling.", {
        flags: workflowState.flags
      });
    }

    case ACTION_IDS.SCHEDULE: {
      await logAgentTimeline(
        prospect,
        buildAgentActionTimelineMessage("Agent initiated interview scheduling")
      );

      if (prospect.current_step !== "SCHEDULE") {
        await updateProspect(prospect.phone, {
          current_step: "SCHEDULE"
        });
      }

      return buildActionSuccess(action, "Scheduling workflow ready.");
    }

    case ACTION_IDS.CALL: {
      await logAgentTimeline(
        prospect,
        buildAgentActionTimelineMessage("Agent initiated call")
      );

      return buildActionSuccess(action, "Call logged.");
    }

    case ACTION_IDS.LOG_WHATSAPP_OPEN:
    case ACTION_IDS.WHATSAPP: {
      await logAgentTimeline(
        prospect,
        buildAgentActionTimelineMessage("Agent opened WhatsApp conversation")
      );

      return buildActionSuccess(action, "WhatsApp open logged.");
    }

    default:
      return buildActionError(action, "UNKNOWN_ACTION", "Unknown agent action.");
  }
}

async function syncAgentWorkflow(phone, workflowPayload = {}) {
  const saved = mergeAgentState(phone, {
    outcome: workflowPayload.outcome ?? null,
    closureReason: workflowPayload.notInterestedReason || workflowPayload.closureReason || null,
    futureReminder: workflowPayload.futureReminder ?? null,
    followUpDate: workflowPayload.followUpDate ?? null,
    followUpTime: workflowPayload.followUpTime ?? null,
    orientationScheduled: Boolean(workflowPayload.orientationScheduled),
    onboardingUnlocked: Boolean(workflowPayload.onboardingUnlocked)
  });

  if (workflowPayload.outcome === "Rescheduled") {
    clearResourceFlags(phone);
  }

  return saved;
}

async function getMissionControlWithActions(phone) {
  if (!isProductionProspect(phone) && phone !== "latest") {
    return null;
  }

  const missionControl = await getMissionControlState(phone);

  if (!missionControl) {
    return null;
  }

  const resolvedPhone = missionControl.prospect.phone;
  const prospect = await findProspect(resolvedPhone);
  const agentState = loadAgentState(resolvedPhone);
  const organizationSettings = getOrganizationSettings();

  const availableActions = resolveAvailableActions({
    prospect,
    currentStep: missionControl.brain.currentStep,
    missingFields: missionControl.brain.missingFields,
    interviewType: missionControl.brain.interviewType,
    agentState,
    organizationSettings
  });

  const workflow = await buildWorkflowReadModel({
    prospect,
    brain: missionControl.brain,
    agentState
  });

  return {
    ...missionControl,
    workflow,
    agentState: {
      flags: agentState.flags,
      outcome: agentState.outcome,
      closureReason: agentState.closureReason,
      futureReminder: agentState.futureReminder,
      followUpDate: agentState.followUpDate,
      followUpTime: agentState.followUpTime,
      orientationScheduled: agentState.orientationScheduled,
      onboardingUnlocked: agentState.onboardingUnlocked,
      agentNotes: agentState.agentNotes
    },
    availableActions
  };
}

module.exports = {
  executeAgentAction,
  syncAgentWorkflow,
  getMissionControlWithActions
};
