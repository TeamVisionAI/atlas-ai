const {
  findProspect,
  createProspect,
  updateProspect
} = require("../services/supabaseService");
const { createInterview } = require("../services/calendarService");
const { onInterviewScheduled, onConversationProgress } = require("./recruitingWorkflowHooks");
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
  getEffectiveInterviewType
} = require("./informationModel");
const { applyBusinessRulesToProfile } = require("./businessRulesApplicator");
const {
  buildHumanCoordinatorReply,
  buildCoverageScheduleIntro,
  buildInterviewPreferenceQuestion
} = require("./conversationCopy");
const { extractInformation } = require("./informationExtractor");
const {
  resolveConversationLanguage,
  detectMessageLanguage
} = require("./conversationLanguage");

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
    return language === "es" ? "Entendido." : "Got it.";
  }

  if (extracted.occupation) {
    return language === "es"
      ? "Gracias por compartirlo."
      : "Thank you for sharing that.";
  }

  if (extracted.authorization !== undefined) {
    if (extracted.authorization === false) {
      return language === "es" ? "Entendido." : "Got it.";
    }

    return language === "es" ? "Gracias." : "Thanks.";
  }

  if (extracted.city || extracted.state) {
    return language === "es" ? "Gracias." : "Thanks.";
  }

  if (extracted.interviewType) {
    return language === "es" ? "Entendido." : "Got it.";
  }

  if (extracted.email) {
    return language === "es" ? "Gracias." : "Thanks.";
  }

  return language === "es" ? "Entendido." : "Got it.";
}

function buildQuestionForMissingField(field, profile, language, prospect) {
  const schedulingState = parseSchedulingState(prospect?.notes);

  switch (field) {
    case "city":
      return language === "es"
        ? "¿En qué ciudad y estado vives actualmente?"
        : "What city and state do you currently live in?";

    case "state":
      return language === "es"
        ? `¿En qué estado está ${profile.city}?`
        : `Which state is ${profile.city} in?`;

    case "authorization":
      return language === "es"
        ? "¿Tienes autorización legal para trabajar en los Estados Unidos?"
        : "Do you have legal authorization to work in the United States?";

    case "occupation":
      return language === "es"
        ? "¿En qué trabajas actualmente?"
        : "What do you currently do for work?";

    case "interviewType":
      return buildInterviewPreferenceQuestion(profile, language);

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

    case "email": {
      const { getEmailCollectionQuestion } = require("./teamVisionAppointmentRules");
      return getEmailCollectionQuestion(language);
    }

    default:
      return language === "es"
        ? "¿Podemos continuar con tu entrevista?"
        : "Can we continue scheduling your interview?";
  }
}

