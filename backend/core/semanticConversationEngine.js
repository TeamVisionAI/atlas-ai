const {
  findProspect,
  createProspect,
  updateProspect
} = require("../services/supabaseService");
const crypto = require("crypto");
const { bookProductionAppointment } = require("../appointments/AppointmentEngine");
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
  buildCoverageScheduleIntro
} = require("./conversationCopy");
const { extractInformation } = require("./informationExtractor");

const CONVERSATION_GOAL = "Schedule Interview";

function atlasTrace(prefix, details = {}) {
  console.log(`[ATLAS ${prefix}]`, JSON.stringify({ ts: new Date().toISOString(), ...details }));
}

function sanitizePersistencePayload(updates) {
  const payload = { ...updates };

  if (typeof payload.notes === "string" && /^EMAIL:/i.test(payload.notes)) {
    payload.notes = "EMAIL:[redacted]";
  }

  return payload;
}

function createAtlasTrace(storageKey, message) {
  return {
    traceId: crypto.randomUUID(),
    storageKey,
    message: String(message || "").trim()
  };
}

function logStateLoaded(trace, prospect, context) {
  trace.lastKnownStep = prospect?.current_step ?? null;

  atlasTrace("STATE LOADED", {
    traceId: trace.traceId,
    storageKey: trace.storageKey,
    context,
    currentStep: prospect?.current_step ?? null,
    prospectExists: Boolean(prospect)
  });
}

async function tracedUpdateProspect(trace, phone, updates, context) {
  const fromStep = trace.lastKnownStep ?? null;
  const toStep = updates.current_step ?? null;

  if (toStep !== undefined && toStep !== null && fromStep !== toStep) {
    atlasTrace("TRANSITION", {
      traceId: trace.traceId,
      storageKey: phone,
      from: fromStep,
      to: toStep,
      context
    });
  }

  atlasTrace("PERSISTENCE", {
    traceId: trace.traceId,
    storageKey: phone,
    context,
    action: "updateProspect",
    payload: sanitizePersistencePayload(updates)
  });

  try {
    await updateProspect(phone, updates);
    const reloaded = await findProspect(phone);

    atlasTrace("PERSISTENCE", {
      traceId: trace.traceId,
      storageKey: phone,
      context,
      action: "updateProspect",
      status: "success",
      persistedCurrentStep: reloaded?.current_step ?? null
    });

    if (reloaded?.current_step) {
      trace.lastKnownStep = reloaded.current_step;
    }

    return reloaded;
  } catch (error) {
    atlasTrace("PERSISTENCE", {
      traceId: trace.traceId,
      storageKey: phone,
      context,
      action: "updateProspect",
      status: "error",
      error: error.message
    });

    throw error;
  }
}

function finishAtlasTrace(trace, response, handler) {
  atlasTrace("TRACE END", {
    traceId: trace.traceId,
    storageKey: trace.storageKey,
    handler,
    finalCurrentStep: trace.lastKnownStep ?? null,
    responsePreview: String(response || "").slice(0, 160)
  });
}

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
  if (prospect?.language === "es") {
    return "es";
  }

  const text = String(message || "").toLowerCase();
  const spanishHints = ["hola", "gracias", "si", "sí", "vivo", "trabajo", "entrevista"];

  if (spanishHints.some((hint) => text.includes(hint))) {
    return "es";
  }

  return "en";
}

function buildShortAcknowledgement(extracted, language) {
  if (!extracted || !Object.keys(extracted).length) {
    return language === "es" ? "Entendido." : "Got it.";
  }

  if (extracted.city || extracted.state) {
    return language === "es" ? "Gracias." : "Thanks.";
  }

  if (extracted.authorization !== undefined) {
    return language === "es" ? "Perfecto." : "Perfect.";
  }

  if (extracted.occupation) {
    return language === "es" ? "Excelente." : "Great.";
  }

  if (extracted.interviewType) {
    return language === "es" ? "Perfecto." : "Great.";
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
        ? "¿En qué ciudad y estado vives?"
        : "What city and state do you live in?";

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
      return getInterviewPreferenceQuestion(language);

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
      return language === "es"
        ? "¿Cuál es el mejor correo electrónico para enviarte la confirmación?"
        : "What is the best email address to send your interview confirmation?";

    default:
      return language === "es"
        ? "¿Podemos continuar con tu entrevista?"
        : "Can we continue scheduling your interview?";
  }
}

