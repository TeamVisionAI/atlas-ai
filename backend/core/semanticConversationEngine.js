const supabaseService = require("../services/supabaseService");
const {
  findProspectInOrganization,
  updateProspectInOrganization
} = supabaseService;
const { requireTenantOrganizationId } = require("./tenantProspectLookup");
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
  getDayPartClarificationQuestion,
  getNameQuestion,
  getEmailCollectionQuestion,
  getHandoffMessage,
  getCanonicalFaqAnswer
} = require("./teamVisionWorkflowCopy");
const {
  composeAnswerThenOneQuestion,
  resolveRecruitFaqAnswer
} = require("./recruitConversationSequencing");
const { evaluateCoverage } = require("./businessRulesEngine");
const { coverageInputFromProfile } = require("./recruitingCoverage");
const {
  extractInformation,
  detectLocalZoomPreference,
  isAuthorizationAmbiguous,
  isEmailDeclined,
  inferStateFromCity
} = require("./informationExtractor");
const {
  resolveConversationLanguage,
  detectMessageLanguage
} = require("./conversationLanguage");
const { resolveConversationSchedulePayload } = require("./conversationScheduleDelegation");
const missionExecutionApplicationService = require("../application/missionExecutionApplicationService");
const capacityEngine = require("./capacityEngine");
const autonomousScheduleAgentResolver = require("./autonomousScheduleAgentResolver");
const workflowStateStore = require("./workflowStateStore");
const { OWNERSHIP, MILESTONES } = require("./workflowConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const {
  buildPersistedAppointmentConfirmation
} = require("./appointmentConfirmationCopy");

const CONVERSATION_GOAL = "Schedule Interview";

async function loadProspectInOrganization(phone, organizationId) {
  if (!phone || !organizationId) {
    return null;
  }

  return findProspectInOrganization(phone, organizationId);
}

async function reloadProspectInOrganization(phone, organizationId, fallback = null) {
  const reloaded = await loadProspectInOrganization(phone, organizationId);
  return reloaded || fallback;
}

async function scopedUpdateProspect(phone, organizationId, patch) {
  const scopedOrganizationId = requireTenantOrganizationId(organizationId);
  return updateProspectInOrganization(phone, scopedOrganizationId, patch);
}

