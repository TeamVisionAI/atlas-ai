/**
 * Recruit AI v2 — turn orchestrator.
 *
 * incoming message
 *   → canonical conversation context
 *   → structured interpretation
 *   → business decision
 *   → response plan
 *   → rendered copy
 *   → side-effect proposal
 *   → policy/authorization gate (BR-111; fail-closed)
 *   → optional execution via sideEffectExecutor → canonical services
 *   → durable context persistence (context write only unless execution authorized)
 *
 * Implements BR-081 / BR-049 / BR-111: decide and plan; mutate only via
 * canonical domain services after exact org+user authorization.
 *
 * Shadow / advisory callers must NOT set options.allowExecution.
 */

const { loadConversationContext } = require("./contextLoader");
const { interpretInboundMessage } = require("./interpreter");
const { decideConversationTurn, decideSafeFailure } = require("./decisionEngine");
const { buildResponsePlan } = require("./responsePlan");
const { renderCustomerReply } = require("./responseRenderer");
const {
  authorizeSideEffects,
  resolveActingUserId
} = require("./sideEffectAuthorizer");
const { executeAuthorizedSideEffects } = require("./sideEffectExecutor");
const { containsInternalDiagnostics } = require("./sanitize");
const { buildNextContextFromInterpretation } = require("./contextTurnUpdate");
const {
  resolveAvailabilityForTurn,
  resolveAvailabilityForTurnSync
} = require("./schedulingAvailabilityReader");
const { APPOINTMENT_STATUS, STAGES, mergeConversationContext } = require("./conversationContext");
const {
  classifyInboundMedia,
  buildNonTextMediaInterpretation,
  decideNonTextMediaTurn
} = require("./nonTextMedia");
const { INTENTS, NEXT_ACTIONS, REASON_CODES } = require("./constants");
const { observeSemanticInterpretation } = require("./semantic");

/**
 * BR-118 — short-circuit non-text media before text interpretation.
 * Preserves dialogue/scheduling state; soft-acks only.
 */