async function initializeScheduleIfNeeded(prospect, profile, trace = null) {
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

  const updates = {
    current_step: "SCHEDULE",
    appointment_type: PHASES.DAY,
    notes: mergeNotesWithSchedulingState(prospect.notes, nextState)
  };

  if (trace) {
    return tracedUpdateProspect(trace, prospect.phone, updates, "initializeScheduleIfNeeded");
  }

  await updateProspect(prospect.phone, updates);

  return findProspect(prospect.phone);
}

function hasActiveSchedulingNotes(notes) {
  return Boolean(notes && String(notes).includes("SCHEDULING:"));
}

/**
 * Temporary production recovery: restore appointment_type when SCHEDULE step
 * has active scheduling notes but appointment_type was cleared inconsistently.
 */
async function maybeSelfHealScheduleAppointmentType(prospect, trace = null) {
  if (!prospect) {
    return prospect;
  }

  if (prospect.current_step !== "SCHEDULE" || prospect.appointment_type) {
    return prospect;
  }

  if (!hasActiveSchedulingNotes(prospect.notes)) {
    return prospect;
  }

  const schedulingState = parseSchedulingState(prospect.notes);
  const phase = schedulingState?.phase;

  if (!phase) {
    return prospect;
  }

  const updates = { appointment_type: phase };

  atlasTrace("SELF HEAL", {
    traceId: trace?.traceId,
    storageKey: prospect.phone,
    action: "restore_appointment_type",
    restoredAppointmentType: phase,
    currentStep: prospect.current_step
  });

  if (trace) {
    return tracedUpdateProspect(trace, prospect.phone, updates, "selfHealScheduleAppointmentType");
  }

  await updateProspect(prospect.phone, updates);
  return findProspect(prospect.phone);
}

function isActiveScheduleStep(prospect) {
  const schedulingState = parseSchedulingState(prospect?.notes);

  return Boolean(prospect?.appointment_type && schedulingState?.phase);
}

async function handleScheduleMessage(prospect, message, language, personality, trace = null) {
  const result = handleScheduleTurn({
    prospect,
    message,
    language,
    personality
  });

  if (trace) {
    await tracedUpdateProspect(trace, prospect.phone, result.prospectUpdates, "handleScheduleMessage");
  } else {
    await updateProspect(prospect.phone, result.prospectUpdates);
  }

  return result;
}

async function completeInterview(prospect, profile, language, options = {}) {
  const result = await bookProductionAppointment({
    prospect,
    profile,
    language,
    channel: options.channel || "whatsapp",
    atlasProspectId: options.atlasProspectId || null
  });

  return result.reply;
}