function resolveOperationalOrganizationId(prospect, organizationId) {
  return prospect?.organization_id || organizationId || null;
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
  if (isLikelyQuestion(message)) {
    return true;
  }
  // Implements BR-131 CE parity — objections / experience without "?" still answer-first.
  return Boolean(resolveRecruitFaqAnswer(message, "en"));
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
  // Implements BR-131 — CE FAQ content parity with V2 answer-first routing.
  const shared = resolveRecruitFaqAnswer(message, language);
  if (shared) {
    return shared;
  }

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

function buildInformationalWorkflowReply(
  informationalReply,
  nextField,
  profile,
  language,
  prospect
) {
  // Implements BR-131 — answer first, then exactly one next-needed question.
  // Never re-ask city/state/auth when already present on the profile.
  let field = nextField;
  if (field === "city" && profile?.city) {
    field = profile.state ? "authorization" : "state";
  }
  if (field === "state" && profile?.state) {
    field =
      profile.authorization === true || profile.authorization === false
        ? profile.dayPart
          ? "schedule"
          : "dayPart"
        : "authorization";
  }
  if (
    field === "authorization" &&
    (profile?.authorization === true || profile?.authorization === false)
  ) {
    field = profile.dayPart ? "schedule" : "dayPart";
  }
  if (field === "dayPart" && profile?.dayPart) {
    field = "schedule";
  }
  // Do not enter full schedule menus from an FAQ resume until pre-schedule complete.
  if (field === "schedule" && !canBeginScheduling(profile, { notes: prospect?.notes })) {
    field = getNextMissingField(profile, {
      notes: prospect?.notes,
      captureState: parseQualificationCapture(prospect?.notes)
    });
  }
  if (field === "schedule") {
    // Soft continuation only — avoid dumping day menus from FAQ turns.
    const soft =
      language === "es"
        ? "¿Prefieres en la mañana o en la tarde?"
        : "Do you prefer morning or afternoon?";
    if (!profile?.dayPart) {
      return composeAnswerThenOneQuestion(informationalReply, soft);
    }
  }

  const question = buildQuestionForMissingField(
    field,
    profile,
    language,
    prospect
  );
  return composeAnswerThenOneQuestion(informationalReply, question);
}

function buildInterviewFormatQuestion(profile, language, prospect) {
  const coverage = evaluateCoverage(coverageInputFromProfile(profile, prospect || {}));

  if (coverage.coverage === "LOCAL") {
    return getLocalOfficeDayPartMessage(language, {
      organizationId: prospect?.organization_id || prospect?.organizationId || null,
      officeAddress: prospect?.officeAddress || null,
      officeAddressSource: prospect?.officeAddressSource || null
    });
  }

  return getRemoteZoomDayPartMessage(language);
}

function buildQuestionForMissingField(field, profile, language, prospect) {
  const schedulingState = parseSchedulingState(prospect?.notes);

  switch (field) {
    case "city":
      return getFirstMessage(language);

    case "state":
      return getStateQuestion(profile.city, language, {
        proposedState: inferStateFromCity(profile.city)
      });

    case "authorization":
      return getAuthorizationQuestion(language);

    case "interviewType":
      return buildInterviewFormatQuestion(profile, language, prospect);

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

async function initializeScheduleIfNeeded(prospect, profile, organizationId) {
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

  await scopedUpdateProspect(prospect.phone, organizationId, {
    current_step: "SCHEDULE",
    appointment_type: PHASES.DAY,
    notes: mergeNotesWithSchedulingState(prospect.notes, nextState)
  });

  return reloadProspectInOrganization(prospect.phone, organizationId, prospect);
}

function isActiveScheduleStep(prospect) {
  const schedulingState = parseSchedulingState(prospect?.notes);

  return Boolean(prospect?.appointment_type && schedulingState?.phase);
}

async function handleScheduleMessage(prospect, message, language, personality, organizationId) {
  const result = handleScheduleTurn({
    prospect,
    message,
    language,
    personality
  });

  await scopedUpdateProspect(prospect.phone, organizationId, result.prospectUpdates);

  return result;
}

async function markAutonomousScheduleHumanAssist(prospect, organizationId, reason, details = {}) {
  // Implements Conversations Center handoff — persist NEEDS_ATTENTION + reason.
  await workflowStateStore.savePersistedWorkflowState(
    prospect.phone,
    {
      canonicalMilestone: MILESTONES.INTERVIEW_READY,
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: true,
      manualAgentOwnership: true,
      doNotContact: false,
      handoffReason: reason || "scheduling_issue",
      handoffAt: new Date().toISOString()
    },
    {
      organizationId: organizationId || prospect.organization_id || null,
      prospectId: prospect.id || null
    }
  );

  logWhatsAppStage("autonomous_schedule_human_assist", {
    level: "warn",
    phone: prospect.phone,
    organizationId,
    reason,
    ...details
  });
}

async function completeInterview(prospect, profile, language, options = {}) {
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

  const organizationId = resolveOperationalOrganizationId(
    prospect,
    options.organizationId || null
  );

  if (!organizationId) {
    const {
      resolveTeamMemberPhrase,
      capitalizePhrase
    } = require("./recruitAiV2/tenantBranding");
    const TeamMemberPhrase = capitalizePhrase(
      resolveTeamMemberPhrase({
        organizationId: null,
        language: language === "es" ? "spanish" : "english"
      })
    );
    return {
      success: false,
      reply:
        language === "es"
          ? `No pudimos confirmar tu entrevista en este momento. ${TeamMemberPhrase} te ayudará pronto.`
          : `We couldn't confirm your interview right now. ${TeamMemberPhrase} will help you shortly.`,
      humanAssist: true,
      reason: "TENANT_ORGANIZATION_REQUIRED"
    };
  }

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

  // BR-114 cohort + BR-111: speak-only canary must not CE-create before capacity/Calendar mutation.
  const {
    evaluateLegacyCeAppointmentMutation,
    buildDeferredMutationDeniedReply,
    DENY_REASON: CE_MUTATION_DENIED,
    DENY_STAGE: CE_MUTATION_DENIED_STAGE
  } = require("./recruitAiV2/legacyCeAppointmentMutationGate");
  const emitStageEarly = options.logStage || logWhatsAppStage;
  const actingUserIdForGate = prospect.owner_user_id || agentId;
  let v2Grant = options.v2Grant || null;
  if (!v2Grant) {
    try {
      const {
        loadRecruitAiV2EligibilityGrant
      } = require("../services/recruitAiV2CertificationService");
      v2Grant = await loadRecruitAiV2EligibilityGrant({
        organizationId,
        userId: actingUserIdForGate
      });
    } catch {
      const { emptyGrant } = require("./recruitAiV2/v2CertificationGrants");
      v2Grant = emptyGrant();
    }
  }
  const mutationGate = evaluateLegacyCeAppointmentMutation({
    organizationId,
    actingUserId: actingUserIdForGate,
    env: options.env || process.env,
    grant: v2Grant
  });
  if (!mutationGate.allowed) {
    emitStageEarly(CE_MUTATION_DENIED_STAGE, {
      phone: prospect.phone,
      organizationId,
      agentId,
      reason: mutationGate.reason || CE_MUTATION_DENIED,
      executionDenyReason: mutationGate.executionDenyReason || null
    });
    return {
      success: false,
      reply: buildDeferredMutationDeniedReply(language),
      humanAssist: true,
      reason: mutationGate.reason || CE_MUTATION_DENIED
    };
  }

  // Conversation scheduling already reserved capacity with interview-type key; release before canonical booking.
  capacityEngine.releaseSlotByIso(
    prospect.appointment_date,
    profile.interviewType || prospect.interview_type || schedulePayload.interviewType
  );

  // Stamp ownership for autonomous WhatsApp leads so appointments and UI stay tenant-scoped.
  if (!prospect.owner_user_id) {
    await updateProspectInOrganization(prospect.phone, organizationId, {
      owner_user_id: agentId
    }).catch((error) => {
      logWhatsAppStage("autonomous_schedule_owner_stamp_failed", {
        level: "warn",
        error: error.message,
        phone: prospect.phone
      });
    });
    prospect = { ...prospect, owner_user_id: agentId };
  }

  let scheduleResult;
  let usedV2Execution = false;
  let liveAttempt = null;
  // BR-113 — telemetry attribution only (does not change booking behavior).
  const emitStage = options.logStage || logWhatsAppStage;
  const attribution = require("./recruitAiV2/liveExecutionAttribution");
  let v2Attempted = false;
  let v2PriorReason = null;
  let v2Authorized = null;

  // Implements BR-112 — live CE may ask v2 to execute; BR-111 remains final authority.
  // Shadow/advisory never enter this bridge. No v2 WhatsApp send path.
  try {
    const {
      attemptLiveV2AppointmentExecution
    } = require("./recruitAiV2/liveExecutionBridge");

    liveAttempt = await attemptLiveV2AppointmentExecution({
      prospect,
      profile,
      schedulePayload,
      organizationId,
      agentId,
      language,
      messageText: options.messageText || "si",
      inboundMessageId: options.inboundMessageId || null,
      env: options.env || process.env,
      dependencies: options.dependencies || {},
      processTurn: options.processTurn
    });

    if (liveAttempt.usedV2Execution && liveAttempt.scheduleResult) {
      scheduleResult = liveAttempt.scheduleResult;
      usedV2Execution = true;
      v2Attempted = true;
      emitStage(
        attribution.STAGES.USED,
        attribution.buildUsedDetails({
          phone: prospect.phone,
          organizationId,
          agentId,
          appointmentId: scheduleResult.appointmentId || null,
          idempotent: Boolean(liveAttempt.v2Result?.execution?.idempotent)
        })
      );
    } else if (liveAttempt.invoked) {
      v2Attempted = true;
      v2PriorReason = liveAttempt.reason || null;
      v2Authorized = Boolean(liveAttempt.v2Result?.authorization?.authorized);
      emitStage(
        attribution.STAGES.NOT_USED,
        attribution.buildNotUsedDetails({
          phone: prospect.phone,
          organizationId,
          agentId,
          reason: v2PriorReason,
          authorized: v2Authorized
        })
      );
    } else {
      // Live path disabled / not eligible — explicit NOT_ATTEMPTED (BR-113).
      emitStage(
        attribution.STAGES.NOT_ATTEMPTED,
        attribution.buildNotAttemptedDetails({
          phone: prospect.phone,
          organizationId,
          agentId,
          reason: liveAttempt.reason || "LIVE_PATH_DISABLED"
        })
      );
    }
  } catch (liveBridgeError) {
    v2Attempted = true;
    v2PriorReason = "BRIDGE_FAILED";
    v2Authorized = false;
    emitStage(attribution.STAGES.BRIDGE_FAILED, {
      level: "warn",
      phone: prospect.phone,
      organizationId,
      error: liveBridgeError.message
    });
  }

  if (!usedV2Execution) {
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

      // BR-113 — only after legacy CE booking path actually executed, and only
      // when a v2 attempt was made but did not perform the appointment.
      if (v2Attempted) {
        emitStage(
          attribution.STAGES.LEGACY_FALLBACK,
          attribution.buildLegacyFallbackDetails({
            phone: prospect.phone,
            organizationId,
            agentId,
            priorReason: v2PriorReason,
            authorized: v2Authorized,
            appointmentId: scheduleResult?.appointmentId || null,
            legacySuccess: Boolean(scheduleResult?.success)
          })
        );
      }
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

  // Implements BR-039/BR-041 — one confirmation from persisted appointment + preferred language.
  // After V2 execution success, V2 appointment_confirmed is authoritative (no competing CE copy).
  if (usedV2Execution) {
    const v2Confirmation =
      String(liveAttempt?.confirmationReplyText || liveAttempt?.v2Result?.rendered?.text || "").trim() ||
      null;
    if (v2Confirmation) {
      await scheduleZoomLinkDelivery({
        prospect,
        profile,
        appointmentDate: scheduleResult.booking?.startTimeISO || prospect.appointment_date
      }).catch((error) => {
        console.warn("[semanticConversationEngine] zoom link scheduling failed:", error.message);
      });

      return {
        success: true,
        reply: v2Confirmation,
        appointmentId: scheduleResult.appointmentId || null,
        agentId,
        agentSource: resolvedAgent.source,
        confirmationIdempotencyKey: `v2:${scheduleResult.appointmentId}`,
        confirmationAppointment: scheduleResult.appointment || { id: scheduleResult.appointmentId },
        outboundIntent: "APPOINTMENT_CONFIRMATION",
        confirmationSource: "recruit_ai_v2_appointment_confirmed"
      };
    }
  }

  const confirmationAppointment =
    scheduleResult.appointment || {
      id: scheduleResult.appointmentId,
      startDateTime: scheduleResult.booking?.startTimeISO || null,
      timezone: scheduleResult.appointment?.timezone || "America/New_York",
      meetingType: scheduleResult.appointment?.meetingType || profile.interviewType,
      meetingAddress: scheduleResult.appointment?.meetingAddress || null,
      virtualMeetingUrl:
        scheduleResult.appointment?.virtualMeetingUrl ||
        scheduleResult.meetingUrl ||
        null
    };

  const confirmation = buildPersistedAppointmentConfirmation(
    confirmationAppointment,
    prospect
  );

  await scheduleZoomLinkDelivery({
    prospect,
    profile,
    appointmentDate: scheduleResult.booking?.startTimeISO || prospect.appointment_date
  }).catch((error) => {
    console.warn("[semanticConversationEngine] zoom link scheduling failed:", error.message);
  });

  return {
    success: true,
    reply: confirmation.text,
    appointmentId: scheduleResult.appointmentId || null,
    agentId,
    agentSource: resolvedAgent.source,
    confirmationIdempotencyKey: confirmation.idempotencyKey,
    confirmationAppointment,
    outboundIntent: "APPOINTMENT_CONFIRMATION"
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
  localZoomSwitch = false,
  dayPartMiss = false,
  organizationId = null
}) {
  const captureState = parseQualificationCapture(prospect?.notes);
  const brainOptions = { notes: prospect?.notes, captureState };
  const missing = getMissingFields(profile, brainOptions);
  const nextField = getNextMissingField(profile, brainOptions);

  if (!missing.length) {
    const completion = await completeInterview(prospect, profile, language, {
      organizationId
    });
    return completion.reply;
  }

  if (nextField === "schedule" && canBeginScheduling(profile, brainOptions)) {
    prospect = await initializeScheduleIfNeeded(prospect, profile, organizationId);
  }

  let question = buildQuestionForMissingField(nextField, profile, language, prospect);

  // BR-082: unrecognized day-part fragment → alternate clarification, not identical loop.
  if (nextField === "dayPart" && dayPartMiss && !extracted?.dayPart) {
    const attempts = Number(captureState.dayPartClarifyAttempts || 0);
    question = getDayPartClarificationQuestion(language, attempts);
  }

  if (
    nextField === "dayPart" &&
    !dayPartMiss &&
    captureState.interviewType &&
    (extracted.authorization !== undefined || extracted.interviewType)
  ) {
    question = buildInterviewFormatQuestion(profile, language, prospect);
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
    const {
      resolvePersistedLanguageUpdate,
      hasAuthoritativePreferredLanguage
    } = require("./prospectLanguage");

    // Strong conversation language may sync preferred_language when not human-authoritative.
    const languagePatch = resolvePersistedLanguageUpdate(prospect, options.language, {
      message: options.message || prospect.last_message || null,
      requireStrongSignal: true
    });
    if (languagePatch) {
      Object.assign(updates, languagePatch);
    } else if (hasAuthoritativePreferredLanguage(prospect)) {
      // Keep preferred sticky; still mirror pipeline codes for CE continuity.
      updates.language = options.language;
      updates.communication_language = options.language;
    } else {
      updates.language = options.language;
      updates.communication_language = options.language;
    }
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

  if (!options.organizationId) {
    return;
  }

  await scopedUpdateProspect(prospect.phone, options.organizationId, updates);

  try {
    const {
      persistInterviewReadyIfQualificationComplete
    } = require("./recruitAiV2/qualificationFactSync");
    const refreshed = { ...prospect, ...updates };
    await persistInterviewReadyIfQualificationComplete(refreshed, {
      allowWorkflowPersist: true
    });
  } catch {
    // Qualification milestone persist must never break the conversation turn.
  }
}

async function handleSemanticMessage({
  phone,
  name,
  message,
  channel = "whatsapp",
  skipConversationLogging = false,
  messageType = null,
  organizationId = null
}) {
  const recordLog = skipConversationLogging
    ? async () => ({ success: true, skipped: true })
    : logConversation;

  const cleanMessage = String(message || "").trim();

  let scopedOrganizationId = null;
  try {
    scopedOrganizationId = requireTenantOrganizationId(organizationId);
  } catch {
    return "";
  }

  // BR-140 / BR-118 — never interpret non-text media placeholders as qualification text.
  try {
    const { classifyInboundMedia } = require("./recruitAiV2/nonTextMedia");
    const mediaClass = classifyInboundMedia({
      text: cleanMessage,
      messageType
    });
    if (mediaClass.isNonTextMedia) {
      return "";
    }
  } catch {
    // Classification must never crash CE; fall through only if helper is unavailable.
  }

  const intent = detectIntent(cleanMessage);
  let prospect = await loadProspectInOrganization(phone, scopedOrganizationId);

  if (!prospect) {
    return "";
  }

  if (!hasQualificationCaptureMarker(prospect.notes)) {
    await scopedUpdateProspect(phone, scopedOrganizationId, {
      notes: mergeNotesWithQualificationCapture(prospect.notes, defaultCaptureState())
    });
    prospect =
      (await reloadProspectInOrganization(phone, scopedOrganizationId, prospect)) || prospect;
  }

  const activeLanguage = resolveConversationLanguage(prospect, cleanMessage);

  if (detectMessageLanguage(cleanMessage)) {
    await scopedUpdateProspect(prospect.phone, scopedOrganizationId, {
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

  // BR-082: track day-part clarification attempts; reset on success.
  if (nextField === "dayPart") {
    if (extracted.dayPart) {
      captureState.dayPartClarifyAttempts = 0;
    } else {
      captureState.dayPartClarifyAttempts =
        Number(captureState.dayPartClarifyAttempts || 0) + 1;
    }
  }

  if (extracted.emailSkipped) {
    captureState.email = true;
  }

  if (extracted.authorizationAmbiguous) {
    await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });
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
    await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });
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

  const localCoverage = evaluateCoverage(coverageInputFromProfile(profile, prospect));
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
    await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });
    const coordinatorReply = buildHumanCoordinatorReply("SPECIAL_MEETING_REQUEST", language, {
      organizationId: scopedOrganizationId
    });

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
    // Implements BR-125 — never own post-create with CE "already confirmed" stub
    // when an Atlas appointment exists; V2 appointment_confirmed is authoritative.
    let confirmedReply = null;
    try {
      const {
        findActiveAppointmentForProspect
      } = require("./activeAppointmentResolver");
      const {
        resolvePostCreateOwnership,
        persistOwnedConfirmedContext,
        appointmentLocalSlot
      } = require("./recruitAiV2/postCreateOwnership");
      const orgId = scopedOrganizationId;
      const active = await findActiveAppointmentForProspect(phone, orgId);
      const slot = appointmentLocalSlot(
        active || {},
        active?.timezone || "America/New_York"
      );
      const ownership = await resolvePostCreateOwnership({
        findActiveAppointment: async () => active,
        prospectPhone: phone,
        organizationId: orgId,
        prospectId: active?.prospect_id || prospect.id || null,
        agentId: prospect.owner_user_id || active?.interviewer_user_id || null,
        proposedDate: slot.dateKey,
        proposedTime: slot.timeKey,
        timezone: active?.timezone || "America/New_York",
        language: language === "es" ? "spanish" : "english"
      });
      if (ownership.owned && ownership.replyText) {
        confirmedReply = ownership.replyText;
        await persistOwnedConfirmedContext({
          ownership,
          organizationId: orgId,
          prospectId: active?.prospect_id || prospect.id || null,
          prospectPhone: phone,
          legacyProspectId: prospect.id || null
        });
      }
    } catch {
      confirmedReply = null;
    }

    if (!confirmedReply) {
      const {
        resolveTeamMemberPhrase,
        capitalizePhrase
      } = require("./recruitAiV2/tenantBranding");
      const TeamMemberPhrase = capitalizePhrase(
        resolveTeamMemberPhrase({
          organizationId: scopedOrganizationId,
          language: language === "es" ? "spanish" : "english"
        })
      );
      confirmedReply =
        language === "es"
          ? `✅ Tu entrevista ya está confirmada. ${TeamMemberPhrase} se comunicará contigo si es necesario realizar algún ajuste.`
          : `✅ Your interview is already confirmed. ${TeamMemberPhrase} will contact you if any adjustment is needed.`;
    }

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
  await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });
  prospect = await reloadProspectInOrganization(phone, scopedOrganizationId, prospect);
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
    await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });
    const coordinatorReply = buildHumanCoordinatorReply("SPECIAL_MEETING_REQUEST", language, {
      organizationId: scopedOrganizationId
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

  if (postSyncRules.profile.interviewType !== prospect.interview_type) {
    await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });
    prospect = await reloadProspectInOrganization(phone, scopedOrganizationId, prospect);
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
      personality,
      scopedOrganizationId
    );
    const scheduleReply = scheduleResult.replyText;

    if (scheduleResult.humanHandoff) {
      const coordinatorReply = buildHumanCoordinatorReply(
        scheduleResult.handoffReason || "OUTSIDE_SCHEDULING_WINDOW",
        language,
        { organizationId: scopedOrganizationId }
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

    prospect = await reloadProspectInOrganization(phone, scopedOrganizationId, prospect);
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
        localZoomSwitch: false,
        organizationId: scopedOrganizationId
      });

      await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });

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
      const completion = await completeInterview(prospect, profile, language, {
        messageText: cleanMessage,
        organizationId: scopedOrganizationId
      });

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
      await scopedUpdateProspect(prospect.phone, scopedOrganizationId, {
        notes: mergeNotesWithQualificationCapture(prospect.notes, captureState)
      });
      prospect = await reloadProspectInOrganization(phone, scopedOrganizationId, prospect);
      profile = buildProfileFromProspect(prospect, channel);

      const completion = await completeInterview(prospect, profile, language, {
        messageText: cleanMessage,
        organizationId: scopedOrganizationId
      });

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
      await scopedUpdateProspect(prospect.phone, scopedOrganizationId, {
        notes: mergeNotesWithQualificationCapture(prospect.notes, captureState)
      });
      prospect = await reloadProspectInOrganization(phone, scopedOrganizationId, prospect);
      profile = buildProfileFromProspect(prospect, channel);

      const completion = await completeInterview(prospect, profile, language, {
        messageText: cleanMessage,
        organizationId: scopedOrganizationId
      });

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
      localZoomSwitch,
      organizationId: scopedOrganizationId
    });

    await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });

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

  const dayPartMiss =
    nextField === "dayPart" && !extracted.dayPart && Boolean(cleanMessage);

  const replyText = await buildSemanticReply({
    prospect,
    profile,
    extracted,
    language,
    isNew: false,
    informationalReply,
    localZoomSwitch,
    dayPartMiss,
    organizationId: scopedOrganizationId
  });

  await syncProfileToProspect(prospect, profile, { language, captureState, message: cleanMessage, organizationId: scopedOrganizationId });
  prospect = await reloadProspectInOrganization(phone, scopedOrganizationId, prospect);

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

  await onConversationProgress({
    phone,
    organizationId: scopedOrganizationId
  }).catch((error) => {
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