async function processNonTextMediaTurn({
  message,
  loaded,
  media,
  options = {},
  persistenceService = null,
  persistenceSource = "provided",
  organizationId = null,
  prospectId = null,
  channel = "whatsapp",
  inboundMessageId = null
} = {}) {
  const interpretation = buildNonTextMediaInterpretation({
    context: loaded,
    media,
    message,
    options
  });
  let structuredDecision = decideNonTextMediaTurn({
    context: loaded,
    interpretation,
    media
  });
  let responsePlan = buildResponsePlan(structuredDecision);
  let rendered = renderCustomerReply(responsePlan);

  if (containsInternalDiagnostics(rendered.text)) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: "renderer_diagnostic_blocked"
    });
    responsePlan = buildResponsePlan(structuredDecision);
    rendered = renderCustomerReply(responsePlan);
  }

  const actingUserId = resolveActingUserId({ context: loaded, options });
  const profileConfigured = await resolveProfileConfigured({
    actingUserId,
    options
  });

  const authorization = authorizeSideEffects({
    structuredDecision,
    responsePlan,
    context: loaded,
    env: options.env || process.env,
    profileConfigured,
    actingUserId,
    organizationId: organizationId || loaded.organizationId,
    options
  });

  // Preserve dialogue meta exactly — do not overwrite lastOfferMade / intent / clarification.
  let nextContext = mergeConversationContext(loaded, {});
  nextContext.conversation = {
    ...nextContext.conversation,
    lastQuestionAsked: loaded.conversation?.lastQuestionAsked ?? null,
    lastOfferMade: loaded.conversation?.lastOfferMade ?? null,
    lastProspectIntent: loaded.conversation?.lastProspectIntent ?? null,
    pendingClarification: loaded.conversation?.pendingClarification ?? null,
    clarificationCount: loaded.conversation?.clarificationCount ?? 0,
    lastClarificationTemplateKey:
      loaded.conversation?.lastClarificationTemplateKey ?? null
  };
  nextContext.appointment = {
    ...(loaded.appointment || {}),
    ...(nextContext.appointment || {})
  };

  let persistenceResult = null;
  if (
    persistenceService &&
    organizationId &&
    prospectId &&
    options.persistContext !== false
  ) {
    // Implements BR-120 — dual-load / core-keyed create via phone + legacy fallback.
    persistenceResult = await persistenceService.compareAndSaveContext({
      organizationId,
      prospectId,
      channel,
      expectedVersion: loaded._persistence?.contextVersion,
      nextContext,
      inboundMessageId,
      decisionCode: structuredDecision.decision?.nextAction || null,
      prospectClosed: Boolean(options.prospectClosed),
      prospectPhone: options.prospectPhone || loaded.prospectPhone || null,
      legacyProspectId: options.legacyProspectId || null,
      ensureCore: options.ensureCoreIdentity !== false
    });
    if (persistenceResult?.context) {
      nextContext = persistenceResult.context;
    }
  }

  return {
    context: loaded,
    nextContext,
    interpretation,
    structuredDecision,
    responsePlan,
    rendered,
    authorization,
    persistence: {
      attempted: Boolean(persistenceService && options.persistContext !== false),
      source: persistenceSource,
      result: persistenceResult
        ? {
            ok: persistenceResult.ok,
            idempotent: Boolean(persistenceResult.idempotent),
            code: persistenceResult.code || null,
            contextVersion:
              persistenceResult.context?._persistence?.contextVersion || null
          }
        : null
    },
    execution: {
      attempted: false,
      performed: [],
      failed: [],
      skipped: [],
      success: false,
      idempotent: false,
      appointmentId: null,
      scheduleResult: null
    },
    audit: {
      at: new Date().toISOString(),
      intent: INTENTS.NON_TEXT_MEDIA,
      proposedAction: structuredDecision.decision.nextAction,
      nextAction: structuredDecision.decision.nextAction,
      reasonCodes: structuredDecision.reasonCodes,
      mayCreateAppointment: false,
      executionAuthorized: false,
      actionPerformed: [],
      sideEffectsAuthorized: false,
      contextPersisted: Boolean(persistenceResult?.ok)
    }
  };
}

function processNonTextMediaTurnSync({ message, loaded, media, options = {} } = {}) {
  const interpretation = buildNonTextMediaInterpretation({
    context: loaded,
    media,
    message,
    options
  });
  let structuredDecision = decideNonTextMediaTurn({
    context: loaded,
    interpretation,
    media
  });
  let responsePlan = buildResponsePlan(structuredDecision);
  let rendered = renderCustomerReply(responsePlan);

  if (containsInternalDiagnostics(rendered.text)) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: "renderer_diagnostic_blocked"
    });
    responsePlan = buildResponsePlan(structuredDecision);
    rendered = renderCustomerReply(responsePlan);
  }

  const actingUserId = resolveActingUserId({ context: loaded, options });
  const profileConfigured =
    typeof options.profileConfigured === "boolean" ? options.profileConfigured : false;
  const authorization = authorizeSideEffects({
    structuredDecision,
    responsePlan,
    context: loaded,
    env: options.env || process.env,
    profileConfigured,
    actingUserId,
    organizationId: options.organizationId || loaded.organizationId,
    options
  });

  const nextContext = mergeConversationContext(loaded, {});
  nextContext.conversation = {
    ...nextContext.conversation,
    lastQuestionAsked: loaded.conversation?.lastQuestionAsked ?? null,
    lastOfferMade: loaded.conversation?.lastOfferMade ?? null,
    lastProspectIntent: loaded.conversation?.lastProspectIntent ?? null,
    pendingClarification: loaded.conversation?.pendingClarification ?? null,
    clarificationCount: loaded.conversation?.clarificationCount ?? 0,
    lastClarificationTemplateKey:
      loaded.conversation?.lastClarificationTemplateKey ?? null
  };

  return {
    context: loaded,
    nextContext,
    interpretation,
    structuredDecision,
    responsePlan,
    rendered,
    authorization,
    persistence: { attempted: false, source: "ephemeral", result: null },
    execution: {
      attempted: false,
      performed: [],
      failed: [],
      skipped: [],
      success: false,
      idempotent: false,
      appointmentId: null,
      scheduleResult: null
    },
    audit: {
      at: new Date().toISOString(),
      intent: INTENTS.NON_TEXT_MEDIA,
      proposedAction: structuredDecision.decision.nextAction,
      nextAction: structuredDecision.decision.nextAction,
      reasonCodes: structuredDecision.reasonCodes,
      mayCreateAppointment: false,
      executionAuthorized: false,
      actionPerformed: [],
      sideEffectsAuthorized: false,
      contextPersisted: false
    }
  };
}