async function buildSemanticReply({
  prospect,
  profile,
  extracted,
  language,
  isNew,
  informationalReply,
  channel = "whatsapp",
  trace = null
}) {
  const missing = getMissingFields(profile);
  const nextField = getNextMissingField(profile);

  if (!missing.length) {
    return completeInterview(prospect, profile, language, { channel });
  }

  if (nextField === "schedule" && getEffectiveInterviewType(profile)) {
    prospect = await initializeScheduleIfNeeded(prospect, profile, trace);
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

async function syncProfileToProspect(prospect, profile, trace = null) {
  const updates = {
    last_message: prospect.last_message
  };

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

  if (trace) {
    await tracedUpdateProspect(trace, prospect.phone, updates, "syncProfileToProspect");
    return;
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
  const trace = createAtlasTrace(phone, cleanMessage);

  atlasTrace("TRACE START", {
    traceId: trace.traceId,
    storageKey: phone,
    channel,
    message: cleanMessage
  });

  const intent = detectIntent(cleanMessage);
  let prospect = await findProspect(phone);
  const isNew = !prospect;

  logStateLoaded(trace, prospect, isNew ? "initial_findProspect:new" : "initial_findProspect");

  if (isNew) {
    atlasTrace("PERSISTENCE", {
      traceId: trace.traceId,
      storageKey: phone,
      context: "createProspect",
      action: "createProspect",
      payload: {
        name: name || "Unknown",
        lastMessagePreview: cleanMessage.slice(0, 80)
      }
    });

    try {
      await createProspect(phone, name, cleanMessage);
      prospect = await findProspect(phone);

      atlasTrace("PERSISTENCE", {
        traceId: trace.traceId,
        storageKey: phone,
        context: "createProspect",
        action: "createProspect",
        status: "success",
        persistedCurrentStep: prospect?.current_step ?? null
      });

      logStateLoaded(trace, prospect, "after_createProspect");
    } catch (error) {
      atlasTrace("PERSISTENCE", {
        traceId: trace.traceId,
        storageKey: phone,
        context: "createProspect",
        action: "createProspect",
        status: "error",
        error: error.message
      });

      throw error;
    }
  }

  prospect = await maybeSelfHealScheduleAppointmentType(prospect, trace);

  const language = detectLanguage(prospect, cleanMessage);
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

  atlasTrace("DECISION", {
    traceId: trace.traceId,
    storageKey: phone,
    intent,
    nextField,
    inSchedule,
    isNew,
    language,
    extractedFields: Object.keys(extracted || {}).filter((key) => extracted[key] !== undefined)
  });

  if (rulesResult.escalation?.needsHumanCoordinator) {
    atlasTrace("DECISION", {
      traceId: trace.traceId,
      storageKey: phone,
      handler: "humanCoordinator:preSync",
      reason: "SPECIAL_MEETING_REQUEST"
    });

    prospect.last_message = cleanMessage;
    await syncProfileToProspect(prospect, profile, trace);
    prospect = await findProspect(phone);
    logStateLoaded(trace, prospect, "after_syncProfileToProspect:preSyncEscalation");
    const coordinatorReply = buildHumanCoordinatorReply("SPECIAL_MEETING_REQUEST", language);

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

    finishAtlasTrace(trace, coordinatorReply, "humanCoordinator:preSync");
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
    atlasTrace("DECISION", {
      traceId: trace.traceId,
      storageKey: phone,
      handler: "confirmedGuard"
    });

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

    finishAtlasTrace(trace, confirmedReply, "confirmedGuard");
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

  atlasTrace("DECISION", {
    traceId: trace.traceId,
    storageKey: phone,
    handler: "routeConversation",
    routeInterrupt: Boolean(route.interrupt),
    hasFaqReply: Boolean(faqReply),
    hasInformationalReply: Boolean(informationalReply)
  });

  prospect.last_message = cleanMessage;
  await syncProfileToProspect(prospect, profile, trace);
  prospect = await findProspect(phone);
  logStateLoaded(trace, prospect, "after_syncProfileToProspect:main");
  profile = buildProfileFromProspect(prospect, channel);

  const postSyncRules = applyBusinessRulesToProfile(profile, cleanMessage, extracted.interviewType);
  profile = postSyncRules.profile;

  if (postSyncRules.escalation?.needsHumanCoordinator) {
    atlasTrace("DECISION", {
      traceId: trace.traceId,
      storageKey: phone,
      handler: "humanCoordinator:postSync",
      reason: "SPECIAL_MEETING_REQUEST"
    });

    await syncProfileToProspect(prospect, profile, trace);
    prospect = await findProspect(phone);
    logStateLoaded(trace, prospect, "after_syncProfileToProspect:postSyncEscalation");
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

    finishAtlasTrace(trace, coordinatorReply, "humanCoordinator:postSync");
    return coordinatorReply;
  }

  if (postSyncRules.profile.interviewType !== prospect.interview_type) {
    atlasTrace("DECISION", {
      traceId: trace.traceId,
      storageKey: phone,
      handler: "interviewTypeResync",
      interviewType: postSyncRules.profile.interviewType
    });

    await syncProfileToProspect(prospect, profile, trace);
    prospect = await findProspect(phone);
    logStateLoaded(trace, prospect, "after_syncProfileToProspect:interviewTypeResync");
    profile = buildProfileFromProspect(prospect, channel);
  }

  if (
    isActiveScheduleStep(prospect) &&
    getEffectiveInterviewType(profile) &&
    !isScheduleComplete(profile)
  ) {
    atlasTrace("DECISION", {
      traceId: trace.traceId,
      storageKey: phone,
      handler: "handleScheduleMessage"
    });

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
      personality,
      trace
    );
    const scheduleReply = scheduleResult.replyText;

    if (scheduleResult.humanHandoff) {
      atlasTrace("DECISION", {
        traceId: trace.traceId,
        storageKey: phone,
        handler: "humanCoordinator:scheduleHandoff",
        reason: scheduleResult.handoffReason || "OUTSIDE_SCHEDULING_WINDOW"
      });

      const coordinatorReply = buildHumanCoordinatorReply(
        scheduleResult.handoffReason || "OUTSIDE_SCHEDULING_WINDOW",
        language
      );

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

      finishAtlasTrace(trace, coordinatorReply, "humanCoordinator:scheduleHandoff");
      return coordinatorReply;
    }

    prospect = await findProspect(phone);
    logStateLoaded(trace, prospect, "after_handleScheduleMessage");
    profile = buildProfileFromProspect(prospect, channel);

    if (isScheduleComplete(profile) && !emailRequired(profile)) {
      atlasTrace("DECISION", {
        traceId: trace.traceId,
        storageKey: phone,
        handler: "completeInterview:scheduleComplete"
      });

      const completionReply = await completeInterview(prospect, profile, language, { channel });

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

      finishAtlasTrace(trace, completionReply, "completeInterview:scheduleComplete");
      return completionReply;
    }

    if (informationalReply && prospect.current_step !== "EMAIL") {
      atlasTrace("DECISION", {
        traceId: trace.traceId,
        storageKey: phone,
        handler: "scheduleInformationalCombined"
      });

      const nextFieldAfterSchedule = getNextMissingField(buildProfileFromProspect(prospect, channel));
      const followUp = buildQuestionForMissingField(
        nextFieldAfterSchedule,
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

      finishAtlasTrace(trace, combined, "scheduleInformationalCombined");
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

    finishAtlasTrace(trace, scheduleReply, "handleScheduleMessage");
    return scheduleReply;
  }

  if (prospect.current_step === "EMAIL" || getNextMissingField(profile) === "email") {
    atlasTrace("DECISION", {
      traceId: trace.traceId,
      storageKey: phone,
      handler: "emailCapture",
      currentStep: prospect.current_step,
      nextField: getNextMissingField(profile)
    });

    const email = extracted.email || cleanMessage.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailPattern.test(email)) {
      profile.email = email;
      await syncProfileToProspect(prospect, profile, trace);
      prospect = await findProspect(phone);
      logStateLoaded(trace, prospect, "after_syncProfileToProspect:emailCapture");
      profile = buildProfileFromProspect(prospect, channel);

      atlasTrace("DECISION", {
        traceId: trace.traceId,
        storageKey: phone,
        handler: "completeInterview:emailCapture"
      });

      const completionReply = await completeInterview(prospect, profile, language, { channel });

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

      finishAtlasTrace(trace, completionReply, "completeInterview:emailCapture");
      return completionReply;
    }
  }

  atlasTrace("DECISION", {
    traceId: trace.traceId,
    storageKey: phone,
    handler: "buildSemanticReply"
  });

  const replyText = await buildSemanticReply({
    prospect,
    profile,
    extracted,
    language,
    isNew,
    informationalReply,
    channel,
    trace
  });

  await syncProfileToProspect(prospect, profile, trace);
  prospect = await findProspect(phone);
  logStateLoaded(trace, prospect, "after_syncProfileToProspect:final");

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

  finishAtlasTrace(trace, replyText, "buildSemanticReply");
  return replyText;
}

module.exports = {
  CONVERSATION_GOAL,
  detectLanguage,
  handleSemanticMessage,
  buildQuestionForMissingField,
  buildShortAcknowledgement
};
