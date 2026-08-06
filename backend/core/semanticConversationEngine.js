const supabaseService = require("../services/supabaseService");
const { findProspect, createProspect, updateProspect } = supabaseService;
const { onConversationProgress } = require("./recruitingWorkflowHooks");
const { logConversation } = require("../services/logService");
const { detectIntent } = require("./intentEngine");
const { routeConversation } = require("./conversationRouter");
const { getResponse } = require("./responseEngine");
const { findFAQ } = require("./faqEngine");
const { responseBuilder } = require("./responseBuilder");
const { getPersonality } = require("./personalityEngine");
const {
  getSchedulingOptions,
  buildDayQuestionFromSchedule,
  buildInitialSchedulingStateFromSchedule,
  buildInitialSchedulingStateFromDayPart,
  getInterviewPreferenceQuestion,
  getScheduleQuestion,
  handleScheduleTurn,
  buildConfirmationDetails,
  PHASES
} = require("./schedulingEngine");
const {
  parseSchedulingState,
  mergeNotesWithSchedulingState
} = require("./schedulingState");
const {
  buildProfileFromProspect,
  mergeProfile,
  getMissingFields,
  getNextMissingField,
  deriveCurrentStep,
  profileToProspectUpdates,
  emailRequired,
  isScheduleComplete,
  getEffectiveInterviewType,
  buildQualificationBrain,
  canBeginScheduling,
  isPreScheduleQualificationComplete
} = require("./informationModel");
const {
  defaultCaptureState,
  parseQualificationCapture,
  encodeQualificationCapture,
  mergeNotesWithQualificationCapture,
  markCapturedFields,
  hasQualificationCaptureMarker,
  isLocationExplicitlyComplete,
  isAuthorizationExplicitlyCaptured
} = require("./qualificationCaptureState");
const { logQualificationBrainTurn } = require("./qualificationBrainLogger");
const { applyBusinessRulesToProfile } = require("./businessRulesApplicator");
const {
  buildHumanCoordinatorReply,
  buildCoverageScheduleIntro,
  buildInterviewPreferenceQuestion
} = require("./conversationCopy");
const {
  getFirstMessage,
  getStateQuestion,
  getAuthorizationQuestion,
  getAuthorizationDeniedMessage,
  getLocalOfficeDayPartMessage,
  getRemoteZoomDayPartMessage,
  getLocalZoomSwitchMessage,
  getDayPartQuestion,
  getNameQuestion,
  getEmailCollectionQuestion,
  getHandoffMessage,
  getCanonicalFaqAnswer,
  buildBookingConfirmation
} = require("./teamVisionWorkflowCopy");
const { evaluateCoverage } = require("./businessRulesEngine");
const { extractInformation, detectLocalZoomPreference, isAuthorizationAmbiguous, isEmailDeclined } = require("./informationExtractor");
const {
  resolveConversationLanguage,
  detectMessageLanguage
} = require("./conversationLanguage");
const { resolveConversationSchedulePayload } = require("./conversationScheduleDelegation");
const missionExecutionApplicationService = require("../application/missionExecutionApplicationService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const capacityEngine = require("./capacityEngine");
const autonomousScheduleAgentResolver = require("./autonomousScheduleAgentResolver");
const workflowStateStore = require("./workflowStateStore");
const { OWNERSHIP, MILESTONES } = require("./workflowConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

const CONVERSATION_GOAL = "Schedule Interview";

function isLikelyQuestion(message) {
  const text = String(message || "").trim();

  if (!text) {
    return false;
  }

  if (text.includes("?")) {
    return true;
  }

  if (
    /^(what|how|when|where|why|who|is|are|can|do|does|could|would|will|cuanto|cuánto|como|cómo|que|qué|es|son|puedo|hay|tell me)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return /\b(de que trata|de qué trata|que es|qué es|is this|is it|legitimate|legit|online)\b/i.test(
    text
  );
}

function shouldAnswerFAQ(message) {
  return isLikelyQuestion(message);
}

function detectLanguage(prospect, message) {
  return resolveConversationLanguage(prospect, message);
}

function buildShortAcknowledgement(extracted, language) {
  if (!extracted || !Object.keys(extracted).length) {
    return "";
  }

  if (extracted.occupation) {
    return language === "es"
      ? "Gracias por compartirlo."
      : "Thank you for sharing that.";
  }

  if (extracted.authorization !== undefined) {
    if (extracted.authorization === false) {
      return "";
    }

    return language === "es" ? "Gracias." : "Thanks.";
  }

  if (extracted.city || extracted.state) {
    return language === "es" ? "Gracias." : "Thanks.";
  }

  if (extracted.interviewType || extracted.dayPart) {
    return language === "es" ? "Excelente." : "Excellent.";
  }

  if (extracted.name) {
    return language === "es" ? "Gracias." : "Thanks.";
  }

  if (extracted.email) {
    return language === "es" ? "Gracias." : "Thanks.";
  }

  return "";
}

function resolveWorkflowFaq(message, language) {
  const text = String(message || "").toLowerCase();

  if (
    /de qu[eé] se trata|de qu[eé] trata|what is it about|what is this about|necesito experiencia|need experience|\bexperiencia\b/i.test(
      text
    )
  ) {
    return getCanonicalFaqAnswer(language);
  }

  return findFAQ(message, language);
}

function buildInterviewFormatQuestion(profile, language) {
  const coverage = evaluateCoverage({
    city: profile.city,
    state: profile.state
  });

  if (coverage.coverage === "LOCAL") {
    return getLocalOfficeDayPartMessage(language);
  }

  return getRemoteZoomDayPartMessage(language);
}

function buildQuestionForMissingField(field, profile, language, prospect) {
  const schedulingState = parseSchedulingState(prospect?.notes);

  switch (field) {
    case "city":
      return getFirstMessage(language);

    case "state":
      return getStateQuestion(profile.city, language);

    case "authorization":
      return getAuthorizationQuestion(language);

    case "interviewType":
      return buildInterviewFormatQuestion(profile, language);

    case "dayPart":
      return getDayPartQuestion(language);

    case "schedule": {
      const scheduleQuestion =
        schedulingState?.phase && schedulingState.phase !== PHASES.DAY
          ? getScheduleQuestion(
              schedulingState,
              getEffectiveInterviewType(profile),
              language
            )
          : getScheduleQuestion(
              { phase: PHASES.DAY, offeredDays: schedulingState.offeredDays || [] },
              getEffectiveInterviewType(profile),
              language
            );

      if (!schedulingState?.phase || schedulingState.phase === PHASES.DAY) {
        const intro = buildCoverageScheduleIntro(profile, language);
        return `${intro}\n\n${scheduleQuestion}`;
      }

      return scheduleQuestion;
    }

    case "email":
      return getEmailCollectionQuestion(language);

    case "name":
      return getNameQuestion(language);

    default:
      return language === "es"
        ? "¿Podemos continuar con tu entrevista?"
        : "Can we continue scheduling your interview?";
  }
}

function buildInformationalWorkflowReply(informationalReply, nextField, profile, language, prospect) {
  const question = buildQuestionForMissingField(nextField, profile, language, prospect);
  return `${informationalReply}\n\n${question}`;
}

function hasWorkflowAdvancement(extracted) {
  if (!extracted || !Object.keys(extracted).length) {
    return false;
  }

  return Object.entries(extracted).some(([key, value]) => {
    if (key === "preferredPeriod" || key === "scheduleOverride" || key === "authorizationAmbiguous") {
      return false;
    }

    return value !== null && value !== undefined && value !== "";
  });
}

async function initializeScheduleIfNeeded(prospect, profile) {
  const captureState = parseQualificationCapture(prospect.notes);
  const brainOptions = { notes: prospect.notes, captureState };

  if (!canBeginScheduling(profile, brainOptions)) {
    return prospect;
  }

  const interviewType = getEffectiveInterviewType(profile, "", brainOptions);

  if (!interviewType || isScheduleComplete(profile)) {
    return prospect;
  }

  const schedulingState = parseSchedulingState(prospect.notes);

  if (schedulingState.offeredDays?.length) {
    return prospect;
  }

  const schedule = await getSchedulingOptions({
    prospect,
    interviewType,
    dayPart: profile.dayPart,
    currentDate: new Date()
  });

  const nextState = profile.dayPart
    ? buildInitialSchedulingStateFromDayPart(profile.dayPart, interviewType, profile.occupation)
    : buildInitialSchedulingStateFromSchedule(
        schedule,
        profile.occupation,
        interviewType,
        profile.dayPart
      );

  await updateProspect(prospect.phone, {
    current_step: "SCHEDULE",
    appointment_type: PHASES.DAY,
    notes: mergeNotesWithSchedulingState(prospect.notes, nextState)
  });

  return findProspect(prospect.phone);
}

function isActiveScheduleStep(prospect) {
  const schedulingState = parseSchedulingState(prospect?.notes);

  return Boolean(prospect?.appointment_type && schedulingState?.phase);
}

async function handleScheduleMessage(prospect, message, language, personality) {
  const result = handleScheduleTurn({
    prospect,
    message,
    language,
    personality
  });

  await updateProspect(prospect.phone, result.prospectUpdates);

  return result;
}

async function markAutonomousScheduleHumanAssist(prospect, organizationId, reason, details = {}) {
  workflowStateStore.savePersistedWorkflowState(prospect.phone, {
    canonicalMilestone: MILESTONES.INTERVIEW_READY,
    workflowOwnership: OWNERSHIP.AGENT,
    needsHumanAttention: true,
    manualAgentOwnership: true,
    doNotContact: false
  });

  logWhatsAppStage("autonomous_schedule_human_assist", {
    level: "warn",
    phone: prospect.phone,
    organizationId,
    reason,
    ...details
  });
}

async function completeInterview(prospect, profile, language) {
  if (!prospect.appointment_date) {
    throw new Error("Interview slot must be selected before confirming.");
  }

  const schedulePayload = resolveConversationSchedulePayload(prospect, profile);

  if (!schedulePayload.dateKey || !schedulePayload.timeKey || !schedulePayload.interviewType) {
    return {
      success: false,
      reply:
        language === "es"
          ? "Necesitamos confirmar el horario antes de agendar. Por favor elige otro horario disponible."
          : "We need a confirmed time before booking. Please choose another available slot."
    };
  }

  // Conversation scheduling already reserved capacity with interview-type key; release before canonical booking.
  capacityEngine.releaseSlotByIso(
    prospect.appointment_date,
    profile.interviewType || prospect.interview_type || schedulePayload.interviewType
  );

  const organizationId = prospect.organization_id || DEFAULT_ORGANIZATION_ID;
  const resolvedAgent = await autonomousScheduleAgentResolver.resolveAutonomousScheduleAgentId({
    prospect,
    organizationId
  });
  const agentId = resolvedAgent.agentId;

  if (!agentId) {
    await markAutonomousScheduleHumanAssist(prospect, organizationId, "missing_schedule_agent", {
      resolutionSource: resolvedAgent.source
    });

    return {
      success: false,
      reply: autonomousScheduleAgentResolver.buildSafeScheduleFailureReply(language),
      humanAssist: true
    };
  }

  // Stamp ownership for autonomous WhatsApp leads so appointments and UI stay tenant-scoped.
  if (!prospect.owner_user_id) {
    await supabaseService.updateProspect(prospect.phone, { owner_user_id: agentId }).catch((error) => {
      logWhatsAppStage("autonomous_schedule_owner_stamp_failed", {
        level: "warn",
        error: error.message,
        phone: prospect.phone
      });
    });
    prospect = { ...prospect, owner_user_id: agentId };
  }

  let scheduleResult;

  try {
    scheduleResult = await missionExecutionApplicationService.executeScheduleInterview(
      prospect.phone,
      {
        dateKey: schedulePayload.dateKey,
        timeKey: schedulePayload.timeKey,
        interviewType: schedulePayload.interviewType,
        email: schedulePayload.email || profile.email || undefined
      },
      {
        organizationId,
        agentId,
        userId: agentId
      }
    );
  } catch (error) {
    logWhatsAppStage("autonomous_schedule_exception", {
      level: "error",
      error: error.message,
      phone: prospect.phone,
      organizationId,
      agentSource: resolvedAgent.source
    });

    await markAutonomousScheduleHumanAssist(prospect, organizationId, "schedule_exception", {
      agentSource: resolvedAgent.source
    });

    return {
      success: false,
      reply: autonomousScheduleAgentResolver.buildSafeScheduleFailureReply(language),
      humanAssist: true
    };
  }

  if (!scheduleResult?.success) {
    logWhatsAppStage("autonomous_schedule_failed", {
      level: "error",
      phone: prospect.phone,
      organizationId,
      publicCode: scheduleResult?.error || null,
      agentSource: resolvedAgent.source
    });

    await markAutonomousScheduleHumanAssist(prospect, organizationId, "schedule_persistence_failed", {
      publicCode: scheduleResult?.error || null,
      agentSource: resolvedAgent.source
    });

    // Never forward internal diagnostics; only allow already-safe customer copy through.
    const rawMessage = scheduleResult?.message || "";
    const reply =
      rawMessage &&
      !autonomousScheduleAgentResolver.isUnsafeCustomerScheduleMessage(rawMessage)
        ? rawMessage
        : autonomousScheduleAgentResolver.buildSafeScheduleFailureReply(language);

    return {
      success: false,
      reply,
      humanAssist: true
    };
  }

  if (!scheduleResult.appointmentId) {
    await markAutonomousScheduleHumanAssist(prospect, organizationId, "missing_appointment_id", {
      agentSource: resolvedAgent.source
    });

    return {
      success: false,
      reply: autonomousScheduleAgentResolver.buildSafeScheduleFailureReply(language),
      humanAssist: true
    };
  }

  const confirmationText = buildBookingConfirmation({
    interviewType: profile.interviewType,
    slotLabel: profile.preferredTime || prospect.interview_time,
    language
  });

  await scheduleZoomLinkDelivery({
    prospect,
    profile,
    appointmentDate: scheduleResult.booking?.startTimeISO || prospect.appointment_date
  }).catch((error) => {
    console.warn("[semanticConversationEngine] zoom link scheduling failed:", error.message);
  });

  const response = responseBuilder({
    tone: "celebratory",
    acknowledgement: confirmationText,
    transition: "",
    question: language === "es" ? "¡Esperamos conocerte!" : "We look forward to meeting you!",
    typingDelay: 1500,
    responseStyle: "professional"
  });

  return {
    success: true,
    reply: response.text,
    appointmentId: scheduleResult.appointmentId || null,
    agentId,
    agentSource: resolvedAgent.source
  };
}

async function scheduleZoomLinkDelivery({ prospect, profile, appointmentDate }) {
  if (!String(profile.interviewType || "").toLowerCase().includes("zoom")) {
    return;
  }

  const appointmentTime = new Date(appointmentDate);
  const deliveryTime = new Date(appointmentTime.getTime() - 30 * 60 * 1000);

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "zoom_link_delivery",
      phone: prospect.phone,
      scheduledFor: deliveryTime.toISOString(),
      appointmentAt: appointmentTime.toISOString(),
      status: "scheduled"
    })
  );
}