async function resolveProfileConfigured({ actingUserId, options = {} } = {}) {
  if (typeof options.profileConfigured === "boolean") {
    return options.profileConfigured;
  }
  if (!actingUserId) {
    return false;
  }
  const getAppointmentProfile =
    options.dependencies?.getAppointmentProfile ||
    ((userId) =>
      require("../../services/appointmentProfileService").getAppointmentProfile(userId));
  try {
    const profile = await getAppointmentProfile(actingUserId);
    return profile?.profileConfigured === true;
  } catch {
    return false;
  }
}

function applyExecutionOutcomeToReply({
  structuredDecision,
  responsePlan,
  rendered,
  execution
}) {
  if (!execution?.attempted) {
    const prematureKey = responsePlan?.templateKey;
    if (prematureKey === "appointment_confirmed" || prematureKey === "appointment_rescheduled") {
      const plan = {
        ...responsePlan,
        templateKey: "appointment_confirm_deferred"
      };
      return {
        structuredDecision: {
          ...structuredDecision,
          customerReplyPlan: {
            ...structuredDecision.customerReplyPlan,
            templateKey: "appointment_confirm_deferred"
          }
        },
        responsePlan: plan,
        rendered: renderCustomerReply(plan)
      };
    }
    return { structuredDecision, responsePlan, rendered };
  }

  const entities = {
    ...(responsePlan.entities || {}),
    ...(structuredDecision.customerReplyPlan?.entities || {})
  };

  if (execution.success) {
    // Populate slot entities from THIS execution so appointment_confirmed is concrete.
    const performed = execution.performed?.[0] || {};
    const rescheduled =
      performed.type === "reschedule_appointment" ||
      structuredDecision?.decision?.nextAction === "reschedule_appointment";
    const iulCreateSuccess =
      structuredDecision?.decision?.nextAction === NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT ||
      responsePlan?.templateKey === "iul_confirm_review_deferred" ||
      (structuredDecision?.reasonCodes || []).includes(REASON_CODES.IUL_AD_CONVERSATION);
    const inPerson =
      String(entities.meetingMode || entities.reviewMeetingMode || entities.preferredMeetingType || "")
        .toLowerCase() === "in_person" ||
      String(entities.reviewMeetingType || "").toLowerCase() === "in_person";
    const successKey = rescheduled
      ? "appointment_rescheduled"
      : iulCreateSuccess
        ? inPerson
          ? "iul_review_confirmed_office"
          : "iul_review_confirmed_zoom"
        : "appointment_confirmed";
    if (performed.dateKey && !entities.dateLabel && !entities.requestedDateLabel) {
      entities.dateLabel = performed.dateKey;
      entities.requestedDate = performed.dateKey;
    }
    if (performed.timeKey && !entities.requestedTime) {
      entities.requestedTime = performed.timeKey;
    }
    if (iulCreateSuccess && !entities.officeAddress) {
      entities.officeAddress =
        structuredDecision?.contextPatch?.knownFacts?.reviewOfficeAddress ||
        structuredDecision?.customerReplyPlan?.entities?.officeAddress ||
        null;
    }
    const extraReasons = [];
    if (iulCreateSuccess) {
      const { extractIulZoomJoinUrl } = require("./iulSchedulingOwnership");
      entities.zoomJoinUrl = inPerson ? null : extractIulZoomJoinUrl(execution);
      if (!inPerson && !entities.zoomJoinUrl) {
        extraReasons.push(REASON_CODES.IUL_ZOOM_LINK_MISSING);
      }
    }
    const plan = {
      ...responsePlan,
      templateKey: successKey,
      entities
    };
    const nextDecision = {
      ...structuredDecision,
      reasonCodes: extraReasons.length
        ? [...(structuredDecision.reasonCodes || []), ...extraReasons]
        : structuredDecision.reasonCodes,
      decision: {
        ...structuredDecision.decision,
        executionAuthorized: true,
        sideEffectsEnabled: true
      },
      customerReplyPlan: {
        ...structuredDecision.customerReplyPlan,
        templateKey: successKey,
        entities
      }
    };
    return {
      structuredDecision: nextDecision,
      responsePlan: plan,
      rendered: renderCustomerReply(plan)
    };
  }

  const failedType = execution.failed?.[0]?.type || execution.performed?.[0]?.type;
  const staleUnavailable = /SLOT_STALE|unavailable|stale/i.test(
    String(execution.failed?.[0]?.reason || execution.reason || "")
  );
  const iulCreate =
    structuredDecision?.decision?.nextAction === NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT ||
    responsePlan?.templateKey === "iul_confirm_review_deferred" ||
    (structuredDecision?.reasonCodes || []).includes(REASON_CODES.IUL_AD_CONVERSATION);
  const failKey =
    failedType === "reschedule_appointment" ||
    structuredDecision?.decision?.nextAction === "reschedule_appointment"
      ? "appointment_reschedule_failed"
      : staleUnavailable
        ? "offer_alternatives_no_handoff"
        : iulCreate
          ? "iul_review_create_failed"
          : "appointment_create_failed";
  entities.zoomJoinUrl = null;
  const plan = {
    ...responsePlan,
    templateKey: failKey,
    entities
  };
  return {
    structuredDecision: {
      ...structuredDecision,
      reasonCodes: iulCreate
        ? [...(structuredDecision.reasonCodes || []), REASON_CODES.IUL_CREATE_FAILED_NO_HANDOFF]
        : structuredDecision.reasonCodes,
      customerReplyPlan: {
        ...structuredDecision.customerReplyPlan,
        templateKey: failKey
      }
    },
    responsePlan: plan,
    rendered: renderCustomerReply(plan)
  };
}