async function initializeScheduleIfNeeded(prospect, profile) {
  const interviewType = getEffectiveInterviewType(profile);

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
    currentDate: new Date()
  });

  const nextState = buildInitialSchedulingStateFromSchedule(
    schedule,
    profile.occupation,
    interviewType
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

async function completeInterview(prospect, profile, language) {
  const email = profile.email || null;

  if (!prospect.appointment_date) {
    throw new Error("Interview slot must be selected before confirming.");
  }

  const event = await createInterview({
    name: prospect.name,
    phone: prospect.phone,
    email,
    interviewType: profile.interviewType,
    startTime: prospect.appointment_date,
    location: profile.city
  });

  await updateProspect(prospect.phone, {
    notes: email ? `EMAIL:${email}` : null,
    calendar_event_id: event.id,
    current_step: "CONFIRMED",
    last_message: prospect.last_message
  });

  await onInterviewScheduled({
    phone: prospect.phone,
    prospect,
    profile,
    calendarEvent: event
  }).catch((error) => {
    console.warn("[semanticConversationEngine] interview scheduling hook failed:", error.message);
  });

  const confirmation = buildConfirmationDetails({
    interviewType: profile.interviewType,
    slotLabel: profile.preferredTime || prospect.interview_time,
    email: email || prospect.phone,
    language
  });

  const response = responseBuilder({
    tone: "celebratory",
    acknowledgement: confirmation.acknowledgement,
    transition: confirmation.transition,
    question: confirmation.question,
    typingDelay: 1500,
    responseStyle: "professional"
  });

  return response.text;
}

async function buildSemanticReply({
  prospect,
  profile,
  extracted,
  language,
  isNew,
  informationalReply
}) {
  const missing = getMissingFields(profile);
  const nextField = getNextMissingField(profile);

  if (!missing.length) {
    return completeInterview(prospect, profile, language);
  }

  if (nextField === "schedule" && getEffectiveInterviewType(profile)) {
    prospect = await initializeScheduleIfNeeded(prospect, profile);
  }

  const question = buildQuestionForMissingField(
    nextField,
    profile,
    language,
    prospect
  );

  if (informationalReply) {
    return `${informationalReply}\n\n${question}`;
  }

  if (isNew && !Object.keys(extracted).length) {
    const personality = getPersonality({
      currentStep: "NEW",
      intent: detectIntent(""),
      memory: null,
      leadStatus: "NEW",
      occupation: null,
      language,
      message: ""
    });

    const greeting = responseBuilder({
      tone: personality.tone,
      acknowledgement:
        language === "es"
          ? "Hola. Soy Atlas, tu asistente virtual de Team Vision."
          : "Hi! I'm Atlas, your virtual recruiting assistant with Team Vision.",
      transition:
        language === "es"
          ? "Te haré unas preguntas breves para agendar tu entrevista."
          : "I'll ask a few quick questions to schedule your interview.",
      question,
      typingDelay: personality.typingDelay,
      responseStyle: personality.responseStyle
    });

    return greeting.text;
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
    const autoType = getEffectiveInterviewType(profile);
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

  if (profile.email) {
    updates.notes = `EMAIL:${profile.email}`;
  }

  const schedulingState = parseSchedulingState(prospect.notes);
  updates.current_step = deriveCurrentStep(profile, schedulingState);

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
  const isNew = !prospect;

  if (isNew) {
    await createProspect(phone, name, cleanMessage);
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
  let profile = buildProfileFromProspect(prospect, channel);
  const nextField = getNextMissingField(profile);
  const inSchedule = isActiveScheduleStep(prospect);
  const extracted = extractInformation(cleanMessage, profile, {
    nextField,
    inSchedule
  });

  profile = mergeProfile(profile, {
    city: extracted.city,
    state: extracted.state,
    authorization: extracted.authorization,
    occupation: extracted.occupation,
    interviewType: extracted.interviewType,
    email: extracted.email
  });

  const rulesResult = applyBusinessRulesToProfile(profile, cleanMessage, extracted.interviewType);
  profile = rulesResult.profile;

  if (rulesResult.escalation?.needsHumanCoordinator) {
    prospect.last_message = cleanMessage;
    await syncProfileToProspect(prospect, profile, { language });
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

  if (prospect.current_step === "CONFIRMED") {
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

  const faqReply = shouldAnswerFAQ(cleanMessage)
    ? findFAQ(cleanMessage, language)
    : null;
  const route = routeConversation({
    prospect: { ...prospect, ...profileToProspectUpdates(profile) },
    message: cleanMessage,
    intent
  });
  const interruptionReply = route.interrupt ? getResponse(intent, language) : null;
  const informationalReply = faqReply || interruptionReply;

  prospect.last_message = cleanMessage;
  await syncProfileToProspect(prospect, profile, { language });
  prospect = await findProspect(phone);
  profile = buildProfileFromProspect(prospect, channel);

  const postSyncRules = applyBusinessRulesToProfile(profile, cleanMessage, extracted.interviewType);
  profile = postSyncRules.profile;

  if (postSyncRules.escalation?.needsHumanCoordinator) {
    await syncProfileToProspect(prospect, profile, { language });
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
    await syncProfileToProspect(prospect, profile, { language });
    prospect = await findProspect(phone);
    profile = buildProfileFromProspect(prospect, channel);
  }

  if (
    isActiveScheduleStep(prospect) &&
    getEffectiveInterviewType(profile) &&
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

    if (isScheduleComplete(profile) && !emailRequired(profile)) {
      const completionReply = await completeInterview(prospect, profile, language);

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: completionReply,
        intent,
        pipeline: "CONFIRMED",
        currentStep: "CONFIRMED",
        language,
        city: profile.city,
        state: profile.state
      });

      return completionReply;
    }

    if (informationalReply && prospect.current_step !== "EMAIL") {
      const nextField = getNextMissingField(buildProfileFromProspect(prospect, channel));
      const followUp = buildQuestionForMissingField(
        nextField,
        profile,
        language,
        prospect
      );
      const combined = `${informationalReply}\n\n${followUp}`;

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

  if (prospect.current_step === "EMAIL" || getNextMissingField(profile) === "email") {
    const email = extracted.email || cleanMessage.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailPattern.test(email)) {
      profile.email = email;
      await syncProfileToProspect(prospect, profile, { language });
      prospect = await findProspect(phone);
      profile = buildProfileFromProspect(prospect, channel);

      const completionReply = await completeInterview(prospect, profile, language);

      await recordLog({
        phone,
        name,
        direction: "outgoing",
        message: completionReply,
        intent,
        pipeline: "CONFIRMED",
        currentStep: "CONFIRMED",
        language,
        city: profile.city,
        state: profile.state
      });

      return completionReply;
    }
  }

  const replyText = await buildSemanticReply({
    prospect,
    profile,
    extracted,
    language,
    isNew,
    informationalReply
  });

  await syncProfileToProspect(prospect, profile, { language });
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
  buildShortAcknowledgement
};