async function buildSemanticReply({
  prospect,
  profile,
  extracted,
  language,
  isNew,
  informationalReply,
  localZoomSwitch = false
}) {
  const captureState = parseQualificationCapture(prospect?.notes);
  const brainOptions = { notes: prospect?.notes, captureState };
  const missing = getMissingFields(profile, brainOptions);
  const nextField = getNextMissingField(profile, brainOptions);

  if (!missing.length) {
    const completion = await completeInterview(prospect, profile, language);
    return completion.reply;
  }

  if (nextField === "schedule" && canBeginScheduling(profile, brainOptions)) {
    prospect = await initializeScheduleIfNeeded(prospect, profile);
  }

  let question = buildQuestionForMissingField(nextField, profile, language, prospect);

  if (
    nextField === "dayPart" &&
    captureState.interviewType &&
    (extracted.authorization !== undefined || extracted.interviewType)
  ) {
    question = buildInterviewFormatQuestion(profile, language);
  }

  if (localZoomSwitch) {
    question = getLocalZoomSwitchMessage(language);
  }

  if (informationalReply) {
    return buildInformationalWorkflowReply(
      informationalReply,
      nextField,
      profile,
      language,
      prospect
    );
  }

  if (isNew && !(extracted.city || extracted.state)) {
    return getFirstMessage(language);
  }

  const personality = getPersonality({
    currentStep: deriveCurrentStep(profile, parseSchedulingState(prospect.notes)),
    intent: detectIntent(""),
    memory: null,
    leadStatus: deriveCurrentStep(profile, parseSchedulingState(prospect.notes)),
    occupation: profile.occupation,
    language,
    message: "",
    interviewType: profile.interviewType,
    schedulingState: parseSchedulingState(prospect.notes)
  });

  const response = responseBuilder({
    tone: personality.tone,
    acknowledgement: buildShortAcknowledgement(extracted, language),
    question,
    typingDelay: personality.typingDelay,
    responseStyle: personality.responseStyle,
    sensitiveContext: personality.sensitiveContext
  });

  return response.text;
}