function applyExecutionToContext(nextContext, execution) {
  if (!execution?.attempted) {
    return nextContext;
  }
  if (!execution.success || !execution.appointmentId) {
    return {
      ...nextContext,
      knownFacts: {
        ...(nextContext.knownFacts || {}),
        iulBookingPending: false
      }
    };
  }
  const performed = execution.performed?.[0] || {};
  const confirmedDate = performed.dateKey || nextContext.appointment?.proposedDate || null;
  const confirmedTime = performed.timeKey || nextContext.appointment?.proposedTime || null;
  return {
    ...nextContext,
    timezone: performed.timezone || nextContext.timezone || "America/New_York",
    currentStage: STAGES.CONFIRMED,
    knownFacts: {
      ...(nextContext.knownFacts || {}),
      iulBookingPending: false
    },
    appointment: {
      ...nextContext.appointment,
      status: APPOINTMENT_STATUS.CONFIRMED,
      appointmentId: execution.appointmentId,
      proposedDate: confirmedDate,
      proposedTime: confirmedTime,
      confirmedDate,
      confirmedTime
    }
  };
}

/**
 * Run one Recruit AI v2 decision cycle.
 * Mutations require authorization + options.allowExecution === true.
 */
async function processRecruitAiV2Turn({
  message,
  contextInput = null,
  context = null,
  availability = null,
  options = {},
  persistenceService = null
} = {}) {
  const organizationId =
    context?.organizationId ||
    contextInput?.organizationId ||
    options.organizationId ||
    null;
  const prospectId =
    context?.prospectId ||
    contextInput?.prospectId ||
    null;
  const channel = options.channel || "whatsapp";
  const inboundMessageId =
    message?.id ||
    message?.providerMessageId ||
    options.inboundMessageId ||
    null;
  const env = options.env || process.env;
  if (!options.v2Grant) {
    try {
      const {
        loadRecruitAiV2EligibilityGrant
      } = require("../../services/recruitAiV2CertificationService");
      options.v2Grant = await loadRecruitAiV2EligibilityGrant({
        organizationId,
        userId:
          options.actingUserId ||
          context?.identity?.owner_user_id ||
          contextInput?.ownerUserId ||
          null
      });
    } catch {
      const { emptyGrant } = require("./v2CertificationGrants");
      options.v2Grant = emptyGrant();
    }
  }
  // Implements BR-120 — phone + legacy id enable dual-load of durable context.
  const prospectPhone =
    options.prospectPhone ||
    context?.prospectPhone ||
    contextInput?.prospectPhone ||
    null;
  const legacyProspectId =
    options.legacyProspectId ||
    contextInput?.legacyProspectId ||
    null;

  let loaded = context || null;
  let persistenceSource = context?._persistence ? "persisted" : "provided";

  if (!loaded && persistenceService && organizationId && prospectId) {
    const loadedOrRebuilt = await persistenceService.loadOrReconstruct({
      organizationId,
      prospectId,
      channel,
      reconstructionInput: contextInput || {},
      prospectPhone,
      legacyProspectId,
      ensureCore: options.ensureCoreIdentity === true
    });
    loaded = loadedOrRebuilt.context;
    persistenceSource = loadedOrRebuilt.source;
  }

  if (!loaded) {
    loaded = loadConversationContext(contextInput || {});
    persistenceSource = loaded.persistenceSource || "ephemeral";
  }

  // Implements BR-118 — non-text media never enters the text intent/clarification path.
  const media = classifyInboundMedia(message, options);
  if (media.isNonTextMedia && !options.forceSafeFailure) {
    return processNonTextMediaTurn({
      message,
      loaded,
      media,
      options,
      persistenceService,
      persistenceSource,
      organizationId,
      prospectId,
      channel,
      inboundMessageId
    });
  }

  const interpretation = interpretInboundMessage({
    message,
    context: loaded,
    options
  });

  // Implements BR-174 — shadow semantic observation only. Never applied.
  let semanticShadow = null;
  try {
    semanticShadow = await observeSemanticInterpretation({
      message,
      context: loaded,
      legacyInterpretation: interpretation,
      options
    });
  } catch {
    semanticShadow = null;
  }

  // Implements BR-107 — read-only availability injection (never writes).
  let resolvedAvailability = availability;
  if (!options.forceSafeFailure && resolvedAvailability == null) {
    resolvedAvailability = await resolveAvailabilityForTurn({
      context: loaded,
      interpretation,
      availability: null,
      options
    });
  }

  let structuredDecision;

  if (options.forceSafeFailure) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: options.failureReason || "forced_safe_failure"
    });
  } else {
    structuredDecision = decideConversationTurn({
      context: loaded,
      interpretation,
      availability: resolvedAvailability
    });
  }

  let responsePlan = buildResponsePlan(structuredDecision);
  let rendered = renderCustomerReply(responsePlan);

  if (containsInternalDiagnostics(rendered.text)) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: "renderer_diagnostic_blocked"
    });
    responsePlan = buildResponsePlan(structuredDecision);
    rendered = renderCustomerReply(responsePlan);
  }

  const actingUserId = resolveActingUserId({ context: loaded, options });
  const profileConfigured = await resolveProfileConfigured({
    actingUserId,
    options
  });

  // Re-authorize immediately before any mutation (BR-111).
  let authorization = authorizeSideEffects({
    structuredDecision,
    responsePlan,
    context: loaded,
    env,
    profileConfigured,
    actingUserId,
    organizationId: organizationId || loaded.organizationId,
    options
  });

  let execution = {
    attempted: false,
    performed: [],
    failed: [],
    skipped: authorization.proposals.map((p) => p.type),
    success: false
  };

  // Shadow/advisory must omit allowExecution. Live canary sets allowExecution:true.
  if (authorization.authorized === true && options.allowExecution === true) {
    // Defense in depth — authorize again immediately before the write.
    authorization = authorizeSideEffects({
      structuredDecision,
      responsePlan,
      context: loaded,
      env,
      profileConfigured,
      actingUserId,
      organizationId: organizationId || loaded.organizationId,
      options
    });

    if (authorization.authorized === true) {
      execution = await executeAuthorizedSideEffects({
        authorization,
        structuredDecision,
        context: loaded,
        options: {
          ...options,
          inboundMessageId,
          prospectPhone: options.prospectPhone || loaded.prospectPhone || null
        },
        dependencies: options.dependencies || {}
      });

      const applied = applyExecutionOutcomeToReply({
        structuredDecision,
        responsePlan,
        rendered,
        execution
      });
      structuredDecision = applied.structuredDecision;
      responsePlan = applied.responsePlan;
      rendered = applied.rendered;
    }
  } else {
    // Stage-1 telemetry only — gate vs authz (does not change execution semantics).
    try {
      const nextAction = structuredDecision?.decision?.nextAction || null;
      if (nextAction === "create_appointment") {
        const {
          EVENTS,
          emitRecruitAiV2Signal
        } = require("./stage1Observability");
        const base = {
          organizationId: organizationId || loaded.organizationId || null,
          agentId: actingUserId || null,
          prospectId: prospectId || loaded.prospectId || null,
          phone: prospectPhone || loaded.prospectPhone || null,
          decisionCode: nextAction,
          correlationId: inboundMessageId || null
        };
        if (options.allowExecution !== true) {
          emitRecruitAiV2Signal(EVENTS.EXECUTION_GATE_DISABLED, {
            ...base,
            allowExecution: false,
            reasonCodes: ["ALLOW_EXECUTION_FALSE_OR_LIVE_PATH_OFF"],
            outcome: "gate_disabled"
          });
        } else if (authorization.authorized !== true) {
          emitRecruitAiV2Signal(EVENTS.EXECUTION_AUTHZ_DENIED, {
            ...base,
            allowExecution: true,
            reasonCodes: authorization.denyReasons || ["EXECUTION_DENIED"],
            outcome: "authz_denied"
          });
        }
      }
    } catch {
      // Telemetry must never affect turns.
    }
  }

  let nextContext = buildNextContextFromInterpretation({
    loaded,
    interpretation,
    structuredDecision
  });
  const authoredOutbound = String(rendered?.text || "").trim();
  nextContext.conversation = {
    ...nextContext.conversation,
    lastOfferMade: responsePlan.templateKey || nextContext.conversation.lastOfferMade,
    // Implements BR-126 — keep outbound text so later affirmatives remain confirmable.
    lastAtlasOutboundText:
      authoredOutbound || nextContext.conversation.lastAtlasOutboundText || null
  };
  nextContext = applyExecutionToContext(nextContext, execution);

  let persistenceResult = null;

  if (
    persistenceService &&
    organizationId &&
    prospectId &&
    options.persistContext !== false
  ) {
    // Implements BR-120 — dual-load / core-keyed create via phone + legacy fallback.
    persistenceResult = await persistenceService.compareAndSaveContext({
      organizationId,
      prospectId,
      channel,
      expectedVersion: loaded._persistence?.contextVersion,
      nextContext,
      inboundMessageId,
      decisionCode: structuredDecision.decision?.nextAction || null,
      prospectClosed: Boolean(options.prospectClosed),
      prospectPhone,
      legacyProspectId,
      ensureCore: options.ensureCoreIdentity !== false
    });

    if (persistenceResult?.context) {
      nextContext = persistenceResult.context;
    }

    // Implements BR-134 — confirmed V2 qualification facts → null legacy columns for MC.
    if (persistenceResult?.ok) {
      try {
        const {
          synchronizeQualificationFactsForMissionControl
        } = require("./qualificationFactSync");

        const deps = options.dependencies || {};
        const scopedOrganizationId = organizationId;
        const updateProspectFn =
          deps.updateProspect ||
          options.updateProspectFn ||
          (async (phone, patch) => {
            if (!scopedOrganizationId) {
              return null;
            }
            const { updateProspectInOrganization } = require("../../services/supabaseService");
            return updateProspectInOrganization(phone, scopedOrganizationId, patch);
          });
        const loadProspectFn =
          deps.findProspect ||
          options.loadProspectFn ||
          (async (phone) => {
            if (!scopedOrganizationId) {
              return null;
            }
            const { findProspectInOrganization } = require("../../services/supabaseService");
            return findProspectInOrganization(phone, scopedOrganizationId);
          });

        await synchronizeQualificationFactsForMissionControl({
          durableContext: nextContext,
          organizationId,
          expectedCoreProspectId:
            prospectId || nextContext.prospectId || null,
          expectedLegacyProspectId: legacyProspectId || null,
          prospectPhone:
            prospectPhone || options.prospectPhone || loaded.prospectPhone || null,
          updateProspectFn,
          loadProspectFn,
          allowWorkflowPersist: true
        });
      } catch {
        // Soft — Mission Control hydration must never break the authored turn.
      }
    }
  }

  // Implements BR-175 — optional quality capture after the turn is decided.
  // Never applies semantic facts, never changes replies or scheduling.
  try {
    const capture =
      typeof options.captureAiQuality === "function"
        ? options.captureAiQuality
        : require("../../services/aiQualityService").captureTurn;
    await capture({
      observation: semanticShadow,
      organizationId: organizationId || options.organizationId || loaded.organizationId || null,
      actingUserId: options.actingUserId || null,
      prospectId: options.legacyProspectId || prospectId || loaded.prospectId || null,
      inboundMessageId: options.inboundMessageId || null,
      inboundText: typeof message === "string" ? message : message?.text || "",
      context: loaded,
      interpretation,
      structuredDecision,
      execution,
      env: options.env || process.env
    });
  } catch {
    // Quality capture must never change the authored turn.
  }

  return {
    context: loaded,
    nextContext,
    interpretation,
    semanticShadow,
    structuredDecision,
    responsePlan,
    rendered,
    authorization,
    persistence: {
      attempted: Boolean(persistenceService && options.persistContext !== false),
      source: persistenceSource,
      result: persistenceResult
        ? {
            ok: persistenceResult.ok,
            idempotent: Boolean(persistenceResult.idempotent),
            code: persistenceResult.code || null,
            contextVersion: persistenceResult.context?._persistence?.contextVersion || null
          }
        : null
    },
    execution: {
      attempted: Boolean(execution.attempted),
      performed: execution.performed || [],
      failed: execution.failed || [],
      skipped: execution.skipped || [],
      success: Boolean(execution.success),
      idempotent: Boolean(execution.idempotent),
      appointmentId: execution.appointmentId || null,
      // BR-112 — live CE bridge maps canonical mission response when present.
      scheduleResult: execution.scheduleResult || null
    },
    audit: {
      at: new Date().toISOString(),
      intent: interpretation.intent,
      // Separate proposed vs authorized vs performed (BR-111).
      proposedAction: structuredDecision.decision.nextAction,
      nextAction: structuredDecision.decision.nextAction,
      reasonCodes: structuredDecision.reasonCodes,
      mayCreateAppointment: Boolean(structuredDecision.decision.mayCreateAppointment),
      executionAuthorized: Boolean(authorization.authorized),
      actionPerformed: (execution.performed || []).map((p) => p.type),
      sideEffectsAuthorized: Boolean(authorization.authorized),
      contextPersisted: Boolean(persistenceResult?.ok)
    }
  };
}

