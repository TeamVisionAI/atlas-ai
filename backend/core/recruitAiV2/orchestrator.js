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
const { APPOINTMENT_STATUS, STAGES } = require("./conversationContext");

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
    return { structuredDecision, responsePlan, rendered };
  }

  const entities = {
    ...(responsePlan.entities || {}),
    ...(structuredDecision.customerReplyPlan?.entities || {})
  };

  if (execution.success) {
    const plan = {
      ...responsePlan,
      templateKey: "appointment_confirmed",
      entities
    };
    const nextDecision = {
      ...structuredDecision,
      decision: {
        ...structuredDecision.decision,
        executionAuthorized: true,
        sideEffectsEnabled: true
      },
      customerReplyPlan: {
        ...structuredDecision.customerReplyPlan,
        templateKey: "appointment_confirmed",
        entities
      }
    };
    return {
      structuredDecision: nextDecision,
      responsePlan: plan,
      rendered: renderCustomerReply(plan)
    };
  }

  const plan = {
    ...responsePlan,
    templateKey: "appointment_create_failed",
    entities
  };
  return {
    structuredDecision: {
      ...structuredDecision,
      customerReplyPlan: {
        ...structuredDecision.customerReplyPlan,
        templateKey: "appointment_create_failed"
      }
    },
    responsePlan: plan,
    rendered: renderCustomerReply(plan)
  };
}

function applyExecutionToContext(nextContext, execution) {
  if (!execution?.success || !execution.appointmentId) {
    return nextContext;
  }
  const performed = execution.performed?.[0] || {};
  return {
    ...nextContext,
    currentStage: STAGES.CONFIRMED,
    appointment: {
      ...nextContext.appointment,
      status: APPOINTMENT_STATUS.CONFIRMED,
      appointmentId: execution.appointmentId,
      confirmedDate: performed.dateKey || nextContext.appointment?.proposedDate || null,
      confirmedTime: performed.timeKey || nextContext.appointment?.proposedTime || null
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

  let loaded = context || null;
  let persistenceSource = context?._persistence ? "persisted" : "provided";

  if (!loaded && persistenceService && organizationId && prospectId) {
    const loadedOrRebuilt = await persistenceService.loadOrReconstruct({
      organizationId,
      prospectId,
      channel,
      reconstructionInput: contextInput || {}
    });
    loaded = loadedOrRebuilt.context;
    persistenceSource = loadedOrRebuilt.source;
  }

  if (!loaded) {
    loaded = loadConversationContext(contextInput || {});
    persistenceSource = loaded.persistenceSource || "ephemeral";
  }

  const interpretation = interpretInboundMessage({
    message,
    context: loaded,
    options
  });

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
  }

  let nextContext = buildNextContextFromInterpretation({
    loaded,
    interpretation,
    structuredDecision
  });
  nextContext.conversation = {
    ...nextContext.conversation,
    lastOfferMade: responsePlan.templateKey || nextContext.conversation.lastOfferMade
  };
  nextContext = applyExecutionToContext(nextContext, execution);

  let persistenceResult = null;

  if (
    persistenceService &&
    organizationId &&
    prospectId &&
    options.persistContext !== false
  ) {
    persistenceResult = await persistenceService.compareAndSaveContext({
      organizationId,
      prospectId,
      channel,
      expectedVersion: loaded._persistence?.contextVersion,
      nextContext,
      inboundMessageId,
      decisionCode: structuredDecision.decision?.nextAction || null,
      prospectClosed: Boolean(options.prospectClosed)
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
      appointmentId: execution.appointmentId || null
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
  processRecruitAiV2TurnSync
};