async function syncProfileToProspect(prospect, profile, options = {}) {
  const captureState = options.captureState || parseQualificationCapture(prospect.notes);
  const brainOptions = {
    notes: prospect.notes,
    captureState
  };
  const updates = {
    last_message: prospect.last_message
  };

  if (options.language === "es" || options.language === "en") {
    updates.language = options.language;
    updates.communication_language = options.language;
  }

  if (profile.city) {
    updates.city = profile.city;
  }

  if (profile.state) {
    updates.state = profile.state;
  }

  if (profile.authorization !== null && profile.authorization !== undefined) {
    updates.work_authorized = profile.authorization;
  }

  if (profile.occupation) {
    updates.occupation = profile.occupation;
  }

  if (profile.interviewType) {
    updates.interview_type = profile.interviewType;
  } else {
    const autoType = getEffectiveInterviewType(profile, "", brainOptions);
    if (autoType) {
      updates.interview_type = autoType;
    }
  }

  if (profile.preferredTime) {
    updates.interview_time = profile.preferredTime;
  }

  if (profile.appointmentDate) {
    updates.appointment_date = profile.appointmentDate;
  }

  if (captureState.name && profile.name) {
    updates.name = profile.name;
  }

  const schedulingState = parseSchedulingState(prospect.notes);
  updates.current_step = deriveCurrentStep(profile, schedulingState, brainOptions);

  let notes = prospect.notes;
  if (options.captureState) {
    notes = mergeNotesWithQualificationCapture(notes, options.captureState);
  }

  if (profile.dayPart) {
    const currentScheduling = parseSchedulingState(notes);
    notes = mergeNotesWithSchedulingState(notes, {
      ...currentScheduling,
      period: profile.dayPart
    });
  }

  if (profile.email) {
    notes = String(notes || "")
      .replace(/\|?EMAIL:[^|]+/i, "")
      .replace(/^\|+/, "");
    notes = notes ? `${notes}|EMAIL:${profile.email}` : `EMAIL:${profile.email}`;
  }

  if (notes !== prospect.notes) {
    updates.notes = notes;
  }

  await updateProspect(prospect.phone, updates);
}