/** Sync wrapper for callers that do not need persistence or live execution. */
function processRecruitAiV2TurnSync(args = {}) {
  if (args.persistenceService) {
    throw new Error("Use async processRecruitAiV2Turn when persistenceService is provided");
  }

  const {
    message,
    contextInput = null,
    context = null,
    availability = null,
    options = {}
  } = args;

  const loaded = context || loadConversationContext(contextInput || {});

  // Implements BR-118 — non-text media never enters the text intent/clarification path.
  const media = classifyInboundMedia(message, options);
  if (media.isNonTextMedia && !options.forceSafeFailure) {
    return processNonTextMediaTurnSync({ message, loaded, media, options });
  }

  const interpretation = interpretInboundMessage({
    message,
    context: loaded,
    options
  });

  // Implements BR-107 — sync path uses fixtures / getSlotsSync only (no live Calendar).
  let resolvedAvailability = availability;
  if (!options.forceSafeFailure && resolvedAvailability == null) {
    resolvedAvailability = resolveAvailabilityForTurnSync({
      context: loaded,
      interpretation,
      availability: null,
      options
    });
  }

  let structuredDecision = options.forceSafeFailure
    ? decideSafeFailure({
        context: loaded,
        interpretation,
        failureReason: options.failureReason || "forced_safe_failure"
      })
    : decideConversationTurn({
        context: loaded,
        interpretation,
        availability: resolvedAvailability
      });

  let responsePlan = buildResponsePlan(structuredDecision);
  let rendered = renderCustomerReply(responsePlan);

  if (containsInternalDiagnostics(rendered.text)) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: "renderer_diagnostic_blocked"
    });
    responsePlan = buildResponsePlan(structuredDecision);
    rendered = renderCustomerReply(responsePlan);
  }

  const actingUserId = resolveActingUserId({ context: loaded, options });
  const profileConfigured =
    typeof options.profileConfigured === "boolean" ? options.profileConfigured : false;

  const authorization = authorizeSideEffects({
    structuredDecision,
    responsePlan,
    context: loaded,
    env: options.env || process.env,
    profileConfigured,
    actingUserId,
    organizationId: options.organizationId || loaded.organizationId,
    options
  });

  // Sync path never mutates — execution requires async + allowExecution.
  const nextContext = buildNextContextFromInterpretation({
    loaded,
    interpretation,
    structuredDecision
  });
  nextContext.conversation = {
    ...nextContext.conversation,
    lastOfferMade: responsePlan.templateKey || nextContext.conversation.lastOfferMade
  };

  return {
    context: loaded,
    nextContext,
    interpretation,
    structuredDecision,
    responsePlan,
    rendered,
    authorization,
    persistence: { attempted: false, source: "ephemeral", result: null },
    execution: {
      attempted: false,
      performed: [],
      failed: [],
      skipped: authorization.proposals.map((p) => p.type),
      success: false
    },
    audit: {
      at: new Date().toISOString(),
      intent: interpretation.intent,
      proposedAction: structuredDecision.decision.nextAction,
      nextAction: structuredDecision.decision.nextAction,
      reasonCodes: structuredDecision.reasonCodes,
      mayCreateAppointment: Boolean(structuredDecision.decision.mayCreateAppointment),
      executionAuthorized: Boolean(authorization.authorized),
      actionPerformed: [],
      sideEffectsAuthorized: Boolean(authorization.authorized),
      contextPersisted: false
    }
  };
}

module.exports = {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync,
  applyExecutionOutcomeToReply,
  applyExecutionToContext
};
