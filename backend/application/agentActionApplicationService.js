/**
 * Sprint 19 — Agent Action application service.
 * Orchestrates Mission Control agent actions without HTTP concerns.
 */

const {
  findProspectInOrganization,
  findProspectForSystemIngress,
  updateProspect
} = require("../services/supabaseService");
const { sendTextMessage } = require("../services/whatsappService");
const { logConversation } = require("../services/logService");
const meetingManagementService = require("../services/meetingManagementService");
const { cancelInterview } = require("../services/calendarService");
const { releaseSlotByIso } = require("../core/capacityEngine");
const {
  parseSchedulingState,
  clearSchedulingFromNotes
} = require("../core/schedulingState");
const { extractEmailFromNotes } = require("../core/informationModel");
const {
  ACTION_IDS,
  resolveAvailableActions
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
  buildAgentActionTimelineMessage
} = require("../core/agentActionCopy");
const { getMissionControlState } = require("../core/missionControlReadModel");
const { buildWorkflowReadModel } = require("../core/workflowReadModel");
const {
  isProductionProspect,
  isSimulatorProspect
} = require("../core/productionProspectFilter");
const { assertSimulatorPhone } = require("../dev/simulatorSafety");
const { buildWorkflowGateDescriptor } = require("../core/workflowGateEngine");
const { buildInterviewBlock } = require("../core/prospectWorkspaceReadModel");
const { logInterviewerTrace } = require("../dev/interviewerTrace");
const { findPersistedAppointmentForProspect, findLatestPersistedAppointmentForProspect } = require("../services/appointmentListService");
const { enrichActionCenterWithConfidence } = require("../core/alphaConfidenceEngine");
const {
  fetchConversationThread,
  buildRecruitingFunnelStatus,
  buildAiActionCenter,
  mergeMissionControlActionCenters,
  buildLiveRevision
} = require("../core/missionControlLiveReadModel");
const {
  buildConversationOutcomeReadModel
} = require("../core/conversationOutcomeEngine");
const { getPrimaryMissionFromContext } = require("../core/missionEngine");
const { buildRecruiterBrief } = require("../core/recruiterBriefBuilder");
const { resolveProspectCommunicationCode } = require("../core/prospectLanguage");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");
const { onConversationProgress } = require("../core/recruitingWorkflowOrchestrator");
const { buildPersistedAgentNote } = require("../core/notesEngine");
const {
  requireTenantOrganizationId,
  isTenantScopedRequest
} = require("../core/tenantProspectLookup");

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

async function logAgentTimeline(prospect, message, pipeline = "AGENT", extras = {}) {
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
    state: prospect.state,
    attachment: extras.attachment || null
  });
}

async function sendWhatsAppOrFail(prospect, message, options = {}) {
  const result = await sendTextMessage(prospect.phone, message, {
    intent: options.intent || "AGENT_ACTION",
    actor: "AGENT",
    organizationId: options.organizationId || prospect.organization_id || null,
    templateKey: options.templateKey || null,
    templateVariables: options.templateVariables || {},
    templateButtonVariables: options.templateButtonVariables || {},
    idempotencyKey: options.idempotencyKey || null
  });

  if (!result.success) {
    const error = buildActionError(
      "send_message",
      result.status || "WHATSAPP_SEND_FAILED",
      result.error || "Failed to send WhatsApp message."
    );
    error.deliveryStatus = result.status || null;
    error.retryable = Boolean(result.retryable);
    return error;
  }

  return null;
}

async function resolveTenantProspect(phone, options = {}) {
  const tenantScoped = isTenantScopedRequest(options);

  if (tenantScoped) {
    const organizationId = requireTenantOrganizationId(options.organizationId);
    return findProspectInOrganization(phone, organizationId);
  }

  if (options.organizationId) {
    return findProspectInOrganization(phone, options.organizationId);
  }

  return findProspectForSystemIngress(phone);
}