async function handleSemanticMessage({
  phone,
  name,
  message,
  channel = "whatsapp",
  skipConversationLogging = false
}) {
  const recordLog = skipConversationLogging
    ? async () => ({ success: true, skipped: true })
    : logConversation;

  const cleanMessage = String(message || "").trim();
  const intent = detectIntent(cleanMessage);
  let prospect = await findProspect(phone);
  const wasNewProspect = !prospect;

  if (wasNewProspect) {
    await createProspect(phone, name, cleanMessage);
    await updateProspect(phone, {
      notes: encodeQualificationCapture(defaultCaptureState())
    });
    prospect = await findProspect(phone);
  } else if (!hasQualificationCaptureMarker(prospect.notes)) {
    await updateProspect(phone, {
      notes: mergeNotesWithQualificationCapture(prospect.notes, defaultCaptureState())
    });
    prospect = await findProspect(phone);
  }

  const activeLanguage = resolveConversationLanguage(prospect, cleanMessage);

  if (detectMessageLanguage(cleanMessage)) {
    await updateProspect(prospect.phone, {
      language: activeLanguage,
      communication_language: activeLanguage
    });
    prospect = {
      ...prospect,
      language: activeLanguage,
      communication_language: activeLanguage
    };
  }

  const language = activeLanguage;
  const preTurnBrain = buildQualificationBrain(prospect, {
    channel,
    message: cleanMessage,
    applyRules: false
  });
  let profile = preTurnBrain.profile;
  const nextField = preTurnBrain.nextField;
  const inSchedule = isActiveScheduleStep(prospect) && preTurnBrain.canBeginScheduling;
  const extracted = extractInformation(cleanMessage, profile, {
    nextField,
    inSchedule
  });

  const faqReply =
    shouldAnswerFAQ(cleanMessage) && !hasWorkflowAdvancement(extracted)
      ? resolveWorkflowFaq(cleanMessage, language)
      : null;
  const isInformationalOnly = Boolean(faqReply);

  if (isInformationalOnly) {
    await recordLog({
      phone,
      name,
      direction: "incoming",
      message: cleanMessage,
      intent,
      pipeline: preTurnBrain.currentStep,
      currentStep: preTurnBrain.currentStep,
      language,
      city: prospect.city,
      state: prospect.state
    });

    const informationalReplyText = buildInformationalWorkflowReply(
      faqReply,
      nextField,
      profile,
      language,
      prospect
    );

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: informationalReplyText,
      intent,
      pipeline: preTurnBrain.currentStep,
      currentStep: preTurnBrain.currentStep,
      language,
      city: prospect.city,
      state: prospect.state
    });

    return informationalReplyText;
  }

  profile = mergeProfile(profile, {
    city: extracted.city,
    state: extracted.state,
    authorization: extracted.authorization,
    occupation: extracted.occupation,
    interviewType: extracted.interviewType,
    dayPart: extracted.dayPart,
    email: extracted.email,
    name: extracted.name
  });

  if (extracted.name) {
    profile.name = extracted.name;
  }

  let captureState = markCapturedFields(
    parseQualificationCapture(prospect.notes),
    extracted
  );

  if (extracted.emailSkipped) {
    captureState.email = true;
  }

  if (extracted.authorizationAmbiguous) {
    await syncProfileToProspect(prospect, profile, { language, captureState });
    const handoffReply = getHandoffMessage(language);

    await recordLog({
      phone,
      name,
      direction: "incoming",
      message: cleanMessage,
      intent,
      pipeline: "HANDOFF",
      currentStep: "HANDOFF",
      language,
      city: profile.city,
      state: profile.state
    });

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: handoffReply,
      intent,
      pipeline: "HANDOFF",
      currentStep: "HANDOFF",
      language,
      city: profile.city,
      state: profile.state
    });

    const { escalateConversationToHumanAssist } = require("./appointmentHumanAssistBridge");
    await escalateConversationToHumanAssist({
      phone,
      organizationId: prospect.organization_id,
      reason: "ambiguous_work_authorization",
      summary: "Ambiguous work authorization response"
    }).catch(() => {});

    return handoffReply;
  }

  if (extracted.authorization === false) {
    captureState.authorization = true;
    await syncProfileToProspect(prospect, profile, { language, captureState });
    const deniedReply = getAuthorizationDeniedMessage(language);

    await recordLog({
      phone,
      name,
      direction: "incoming",
      message: cleanMessage,
      intent,
      pipeline: "WORK_AUTHORIZATION",
      currentStep: "WORK_AUTHORIZATION",
      language,
      city: profile.city,
      state: profile.state
    });

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: deniedReply,
      intent,
      pipeline: "WORK_AUTHORIZATION",
      currentStep: "WORK_AUTHORIZATION",
      language,
      city: profile.city,
      state: profile.state
    });

    return deniedReply;
  }

  const localCoverage = evaluateCoverage({ city: profile.city, state: profile.state });
  const localZoomSwitch =
    detectLocalZoomPreference(cleanMessage) &&
    localCoverage.coverage === "LOCAL" &&
    (nextField === "dayPart" || nextField === "interviewType" || profile.interviewType === "In Person");

  if (localZoomSwitch) {
    profile.interviewType = "Zoom";
    captureState.interviewType = true;
  }

  let rulesResult = { profile, escalation: null };

  const authReady =
    captureState.authorization ||
    (extracted.authorization !== undefined && extracted.authorization !== null);

  if (
    !inSchedule &&
    isLocationExplicitlyComplete(profile, captureState, prospect.notes) &&
    authReady &&
    profile.authorization !== false
  ) {
    rulesResult = applyBusinessRulesToProfile(
      profile,
      cleanMessage,
      extracted.interviewType
    );
    profile = rulesResult.profile;

    if (profile.interviewType) {
      captureState.interviewType = true;
    }
  }

  const postMergeBrain = buildQualificationBrain(
    { ...prospect, city: profile.city, state: profile.state, occupation: profile.occupation, work_authorized: profile.authorization, interview_type: profile.interviewType },
    { channel, message: cleanMessage, captureState, applyRules: false }
  );

  logQualificationBrainTurn({
    phone,
    message: cleanMessage,
    qualificationData: {
      authorization: profile.authorization,
      city: profile.city,
      state: profile.state,
      interviewType: profile.interviewType,
      dayPart: profile.dayPart
    },
    captureState,
    missingFields: postMergeBrain.missingFields,
    nextField: postMergeBrain.nextField,
    canBeginScheduling: postMergeBrain.canBeginScheduling,
    schedulingEligibleReason: postMergeBrain.schedulingEligibleReason,
    isLocal: postMergeBrain.isLocal,
    calendarChecked: postMergeBrain.calendarChecked,
    handoffRequired: Boolean(rulesResult.escalation?.needsHumanCoordinator),
    handoffReason: rulesResult.escalation?.reason || null,
    profileCity: prospect.city,
    profileState: prospect.state,
    seededCityBypassBlocked:
      Boolean(prospect.city && !captureState.city) ||
      Boolean(prospect.state && !captureState.state)
  });

  if (rulesResult.escalation?.needsHumanCoordinator) {
    prospect.last_message = cleanMessage;
    await syncProfileToProspect(prospect, profile, { language, captureState });
    const coordinatorReply = buildHumanCoordinatorReply("SPECIAL_MEETING_REQUEST", language);

    const { escalateConversationToHumanAssist } = require("./appointmentHumanAssistBridge");
    await escalateConversationToHumanAssist({
      phone,
      organizationId: prospect.organization_id,
      reason: "unusual_meeting_method",
      summary: rulesResult.escalation?.reason || "Meeting exception"
    }).catch(() => {});

    await recordLog({
      phone,
      name,
      direction: "incoming",
      message: cleanMessage,
      intent,
      pipeline: prospect.current_step || "NEW",
      currentStep: prospect.current_step || "NEW",
      language,
      city: profile.city,
      state: profile.state
    });

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: coordinatorReply,
      intent,
      pipeline: "HANDOFF",
      currentStep: "HANDOFF",
      language,
      city: profile.city,
      state: profile.state
    });

    return coordinatorReply;
  }

  await recordLog({
    phone,
    name,
    direction: "incoming",
    message: cleanMessage,
    intent,
    pipeline: prospect.current_step || "NEW",
    currentStep: prospect.current_step || "NEW",
    language,
    city: profile.city,
    state: profile.state
  });

  if (prospect.current_step === "CONFIRMED" && prospect.calendar_event_id) {
    const confirmedReply =
      language === "es"
        ? "✅ Tu entrevista ya está confirmada. Un agente de Team Vision se comunicará contigo si es necesario realizar algún ajuste."
        : "✅ Your interview is already confirmed. A Team Vision agent will contact you if any adjustment is needed.";

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: confirmedReply,
      intent,
      pipeline: "CONFIRMED",
      currentStep: "CONFIRMED",
      language,
      city: profile.city,
      state: profile.state
    });

    return confirmedReply;
  }

  const route = routeConversation({
    prospect: { ...prospect, ...profileToProspectUpdates(profile) },
    message: cleanMessage,
    intent
  });
  const interruptionReply = route.interrupt ? getResponse(intent, language) : null;
  const informationalReply = interruptionReply;

  prospect.last_message = cleanMessage;
  await syncProfileToProspect(prospect, profile, { language, captureState });
  prospect = await findProspect(phone);
  profile = buildProfileFromProspect(prospect, channel);
  captureState = parseQualificationCapture(prospect.notes);

  const brainOptions = { notes: prospect.notes, captureState };
  let postSyncRules = { profile, escalation: null };

  if (
    !inSchedule &&
    !isActiveScheduleStep(prospect) &&
    isLocationExplicitlyComplete(profile, captureState, prospect.notes)
  ) {
    postSyncRules = applyBusinessRulesToProfile(profile, cleanMessage, extracted.interviewType);
    profile = postSyncRules.profile;
  }

  if (postSyncRules.escalation?.needsHumanCoordinator) {
    await syncProfileToProspect(prospect, profile, { language, captureState });
    const coordinatorReply = buildHumanCoordinatorReply("SPECIAL_MEETING_REQUEST", language);

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: coordinatorReply,
      intent,
      pipeline: "HANDOFF",
      currentStep: "HANDOFF",
      language,
      city: profile.city,
      state: profile.state
    });

    return coordinatorReply;
  }

  if (postSyncRules.profile.interviewType !== prospect.interview_type) {
    await syncProfileToProspect(prospect, profile, { language, captureState });
    prospect = await findProspect(phone);
    profile = buildProfileFromProspect(prospect, channel);
    captureState = parseQualificationCapture(prospect.notes);
  }

  if (
    isActiveScheduleStep(prospect) &&
    canBeginScheduling(profile, brainOptions) &&
    getEffectiveInterviewType(profile, cleanMessage, brainOptions) &&
    !isScheduleComplete(profile)
  ) {
    const personality = getPersonality({
      currentStep: "SCHEDULE",
      intent,
      memory: null,
      leadStatus: "SCHEDULE",
      occupation: profile.occupation,
      language,
      message: cleanMessage,
      interviewType: profile.interviewType,
      schedulingState: parseSchedulingState(prospect.notes)
    });

    const scheduleResult = await handleScheduleMessage(
      prospect,
      cleanMessage,
      language,
      personality
    );
    const scheduleReply = scheduleResult.replyText;

    if (scheduleResult.humanHandoff) {
      const coordinatorReply = buildHumanCoordinatorReply(
        scheduleResult.handoffReason || "OUTSIDE_SCHEDULING_WINDOW",
        language
      );

      const { escalateConversationToHumanAssist } = require("./appointmentHumanAssistBridge");
      await escalateConversationToHumanAssist({
        phone,
        organizationId: prospect.organization_id,
        reason: (scheduleResult.handoffReason || "zoom_access_failed").toLowerCase(),
        summary: coordinatorReply
      }).catch(() => {});

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: coordinatorReply,
        intent,
        pipeline: "HANDOFF",
        currentStep: "HANDOFF",
        language,
        city: profile.city,
        state: profile.state
      });

      return coordinatorReply;
    }

    prospect = await findProspect(phone);
    profile = buildProfileFromProspect(prospect, channel);
    captureState = parseQualificationCapture(prospect.notes);

    const postScheduleBrainOptions = { notes: prospect.notes, captureState };
    const postScheduleMissing = getMissingFields(profile, postScheduleBrainOptions);

    if (isScheduleComplete(profile) && postScheduleMissing.length) {
      const identityReply = await buildSemanticReply({
        prospect,
        profile,
        extracted: {},
        language,
        isNew: false,
        informationalReply,
        localZoomSwitch: false
      });

      await syncProfileToProspect(prospect, profile, { language, captureState });

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: identityReply,
        intent,
        pipeline: deriveCurrentStep(profile, parseSchedulingState(prospect.notes), postScheduleBrainOptions),
        currentStep: deriveCurrentStep(profile, parseSchedulingState(prospect.notes), postScheduleBrainOptions),
        language,
        city: profile.city,
        state: profile.state
      });

      return identityReply;
    }

    if (isScheduleComplete(profile) && !postScheduleMissing.length) {
      const completion = await completeInterview(prospect, profile, language);

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: completion.reply,
        intent,
        pipeline: completion.success ? "CONFIRMED" : "SCHEDULE",
        currentStep: completion.success ? "CONFIRMED" : "SCHEDULE",
        language,
        city: profile.city,
        state: profile.state
      });

      return completion.reply;
    }

    if (informationalReply && prospect.current_step !== "EMAIL") {
      const currentBrain = buildQualificationBrain(prospect, { channel, message: cleanMessage });
      const followUp = buildInformationalWorkflowReply(
        informationalReply,
        currentBrain.nextField,
        currentBrain.profile,
        language,
        prospect
      );
      const combined = followUp;

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: combined,
        intent,
        pipeline: prospect.current_step,
        currentStep: prospect.current_step,
        language,
        city: profile.city,
        state: profile.state
      });

      return combined;
    }

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: scheduleReply,
      intent,
      pipeline: prospect.current_step,
      currentStep: prospect.current_step,
      language,
      city: profile.city,
      state: profile.state
    });

    return scheduleReply;
  }

  const nextFieldAfterMerge = getNextMissingField(profile, {
    notes: prospect.notes,
    captureState
  });

  if (nextFieldAfterMerge === "email" || prospect.current_step === "EMAIL") {
    if (extracted.email) {
      profile.email = extracted.email;
      captureState = markCapturedFields(captureState, extracted);
      await updateProspect(prospect.phone, {
        notes: mergeNotesWithQualificationCapture(prospect.notes, captureState)
      });
      prospect = await findProspect(phone);
      profile = buildProfileFromProspect(prospect, channel);

      const completion = await completeInterview(prospect, profile, language);

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: completion.reply,
        intent,
        pipeline: completion.success ? "CONFIRMED" : "SCHEDULE",
        currentStep: completion.success ? "CONFIRMED" : "SCHEDULE",
        language,
        city: profile.city,
        state: profile.state
      });

      return completion.reply;
    }

    if (extracted.emailSkipped || isEmailDeclined(cleanMessage)) {
      captureState.email = true;
      await updateProspect(prospect.phone, {
        notes: mergeNotesWithQualificationCapture(prospect.notes, captureState)
      });
      prospect = await findProspect(phone);
      profile = buildProfileFromProspect(prospect, channel);

      const completion = await completeInterview(prospect, profile, language);

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: completion.reply,
        intent,
        pipeline: completion.success ? "CONFIRMED" : "SCHEDULE",
        currentStep: completion.success ? "CONFIRMED" : "SCHEDULE",
        language,
        city: profile.city,
        state: profile.state
      });

      return completion.reply;
    }
  }

  if (nextFieldAfterMerge === "name" && !extracted.name && isScheduleComplete(profile)) {
    const nameReply = await buildSemanticReply({
      prospect,
      profile,
      extracted,
      language,
      isNew: false,
      informationalReply,
      localZoomSwitch
    });

    await syncProfileToProspect(prospect, profile, { language, captureState });

    await recordLog({
      phone,
      name,
      direction: "outgoing",
      message: nameReply,
      intent,
      pipeline: "NAME",
      currentStep: "NAME",
      language,
      city: profile.city,
      state: profile.state
    });

    return nameReply;
  }

  const replyText = await buildSemanticReply({
    prospect,
    profile,
    extracted,
    language,
    isNew: wasNewProspect,
    informationalReply,
    localZoomSwitch
  });

  await syncProfileToProspect(prospect, profile, { language, captureState });
  prospect = await findProspect(phone);

  await recordLog({
    phone,
    name,
    direction: "outgoing",
    message: replyText,
    intent,
    pipeline: deriveCurrentStep(profile, parseSchedulingState(prospect.notes)),
    currentStep: deriveCurrentStep(profile, parseSchedulingState(prospect.notes)),
    language,
    city: profile.city,
    state: profile.state
  });

  await onConversationProgress({ phone }).catch((error) => {
    console.warn("[semanticConversationEngine] recruiting progress hook failed:", error.message);
  });

  return replyText;
}

module.exports = {
  CONVERSATION_GOAL,
  detectLanguage,
  handleSemanticMessage,
  buildQuestionForMissingField,
  buildShortAcknowledgement,
  completeInterview
};