async function executeAgentAction(phone, action, payload = {}, options = {}) {
  if (!isProductionProspect(phone)) {
    return buildActionError(action, "PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const prospect = await resolveTenantProspect(phone, options);

  if (!prospect) {
    return buildActionError(action, "PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const agentState = loadAgentState(phone);
  const language = resolveProspectCommunicationCode(prospect);
  const organizationId = requireTenantOrganizationId(options.organizationId);

  switch (action) {
    case ACTION_IDS.SEND_ZOOM_LINK: {
      const {
        buildZoomInvitationVariables,
        isValidHttpsZoomUrl
      } = require("../core/whatsappTemplateVariableBuilder");

      const url = await meetingManagementService.resolveJoinUrlForProspect(
        organizationId,
        phone
      );

      if (!isValidHttpsZoomUrl(url)) {
        return buildActionError(
          action,
          "MEETING_URL_NOT_CONFIGURED",
          "No meeting link is available. Configure a personal meeting URL under Organization settings."
        );
      }

      if (agentState.flags?.zoom_link_sent) {
        return buildActionError(action, "ALREADY_SENT", "Zoom link was already sent.");
      }

      const zoomVars = buildZoomInvitationVariables(prospect, url);
      if (!zoomVars.ok) {
        return buildActionError(
          action,
          zoomVars.reason || "MEETING_URL_NOT_CONFIGURED",
          "No meeting link is available."
        );
      }

      const message = buildZoomLinkMessage({ url, language });
      // Implements BR-078 — outside-window uses zoom_invitation; flags only after success.
      const sendError = await sendWhatsAppOrFail(prospect, message, {
        organizationId,
        intent: "SEND_ZOOM_LINK",
        templateKey: "zoom_invitation",
        templateVariables: zoomVars.variables,
        templateButtonVariables: zoomVars.buttonVariables
      });

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

      const {
        buildOfficeLocationVariables
      } = require("../core/whatsappTemplateVariableBuilder");
      const { composeOfficeAddressFromOfficeModel } = require("../core/officeAddressResolver");
      const appointmentRepository = require("../repositories/appointmentRepository");
      const { coerceAppointmentItems } = require("../core/appointmentCollection");

      let appointment = {};
      try {
        const searchResult = await appointmentRepository.search({
          organizationId,
          prospectPhone: phone,
          status: "scheduled"
        });
        const appointments = coerceAppointmentItems(searchResult);
        appointment =
          appointments
            .filter((item) => item.meetingAddress || item.meeting_address)
            .sort((left, right) => new Date(left.startDateTime) - new Date(right.startDateTime))[0] ||
          {};
      } catch {
        appointment = {};
      }

      const orgOffice = getOrganizationSettings().office;
      const fallbackAddress = composeOfficeAddressFromOfficeModel(orgOffice);
      const locationVars = buildOfficeLocationVariables(appointment, prospect, {
        fallbackAddress
      });

      if (!locationVars.ok) {
        return buildActionError(
          action,
          locationVars.reason || "OFFICE_ADDRESS_NOT_CONFIGURED",
          "A complete meeting address is not available."
        );
      }

      const message = buildOfficeLocationMessage({
        office: {
          name: orgOffice?.name || "Office",
          fullAddress: locationVars.variables.meeting_address
        },
        language
      });
      // Implements BR-078 — outside-window uses office_location with canonical meeting_address.
      const sendError = await sendWhatsAppOrFail(prospect, message, {
        organizationId,
        intent: "SEND_OFFICE_LOCATION",
        templateKey: "office_location",
        templateVariables: locationVars.variables
      });

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

      const {
        buildMissedAppointmentVariables
      } = require("../core/whatsappTemplateVariableBuilder");

      const message = buildMissedAppointmentMessage({
        name: prospect.name,
        language
      });
      // Implements BR-078 — outside-window uses missed_appointment.
      const sendError = await sendWhatsAppOrFail(prospect, message, {
        organizationId,
        intent: "MISSED_APPOINTMENT",
        templateKey: "missed_appointment",
        templateVariables: buildMissedAppointmentVariables(prospect)
      });

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
      const persisted = buildPersistedAgentNote(payload.text, payload.context || {}, {
        organizationId,
        authorUserId: options.authorUserId || null
      });

      if (!persisted.valid) {
        return buildActionError(
          action,
          persisted.error,
          persisted.error === "NOTE_REQUIRED"
            ? "Note text is required."
            : "Unable to attach note to the requested context."
        );
      }

      const { note, attachment } = persisted;
      const nextNotes = [...(agentState.agentNotes || []), note.content];
      mergeAgentState(phone, { agentNotes: nextNotes });
      await logAgentTimeline(prospect, persisted.timelineMessage, "AGENT", {
        attachment: {
          ...attachment,
          note
        }
      });

      return buildActionSuccess(action, "Agent note saved.", {
        agentNotes: nextNotes,
        note,
        attachment
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
      if (payload?.dateKey && payload?.timeKey && payload?.interviewType) {
        const { executeScheduleInterview } = require("./missionExecutionApplicationService");
        return executeScheduleInterview(phone, payload, options);
      }

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

    case ACTION_IDS.ESCALATE_TO_RECRUITER: {
      const { savePersistedWorkflowState } = require("../core/workflowStateStore");
      const { OWNERSHIP } = require("../core/workflowConstants");
      const { escalateConversationToHumanAssist } = require("../core/appointmentHumanAssistBridge");

      savePersistedWorkflowState(phone, {
        needsHumanAttention: true,
        workflowOwnership: OWNERSHIP.AGENT,
        manualAgentOwnership: true,
        handoffReason: "recruiter_escalation",
        handoffAt: new Date().toISOString()
      });

      await escalateConversationToHumanAssist({
        phone,
        organizationId,
        reason: "recruiter_escalation",
        summary:
          payload.summary ||
          "Recruiter escalation requested from Mission Control AI Action Center."
      }).catch(() => null);

      await logAgentTimeline(
        prospect,
        buildAgentActionTimelineMessage("Escalated to recruiter for human assist")
      );

      return buildActionSuccess(action, "Escalated to recruiter.");
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

async function getMissionControlWithActions(phone, options = {}) {
  const tenantScoped = isTenantScopedRequest(options);
  const organizationId = tenantScoped
    ? requireTenantOrganizationId(options.organizationId)
    : options.organizationId || null;

  if (options.reviewMode) {
    if (!isSimulatorProspect(phone)) {
      return null;
    }

    assertSimulatorPhone(phone);
  } else if (!isProductionProspect(phone) && phone !== "latest") {
    return null;
  }

  const readModelOptions = {
    ...options,
    organizationId,
    tenantScoped
  };

  const initialState = await getMissionControlState(phone, readModelOptions);

  if (!initialState) {
    return null;
  }

  const resolvedPhone = initialState.prospect.phone;
  const conversationMessages = await fetchConversationThread(resolvedPhone);
  const latestMessage = conversationMessages[conversationMessages.length - 1] || null;

  const missionControl = latestMessage
    ? await getMissionControlState(resolvedPhone, {
        latestMessage,
        ...readModelOptions
      })
    : initialState;

  const prospect = await resolveTenantProspect(resolvedPhone, {
    organizationId,
    tenantScoped
  });
  const agentState = loadAgentState(resolvedPhone);
  const organizationSettings = getOrganizationSettings();

  let availableActions = resolveAvailableActions({
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

  const conversationOutcome = buildConversationOutcomeReadModel({
    prospect,
    brain: missionControl.brain,
    conversationMessages
  });

  let activeAppointment = null;
  let latestAppointment = null;

  try {
    activeAppointment = await findPersistedAppointmentForProspect(resolvedPhone, organizationId);
    latestAppointment =
      activeAppointment ||
      (await findLatestPersistedAppointmentForProspect(resolvedPhone, organizationId));
  } catch (error) {
    console.error("[mission-control/activeAppointment]", error.message);
  }

  // Implements BR-039 — do not offer Schedule interview when an active appointment exists.
  if (activeAppointment) {
    availableActions = availableActions.filter((action) => action.id !== ACTION_IDS.SCHEDULE);
  }

  const primaryMission = getPrimaryMissionFromContext({
    prospect,
    brain: missionControl.brain,
    agentState,
    conversationOutcome,
    workflow,
    availableActions,
    activeAppointment
  });

  const recruiterBrief = buildRecruiterBrief({
    primaryMission,
    conversationOutcome,
    conversationMessages,
    agentState,
    workflow,
    brain: missionControl.brain
  });

  const aiActionCenter = buildAiActionCenter({
    workflow,
    availableActions,
    brain: missionControl.brain,
    conversationMessages
  });

  const autonomousProgress = await onConversationProgress({
    phone: resolvedPhone
  }).catch(() => null);

  const mergedActionCenter = mergeMissionControlActionCenters(
    aiActionCenter,
    autonomousProgress?.aiActionCenter,
    {
      brain: missionControl.brain,
      workflow
    }
  );

  const enrichedActionCenter = enrichActionCenterWithConfidence(mergedActionCenter, {
    workflow,
    brain: missionControl.brain,
    prospect
  });

  const recruitingStatus = buildRecruitingFunnelStatus(workflow, missionControl.brain);
  const liveRevision = buildLiveRevision(conversationMessages, workflow);

  const [latestConversation, workflowGate] = await Promise.all([
    Promise.resolve(
      latestMessage || {
        text: "",
        direction: "unknown",
        timestamp: null
      }
    ),
    Promise.resolve(buildWorkflowGateDescriptor(prospect, agentState))
  ]);

  const interview = buildInterviewBlock(
    prospect,
    {
      outcome: agentState.outcome
    },
    workflowGate,
    activeAppointment,
    latestAppointment
  );

  logInterviewerTrace({
    authenticatedUserId: options.userId || null,
    authenticatedUserName: null,
    interviewerUserId: interview?.interviewerUserId || activeAppointment?.interviewerUserId || null,
    interviewerName: interview?.interviewerName || activeAppointment?.interviewerName || null,
    appointmentId: interview?.appointmentId || null,
    source: "missionControl.readModel.interview"
  });

  return {
    ...missionControl,
    interview,
    recruiterBrief,
    atlasBrief: {
      summary: recruiterBrief.items
    },
    workflow,
    workflowGate,
    latestConversation,
    conversationMessages,
    aiActionCenter: enrichedActionCenter,
    recruitingStatus,
    liveRevision,
    conversationOutcome,
    workflowRequirements: conversationOutcome?.workflowRequirements || [],
    primaryMission,
    missions: primaryMission ? [primaryMission] : [],
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
  buildActionError,
  buildActionSuccess,
  executeAgentAction,
  syncAgentWorkflow,
  getMissionControlWithActions
};
