/**
 * Recruit AI v2 — live WhatsApp conversation authoring bridge (BR-114).
 *
 * Earliest safe canary intercept (communicationHub):
 * - Eligible one-user turns: processRecruitAiV2Turn authors customer reply
 * - Canonical outbound remains communicationHub → sendAndPersistWhatsAppMessage
 * - Legacy CE is skipped for successful v2 authoring (including clarify_once)
 * - Technical failure / empty / unsafe text → fall through to legacy CE once
 *
 * Does NOT send WhatsApp itself.
 * Does NOT authorize mutations (BR-111). allowExecution only when BR-112 live
 * execution path is also enabled (independent of authoring).
 *
 * Implements BR-114 / BR-049 / BR-081 / BR-107 / BR-108.
 */

const { processRecruitAiV2Turn } = require("./orchestrator");
const { containsInternalDiagnostics } = require("./sanitize");
const {
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect,
  DEFAULT_TIMEOUT_MS
} = require("./liveAuthoringConfig");
const { resolveAllowExecutionForAuthoringTurn } = require("./liveExecutionPathConfig");
const { buildReconstructionInput } = require("./shadowEvaluationService");
const {
  createContextPersistenceService
} = require("./contextPersistenceService");
const {
  resolveCanonicalProspectIdentity
} = require("../recruitingProspectBridge");
const {
  createSupabaseContextRepository,
  createMemoryContextRepository
} = require("./contextRepository");
const { resolvePostCreateOwnership } = require("./postCreateOwnership");
const {
  hasConfirmableAppointmentProposal
} = require("./schedulingConfirmation");
const { renderCustomerReply } = require("./responseRenderer");
const { APPOINTMENT_STATUS } = require("./conversationContext");
const { loadPersistedWorkflowState } = require("../workflowStateStore");
const {
  LATE_RESULT_REASONS,
  classifyLateSettledV2Result
} = require("./lateSettledAuthoringResult");

const STAGES = Object.freeze({
  ATTEMPTED: "recruit_ai_v2_live_authoring_attempted",
  USED: "recruit_ai_v2_live_authoring_used",
  FALLBACK: "recruit_ai_v2_live_authoring_fallback_to_legacy",
  SKIPPED: "recruit_ai_v2_live_authoring_skipped",
  OWNED_AFTER_MUTATION: "recruit_ai_v2_live_authoring_owned_after_mutation",
  // Implements BR-126 — protect confirmable proposed from CE fallthrough.
  OWNED_CONFIRMABLE_PROPOSAL: "recruit_ai_v2_live_authoring_owned_confirmable_proposal",
  // Implements BR-168 — late-settled conversational reply after soft timeout.
  LATE_RESULT_RECOVERED: "recruit_ai_v2_live_authoring_late_result_recovered",
  LATE_RESULT_REJECTED: "recruit_ai_v2_live_authoring_late_result_rejected"
});

const HUMAN_REQUIRED_HOLD_REASON = "V2_HUMAN_REQUIRED_HOLD";
const HUMAN_REQUIRED_HOLD_UNRESOLVED_REASON =
  "V2_HUMAN_REQUIRED_HOLD_UNRESOLVED";

function contextRequiresHumanHold(context) {
  return Boolean(
    context &&
      (context.currentStage === "human_required" ||
        context.attention?.needsHumanAttention === true)
  );
}

async function hydrateTenantOfficeIdentity(organizationId, dependencies = {}) {
  const orgId = organizationId || null;
  let organizationName = null;
  if (typeof dependencies.getOrganizationBranding === "function") {
    try {
      const branding = await dependencies.getOrganizationBranding(orgId);
      organizationName = branding?.name || null;
    } catch {
      organizationName = null;
    }
  } else if (orgId) {
    try {
      const branding = await require("../../services/organizationBrandingService").getOrganizationBranding(
        orgId
      );
      organizationName = branding?.name || null;
    } catch {
      organizationName = null;
    }
  }

  const { isSafeOrganizationDisplayName } = require("./tenantBranding");
  if (!isSafeOrganizationDisplayName(organizationName, orgId)) {
    organizationName = null;
  }

  try {
    const { resolveCanonicalOfficeAddress } = require("../officeAddressResolver");
    const resolved = await resolveCanonicalOfficeAddress(
      { organizationId: orgId, meetingType: "in_person" },
      {
        getMeetingManagement: dependencies.getMeetingManagement
      }
    );
    return {
      organizationName,
      officeAddress: resolved?.address || null,
      officeAddressSource: resolved?.source || "unavailable"
    };
  } catch {
    return {
      organizationName,
      officeAddress: null,
      officeAddressSource: "unavailable"
    };
  }
}

function hasExplicitReturnToAtlas(workflowState) {
  return (
    Boolean(workflowState?.returnedToAtlasAt) &&
    workflowState.manualAgentOwnership !== true &&
    !workflowState.humanTakenOverAt
  );
}

function humanRequiredHoldResult({
  reason,
  heldContext = null,
  actingUserId,
  organizationId
}) {
  return {
    eligible: true,
    authored: false,
    fallThrough: false,
    reason,
    replyText: null,
    v2Result: heldContext ? { nextContext: heldContext } : null,
    actingUserId,
    organizationId,
    nextAction: null,
    allowExecution: false,
    stage: STAGES.SKIPPED
  };
}

/** Extra wait after soft timeout so in-flight processTurn can finish. */
const POST_TIMEOUT_GRACE_MS = 12000;
const POST_TIMEOUT_GRACE_MS_ENV =
  "RECRUIT_AI_V2_LIVE_AUTHORING_POST_TIMEOUT_GRACE_MS";

function resolvePostTimeoutGraceMs(env = process.env) {
  const raw = env?.[POST_TIMEOUT_GRACE_MS_ENV];
  if (raw == null || raw === "") {
    return POST_TIMEOUT_GRACE_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 60000) {
    return POST_TIMEOUT_GRACE_MS;
  }
  return Math.floor(n);
}

async function awaitLateTrackedResult(error, env = process.env) {
  if (!error) {
    return { late: null, reason: LATE_RESULT_REASONS.UNRESOLVED };
  }

  if (typeof error.awaitTracked === "function") {
    try {
      const late = await Promise.race([
        error.awaitTracked(),
        new Promise((_, reject) => {
          const timeoutError = new Error("POST_TIMEOUT_GRACE_EXCEEDED");
          timeoutError.code = "POST_TIMEOUT_GRACE_EXCEEDED";
          setTimeout(
            () => reject(timeoutError),
            resolvePostTimeoutGraceMs(env)
          );
        })
      ]);
      return { late, reason: null };
    } catch (waitError) {
      const snapshot =
        typeof error.getLateResult === "function" ? error.getLateResult() : null;
      if (snapshot) {
        return { late: snapshot, reason: null };
      }
      if (waitError?.code === "CONTEXT_VERSION_CONFLICT") {
        return { late: null, reason: LATE_RESULT_REASONS.CONFLICTED };
      }
      if (
        waitError?.code === "POST_TIMEOUT_GRACE_EXCEEDED" ||
        waitError?.message === "POST_TIMEOUT_GRACE_EXCEEDED"
      ) {
        return { late: null, reason: LATE_RESULT_REASONS.UNRESOLVED };
      }
      return { late: null, reason: LATE_RESULT_REASONS.FAILED };
    }
  }

  if (typeof error.getLateResult === "function") {
    const snapshot = error.getLateResult();
    return snapshot
      ? { late: snapshot, reason: null }
      : { late: null, reason: LATE_RESULT_REASONS.UNRESOLVED };
  }

  return { late: null, reason: LATE_RESULT_REASONS.UNRESOLVED };
}

function resolveSupabaseClient() {
  try {
    const { getServiceRoleClient } = require("../../services/backendDbService");
    return getServiceRoleClient();
  } catch {
    return null;
  }
}

function createDefaultPersistenceService() {
  const supabase = resolveSupabaseClient();
  return createContextPersistenceService({
    repository: supabase
      ? createSupabaseContextRepository(supabase)
      : createMemoryContextRepository()
  });
}

function withTimeout(promise, timeoutMs, code = "LIVE_AUTHORING_TIMEOUT") {
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
  let timer = null;
  let settled = null;
  const tracked = Promise.resolve(promise).then(
    (value) => {
      settled = { ok: true, value };
      return value;
    },
    (error) => {
      settled = { ok: false, error };
      throw error;
    }
  );

  return Promise.race([
    tracked.finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(code);
        error.code = code;
        // Attach late settle so callers can reclaim ownership after mission write.
        error.getLateResult = () => (settled?.ok ? settled.value : null);
        error.awaitTracked = () => tracked;
        reject(error);
      }, ms);
    })
  ]);
}

async function reclaimOwnershipAfterAuthoringLoss({
  error = null,
  v2Result = null,
  prospect = {},
  normalized = {},
  organizationId = null,
  actingUserId = null,
  allowExecution = false,
  persistence = null,
  findActiveAppointment = null,
  logStage = null,
  env = process.env
} = {}) {
  let EVENTS = null;
  let emitRecruitAiV2Signal = () => false;
  let resolveCalendarEventId = () => null;
  try {
    const obs = require("./stage1Observability");
    EVENTS = obs.EVENTS;
    emitRecruitAiV2Signal = obs.emitRecruitAiV2Signal;
    resolveCalendarEventId = obs.resolveCalendarEventId;
  } catch {
    // Telemetry optional — reclaim ownership must continue.
  }

  let late = v2Result;
  if (!late) {
    late = (await awaitLateTrackedResult(error, env)).late;
  }

  const proposedDate =
    late?.nextContext?.appointment?.proposedDate ||
    late?.nextContext?.appointment?.confirmedDate ||
    late?.context?.appointment?.proposedDate ||
    late?.context?.appointment?.confirmedDate ||
    null;
  const proposedTime =
    late?.nextContext?.appointment?.proposedTime ||
    late?.nextContext?.appointment?.confirmedTime ||
    late?.context?.appointment?.proposedTime ||
    late?.context?.appointment?.confirmedTime ||
    null;
  const language =
    late?.nextContext?.preferredLanguage ||
    late?.context?.preferredLanguage ||
    "spanish";
  const prospectId =
    late?.nextContext?.prospectId ||
    late?.context?.prospectId ||
    null;
  const agentId =
    actingUserId ||
    late?.nextContext?.agentId ||
    late?.context?.agentId ||
    prospect.owner_user_id ||
    null;
  const phone = prospect.phone || normalized.phone || null;
  const durableStatus =
    late?.nextContext?.appointment?.status ||
    late?.context?.appointment?.status ||
    null;

  emitRecruitAiV2Signal(
    EVENTS?.BR125_RECLAIM_ATTEMPTED ||
      "recruit_ai_v2.br125.reclaim.attempted",
    {
      organizationId,
      agentId,
      prospectId,
      phone,
      decisionCode: "create_appointment",
      correlationId: normalized.providerMessageId || null,
      allowExecution,
      outcome: "attempted",
      detail: error?.code || null
    },
    { logStage }
  );

  const finder =
    findActiveAppointment ||
    (async (phoneArg, orgId, agent) => {
      const {
        findActiveAppointmentForProspect
      } = require("../activeAppointmentResolver");
      return findActiveAppointmentForProspect(phoneArg, orgId, agent);
    });

  const ownership = await resolvePostCreateOwnership({
    v2Result: late,
    findActiveAppointment: finder,
    prospectPhone: phone,
    organizationId,
    prospectId,
    agentId,
    proposedDate,
    proposedTime,
    timezone: late?.nextContext?.timezone || "America/New_York",
    language,
    baseContext: late?.nextContext || late?.context || null
  });

  if (!ownership.owned || !ownership.replyText) {
    emitRecruitAiV2Signal(
      EVENTS?.BR125_RECLAIM_FAILED || "recruit_ai_v2.br125.reclaim.failed",
      {
        organizationId,
        agentId,
        prospectId,
        phone,
        decisionCode: "create_appointment",
        correlationId: normalized.providerMessageId || null,
        reasonCodes: [ownership?.reason || "RECLAIM_FAILED"],
        allowExecution,
        outcome: "failed",
        detail: ownership?.reason || null
      },
      { logStage }
    );

    if (
      String(durableStatus).toLowerCase() === "confirmed" &&
      (ownership?.reason === "NO_ACTIVE" || ownership?.reason === "LOOKUP_FAILED")
    ) {
      emitRecruitAiV2Signal(
        EVENTS?.MISMATCH_DURABLE_CONFIRMED_NO_ACTIVE ||
          "recruit_ai_v2.mismatch.durable_confirmed_no_active",
        {
          organizationId,
          agentId,
          prospectId,
          phone,
          appointmentId: late?.nextContext?.appointment?.appointmentId || null,
          decisionCode: "create_appointment",
          correlationId: normalized.providerMessageId || null,
          reasonCodes: [ownership?.reason || "NO_ACTIVE"],
          outcome: "mismatch"
        },
        { logStage }
      );
    }

    return null;
  }

  if (
    ownership.source === "active_appointment_reconcile" &&
    String(durableStatus || "").toLowerCase() !== "confirmed"
  ) {
    emitRecruitAiV2Signal(
      EVENTS?.MISMATCH_ACTIVE_UNCONFIRMED_DURABLE ||
        "recruit_ai_v2.mismatch.active_unconfirmed_durable",
      {
        organizationId,
        agentId,
        prospectId,
        phone,
        appointmentId: ownership.appointmentId,
        calendarEventId: resolveCalendarEventId(ownership.appointment),
        decisionCode: "create_appointment",
        correlationId: normalized.providerMessageId || null,
        reasonCodes: ["ACTIVE_PRESENT_DURABLE_NOT_CONFIRMED"],
        outcome: "mismatch",
        source: ownership.source
      },
      { logStage }
    );
  }

  if (persistence && ownership.nextContext && organizationId) {
    try {
      await persistence.compareAndSaveContext({
        organizationId,
        prospectId:
          late?.nextContext?.prospectId ||
          late?.context?.prospectId ||
          prospect.id ||
          null,
        channel: "whatsapp",
        expectedVersion:
          late?.nextContext?._persistence?.contextVersion ||
          late?.context?._persistence?.contextVersion ||
          undefined,
        nextContext: ownership.nextContext,
        inboundMessageId: normalized.providerMessageId || null,
        decisionCode: "create_appointment",
        prospectPhone: phone,
        legacyProspectId: prospect.id || null,
        ensureCore: true
      });
    } catch {
      // Soft: reply ownership still preferred even if durable reconcile races.
    }
  }

  emitRecruitAiV2Signal(
    EVENTS?.BR125_RECLAIM_SUCCEEDED ||
      "recruit_ai_v2.br125.reclaim.succeeded",
    {
      organizationId,
      agentId,
      prospectId,
      phone,
      appointmentId: ownership.appointmentId,
      calendarEventId: resolveCalendarEventId(ownership.appointment),
      decisionCode: "create_appointment",
      correlationId: normalized.providerMessageId || null,
      allowExecution,
      outcome: "succeeded",
      source: ownership.source
    },
    { logStage }
  );

  if (typeof logStage === "function") {
    logStage(STAGES.OWNED_AFTER_MUTATION, {
      phone,
      organizationId,
      agentId: actingUserId,
      allowExecution,
      appointmentId: ownership.appointmentId,
      source: ownership.source,
      providerMessageId: normalized.providerMessageId || null
    });
  }

  return {
    eligible: true,
    authored: true,
    fallThrough: false,
    reason: null,
    replyText: ownership.replyText,
    v2Result: late || {
      execution: {
        success: true,
        appointmentId: ownership.appointmentId,
        performed: [
          {
            dateKey: ownership.dateKey,
            timeKey: ownership.timeKey
          }
        ]
      },
      nextContext: ownership.nextContext,
      responsePlan: { templateKey: "appointment_confirmed" }
    },
    actingUserId,
    organizationId,
    nextAction: "create_appointment",
    allowExecution,
    stage: STAGES.OWNED_AFTER_MUTATION,
    ownershipSource: ownership.source
  };
}

/**
 * Implements BR-126 — after deferred/create-attempt authoring loss, never hand a
 * confirmable proposed slot to legacy CE (which may treat "Si" as a city name).
 */
function isConfirmableProposedDurable(context = null) {
  if (!context) {
    return false;
  }
  const status = String(context.appointment?.status || "");
  const lastQ = String(context.conversation?.lastQuestionAsked || "");
  const lastOffer = String(context.conversation?.lastOfferMade || "");
  const lastIntent = String(context.conversation?.lastProspectIntent || "");
  const proposed =
    status === APPOINTMENT_STATUS.PROPOSED ||
    status === "proposed" ||
    Boolean(context.appointment?.proposedDate && context.appointment?.proposedTime);

  if (!proposed) {
    return false;
  }
  if (hasConfirmableAppointmentProposal(context)) {
    return true;
  }
  if (lastQ === "confirm_slot") {
    return true;
  }
  if (lastIntent === "schedule_confirm") {
    return true;
  }
  if (
    lastOffer === "appointment_confirm_deferred" ||
    lastOffer === "appointment_create_failed" ||
    lastOffer === "ask_confirm_slot"
  ) {
    return true;
  }
  try {
    const {
      isIulConfirmableSchedulingState
    } = require("./iulSchedulingOwnership");
    if (isIulConfirmableSchedulingState(context)) {
      return true;
    }
  } catch {
    // Ownership helper must never throw into authoring recovery.
  }
  return false;
}

async function loadDurableForConfirmableGuard({
  persistence = null,
  organizationId = null,
  prospect = {},
  normalized = {},
  late = null
} = {}) {
  const fromLate = late?.nextContext || late?.context || null;
  if (fromLate && isConfirmableProposedDurable(fromLate)) {
    return fromLate;
  }
  if (!persistence || !organizationId) {
    return fromLate;
  }
  const prospectId =
    late?.nextContext?.prospectId ||
    late?.context?.prospectId ||
    null;
  try {
    const loaded = await persistence.loadOrReconstruct({
      organizationId,
      prospectId: prospectId || prospect.id || null,
      channel: "whatsapp",
      reconstructionInput: {},
      prospectPhone: prospect.phone || normalized.phone || null,
      legacyProspectId: prospect.id || null,
      ensureCore: true
    });
    return loaded?.context || fromLate;
  } catch {
    return fromLate;
  }
}

async function ownConfirmableProposalAfterAuthoringLoss({
  error = null,
  v2Result = null,
  prospect = {},
  normalized = {},
  organizationId = null,
  actingUserId = null,
  allowExecution = false,
  persistence = null,
  logStage = null,
  env = process.env,
  skipLateWait = false
} = {}) {
  let late = v2Result;
  if (!late && !skipLateWait) {
    late = (await awaitLateTrackedResult(error, env)).late;
  }

  const durable = await loadDurableForConfirmableGuard({
    persistence,
    organizationId,
    prospect,
    normalized,
    late
  });

  const {
    isIulPolicyReviewContext,
    isIulConfirmableSchedulingState,
    isIulDeferredBookingState,
    resolveIulSelectedSlotFromInbound,
    buildIulDeferredAcknowledgement,
    proposedSlotFromContext
  } = require("./iulSchedulingOwnership");
  const inboundSelectedSlot = isIulPolicyReviewContext(durable)
    ? resolveIulSelectedSlotFromInbound(durable, {
        text: normalized.text,
        interactiveReply: normalized.interactiveReply
      })
    : null;
  const iulBookingTurn =
    isIulDeferredBookingState(durable, inboundSelectedSlot) || Boolean(inboundSelectedSlot);
  // Skip-late IUL path is only for an in-flight selected-slot booking, not
  // daypart/offer/create-failed timeouts (those stay on BR-168 recovery).
  if (skipLateWait && !iulBookingTurn) {
    return null;
  }
  if (!isConfirmableProposedDurable(durable) && !inboundSelectedSlot) {
    return null;
  }

  const language =
    durable.preferredLanguage ||
    late?.nextContext?.preferredLanguage ||
    late?.context?.preferredLanguage ||
    "spanish";

  const lateFailed = Boolean(late?.execution?.attempted && !late?.execution?.success);
  const lateFailedReply = extractAuthoredReplyText(late);
  // Implements BR-187 / BR-126 — own the turn on authoring loss, but do not
  // emit create-failed copy unless booking was actually attempted and failed.
  // allowExecution alone is not a provider failure.
  const iulOwned =
    isIulPolicyReviewContext(durable) ||
    isIulConfirmableSchedulingState(durable) ||
    Boolean(inboundSelectedSlot);
  if (iulOwned && !iulBookingTurn && !lateFailed) {
    return null;
  }
  const templateKey = lateFailed
    ? iulOwned
      ? "iul_review_create_failed"
      : "appointment_create_failed"
    : iulOwned
      ? "iul_confirm_review_deferred"
      : "appointment_confirm_deferred";

  let replyText = "";
  if (lateFailed && lateFailedReply) {
    replyText = lateFailedReply;
  } else if (iulOwned && !lateFailed) {
    const slot =
      resolveIulSelectedSlotFromInbound(durable, {
        text: normalized.text,
        interactiveReply: normalized.interactiveReply
      }) || proposedSlotFromContext(durable);
    replyText = buildIulDeferredAcknowledgement({
      language: language === "english" || language === "en" ? "en" : "es",
      slot,
      context: durable,
      officeAddress: durable.knownFacts?.reviewOfficeAddress || null
    });
  } else {
    replyText = extractAuthoredReplyText({
      rendered: renderCustomerReply({
        templateKey,
        language,
        entities: {
          dateLabel: durable.appointment?.proposedDate || null,
          requestedDate: durable.appointment?.proposedDate || null,
          requestedTime: durable.appointment?.proposedTime || null
        }
      })
    });
  }

  if (!replyText) {
    return null;
  }

  const selectedSlot = iulOwned
    ? resolveIulSelectedSlotFromInbound(durable, {
        text: normalized.text,
        interactiveReply: normalized.interactiveReply
      }) || proposedSlotFromContext(durable)
    : null;
  const nextContext = {
    ...durable,
    currentStage: durable.currentStage || "proposed",
    knownFacts: {
      ...(durable.knownFacts || {}),
      ...(iulOwned
        ? {
            iulBookingPending: !lateFailed,
            reviewProposedDate:
              selectedSlot?.date ||
              selectedSlot?.dateKey ||
              durable.knownFacts?.reviewProposedDate ||
              durable.appointment?.proposedDate ||
              null,
            reviewProposedTime:
              selectedSlot?.time ||
              selectedSlot?.timeKey ||
              durable.knownFacts?.reviewProposedTime ||
              durable.appointment?.proposedTime ||
              null
          }
        : {})
    },
    appointment: {
      ...durable.appointment,
      status: APPOINTMENT_STATUS.PROPOSED,
      appointmentId: lateFailed ? durable.appointment?.appointmentId || null : null,
      confirmedDate: null,
      confirmedTime: null,
      proposedDate:
        selectedSlot?.date ||
        selectedSlot?.dateKey ||
        durable.appointment?.proposedDate ||
        null,
      proposedTime:
        selectedSlot?.time ||
        selectedSlot?.timeKey ||
        durable.appointment?.proposedTime ||
        null
    },
    conversation: {
      ...durable.conversation,
      lastQuestionAsked: iulOwned ? "iul_confirm_review_slot" : "confirm_slot",
      lastProspectIntent: iulOwned ? "iul_select_offered_slot" : "schedule_confirm",
      lastOfferMade: templateKey,
      lastAtlasOutboundText: replyText,
      pendingClarification: null,
      clarificationCount: 0
    }
  };

  if (persistence && organizationId) {
    try {
      await persistence.compareAndSaveContext({
        organizationId,
        prospectId: durable.prospectId || late?.nextContext?.prospectId || null,
        channel: "whatsapp",
        expectedVersion: durable._persistence?.contextVersion || undefined,
        nextContext,
        inboundMessageId: normalized.providerMessageId || null,
        decisionCode: iulOwned
          ? "iul_create_review_appointment"
          : "create_appointment",
        prospectPhone: prospect.phone || normalized.phone || null,
        legacyProspectId: prospect.id || null,
        ensureCore: true
      });
    } catch {
      // Soft: still own the customer reply.
    }
  }

  if (typeof logStage === "function") {
    logStage(STAGES.OWNED_CONFIRMABLE_PROPOSAL, {
      phone: normalized.phone || prospect.phone || null,
      organizationId,
      agentId: actingUserId,
      allowExecution,
      templateKey,
      providerMessageId: normalized.providerMessageId || null
    });
  }

  return {
    eligible: true,
    authored: true,
    fallThrough: false,
    reason: null,
    replyText,
    v2Result: late || {
      nextContext,
      responsePlan: { templateKey },
      structuredDecision: {
        decision: {
          nextAction: iulOwned
            ? "iul_create_review_appointment"
            : "create_appointment"
        }
      }
    },
    actingUserId,
    organizationId,
    nextAction: iulOwned
      ? "iul_create_review_appointment"
      : "create_appointment",
    allowExecution,
    stage: STAGES.OWNED_CONFIRMABLE_PROPOSAL,
    ownershipSource: "confirmable_proposal_guard"
  };
}

/**
 * BR-125 success reclaim, else BR-126 confirmable-proposal guard (no CE).
 */
async function reclaimOrProtectConfirmableProposal(args = {}) {
  // Implements BR-219 — IUL selected-slot timeout must send deferred now,
  // not after the post-timeout grace used by mutation reclaim.
  const iulImmediate = await ownConfirmableProposalAfterAuthoringLoss({
    ...args,
    skipLateWait: true
  });
  if (iulImmediate?.authored && iulImmediate.replyText) {
    return iulImmediate;
  }
  const reclaimed = await reclaimOwnershipAfterAuthoringLoss(args);
  if (reclaimed?.authored && reclaimed.replyText) {
    return reclaimed;
  }
  return ownConfirmableProposalAfterAuthoringLoss(args);
}

function extractAuthoredReplyText(v2Result) {
  const text = String(v2Result?.rendered?.text || "").trim();
  if (!text) {
    return "";
  }
  if (containsInternalDiagnostics(text)) {
    return "";
  }
  return text;
}

function emitLateResultSignal(event, fields, logStage) {
  try {
    const { EVENTS, emitRecruitAiV2Signal } = require("./stage1Observability");
    emitRecruitAiV2Signal(event || EVENTS.LIVE_AUTHORING_LATE_RESULT_REJECTED, fields, {
      logStage
    });
  } catch {
    // Telemetry optional.
  }
}

/**
 * Implements BR-168 — after LIVE_AUTHORING_TIMEOUT, recover a late-settled
 * conversational V2 reply. Mutation turns stay with BR-125 / BR-126.
 */
async function recoverLateSettledAuthoringReply({
  error = null,
  prospect = {},
  normalized = {},
  organizationId = null,
  actingUserId = null,
  allowExecution = false,
  env = process.env,
  logStage = null
} = {}) {
  const awaited = await awaitLateTrackedResult(error, env);
  const classification = awaited.late
    ? classifyLateSettledV2Result(awaited.late, extractAuthoredReplyText)
    : {
        recoverable: false,
        reason: awaited.reason || LATE_RESULT_REASONS.UNRESOLVED,
        replyText: null,
        nextAction: null
      };

  const phone = normalized.phone || prospect.phone || null;
  const prospectId =
    awaited.late?.nextContext?.prospectId ||
    awaited.late?.context?.prospectId ||
    prospect.id ||
    null;
  const nextAction = classification.nextAction || null;

  if (!classification.recoverable || !classification.replyText) {
    if (typeof logStage === "function") {
      logStage(STAGES.LATE_RESULT_REJECTED, {
        level: "info",
        phone,
        organizationId,
        agentId: actingUserId,
        prospectId,
        providerMessageId: normalized.providerMessageId || null,
        reason: classification.reason,
        nextAction
      });
    }
  emitLateResultSignal(
    require("./stage1Observability").EVENTS.LIVE_AUTHORING_LATE_RESULT_REJECTED,
      {
        organizationId,
        agentId: actingUserId,
        prospectId,
        phone,
        decisionCode: nextAction,
        correlationId: normalized.providerMessageId || null,
        allowExecution,
        reasonCodes: [classification.reason],
        outcome: "rejected",
        detail: classification.reason
      },
      logStage
    );
    return {
      authored: false,
      reason: classification.reason,
      v2Result: awaited.late || null,
      nextAction
    };
  }

  if (typeof logStage === "function") {
    logStage(STAGES.LATE_RESULT_RECOVERED, {
      phone,
      organizationId,
      agentId: actingUserId,
      prospectId,
      providerMessageId: normalized.providerMessageId || null,
      reason: classification.reason,
      nextAction
    });
  }
  emitLateResultSignal(
    require("./stage1Observability").EVENTS.LIVE_AUTHORING_LATE_RESULT_RECOVERED,
    {
      organizationId,
      agentId: actingUserId,
      prospectId,
      phone,
      decisionCode: nextAction,
      correlationId: normalized.providerMessageId || null,
      allowExecution,
      reasonCodes: [classification.reason],
      outcome: "recovered",
      detail: "LIVE_AUTHORING_LATE_RESULT_RECOVERED"
    },
    logStage
  );

  return {
    eligible: true,
    authored: true,
    fallThrough: false,
    reason: "LIVE_AUTHORING_LATE_RESULT_RECOVERED",
    replyText: classification.replyText,
    v2Result: awaited.late,
    actingUserId,
    organizationId,
    nextAction,
    allowExecution,
    stage: STAGES.LATE_RESULT_RECOVERED,
    lateResultReason: classification.reason
  };
}

/**
 * Attempt v2 live authoring for one WhatsApp turn.
 *
 * @returns {{
 *   eligible: boolean,
 *   authored: boolean,
 *   fallThrough: boolean,
 *   reason: string|null,
 *   replyText: string|null,
 *   v2Result: object|null,
 *   actingUserId: string|null,
 *   organizationId: string|null,
 *   nextAction: string|null,
 *   allowExecution: boolean,
 *   stage: string
 * }}
 */
async function attemptLiveV2Authoring({
  normalized = {},
  prospect = {},
  env = process.env,
  dependencies = {},
  processTurn = processRecruitAiV2Turn,
  persistenceService = null,
  logStage = null
} = {}) {
  const organizationId = prospect.organization_id || prospect.organizationId || null;
  const actingUserId = resolveActingUserIdFromProspect(prospect);

  let grant = dependencies.v2Grant || null;
  if (!grant) {
    try {
      const {
        loadRecruitAiV2EligibilityGrant
      } = require("../../services/recruitAiV2CertificationService");
      grant = await loadRecruitAiV2EligibilityGrant({
        organizationId,
        userId: actingUserId
      });
    } catch {
      const { emptyGrant } = require("./v2CertificationGrants");
      grant = emptyGrant();
    }
  }

  const eligibility = isEligibleForLiveAuthoring({
    organizationId,
    actingUserId,
    env,
    invocationSource: "live_whatsapp",
    grant
  });

  if (!eligibility.eligible) {
    return {
      eligible: false,
      authored: false,
      fallThrough: true,
      reason: eligibility.reason || "LIVE_AUTHORING_INELIGIBLE",
      replyText: null,
      v2Result: null,
      actingUserId,
      organizationId,
      nextAction: null,
      allowExecution: false,
      stage: STAGES.SKIPPED
    };
  }

  if (typeof logStage === "function") {
    logStage(STAGES.ATTEMPTED, {
      phone: normalized.phone || prospect.phone || null,
      organizationId,
      agentId: actingUserId,
      providerMessageId: normalized.providerMessageId || null
    });
  }

  // BR-114 authoring uses BR-111 execution canary; BR-112 live_ce path stays separate.
  const allowExecution = resolveAllowExecutionForAuthoringTurn({
    env,
    invocationSource: "live_whatsapp",
    organizationId,
    actingUserId,
    grant
  });

  const persistence =
    persistenceService ||
    dependencies.persistenceService ||
    createDefaultPersistenceService();

  // Implements BR-120 — durable context keys on core UUID; dual-load legacy-keyed actives.
  const prospectPhone = prospect.phone || normalized.phone || null;
  let canonicalProspectId = prospect.id || null;
  let legacyProspectId = prospect.id || null;
  try {
    const identity = await resolveCanonicalProspectIdentity({
      phone: prospectPhone,
      organizationId,
      displayName: prospect.name || null,
      legacyProspectId: prospect.id || null,
      ensureCore: true
    });
    if (identity.ok && identity.coreProspectId) {
      canonicalProspectId = identity.coreProspectId;
    }
    if (identity.legacyProspectId) {
      legacyProspectId = identity.legacyProspectId;
    }
    // Soft: authoring can continue on unresolved; persistence dual-load still helps.
    // Hard mismatch/ambiguity already encoded in identity.reasonCode — still prefer legacy.
  } catch {
    // Fail soft to legacy id — persistence dual-load still helps when phone is present.
  }

  const workflowState =
    dependencies.workflowState !== undefined
      ? dependencies.workflowState
      : await loadPersistedWorkflowState(prospectPhone, {
          organizationId,
          prospectId: canonicalProspectId
        }).catch(() => null);

  const tenantOffice = await hydrateTenantOfficeIdentity(organizationId, dependencies);
  const { loadTenantCoverageCities } = require("../recruitingCoverage");
  const tenantCoverage = await loadTenantCoverageCities(organizationId, {
    getRecruitingConfig: dependencies.getRecruitingConfig
  });
  const contextInput = buildReconstructionInput(prospect, {
    organizationId,
    organizationName: tenantOffice.organizationName,
    officeAddress: tenantOffice.officeAddress,
    officeAddressSource: tenantOffice.officeAddressSource,
    localCities: tenantCoverage.localCities,
    coverageCitiesSource: tenantCoverage.coverageCitiesSource,
    prospectId: canonicalProspectId,
    prospectPhone,
    legacyProspectId,
    timezone: "America/New_York",
    ctwaReferral: normalized.ctwaReferral || null,
    conversationGoal: prospect.lead_source?.conversationGoal || prospect.conversationGoal || null,
    campaignKind: prospect.lead_source?.campaignKind || prospect.campaignKind || null,
    leadSource: prospect.lead_source || prospect.leadSource || null,
    workflowState,
    campaignIntakePurpose:
      normalized.campaignIntakeMatch?.purpose ||
      null,
    campaignIntakeMatch: normalized.campaignIntakeMatch || null
  });

  try {
    const heldContext = await persistence.loadContext({
      organizationId,
      prospectId: canonicalProspectId,
      channel: "whatsapp",
      legacyProspectId,
      prospectPhone,
      ensureCore: false
    });
    if (
      contextRequiresHumanHold(heldContext) &&
      !hasExplicitReturnToAtlas(workflowState)
    ) {
      if (typeof logStage === "function") {
        logStage("recruit_ai_v2_human_required_hold_no_qualification", {
          phone: prospectPhone,
          organizationId,
          prospectId: canonicalProspectId,
          providerMessageId: normalized.providerMessageId || null,
          reason: HUMAN_REQUIRED_HOLD_REASON
        });
      }
      return humanRequiredHoldResult({
        reason: HUMAN_REQUIRED_HOLD_REASON,
        heldContext,
        actingUserId,
        organizationId
      });
    }
  } catch (error) {
    // Implements BR-170 — cannot prove the thread is not in HUMAN_REQUIRED.
    // Fail closed for this turn only; do not author or fall through to CE.
    if (typeof logStage === "function") {
      logStage("recruit_ai_v2_human_required_hold_unresolved_no_qualification", {
        phone: prospectPhone,
        organizationId,
        prospectId: canonicalProspectId,
        providerMessageId: normalized.providerMessageId || null,
        reason: HUMAN_REQUIRED_HOLD_UNRESOLVED_REASON,
        code: error?.code || null,
        message: error?.message || "HOLD_CONTEXT_UNAVAILABLE"
      });
    }
    return humanRequiredHoldResult({
      reason: HUMAN_REQUIRED_HOLD_UNRESOLVED_REASON,
      actingUserId,
      organizationId
    });
  }

  try {
    const v2Result = await withTimeout(
      processTurn({
        message: {
          id: normalized.providerMessageId || null,
          providerMessageId: normalized.providerMessageId || null,
          text: String(normalized.text || "").trim(),
          // Implements BR-118 — structured WhatsApp media type for dialogue guard.
          messageType: normalized.messageType || null,
          interactiveReply: normalized.interactiveReply || null,
          campaignIntakeMatch: normalized.campaignIntakeMatch || null
        },
        contextInput,
        persistenceService: persistence,
        options: {
          channel: "whatsapp",
          flexible: true,
          allowExecution,
          persistContext: true,
          ensureCoreIdentity: true,
          env,
          actingUserId,
          agentId: actingUserId,
          organizationId,
          v2Grant: grant,
          prospectPhone,
          legacyProspectId,
          inboundMessageId: normalized.providerMessageId || null,
          messageType: normalized.messageType || null,
          campaignIntakeMatch: normalized.campaignIntakeMatch || null,
          dependencies: {
            // Prefer injected getSlots (tests); production uses orchestrator default
            // → appointmentApplicationService.getSlots → Sprint 22 engine.
            ...(dependencies || {})
          }
        }
      }),
      eligibility.config.timeoutMs,
      "LIVE_AUTHORING_TIMEOUT"
    );

    const replyText = extractAuthoredReplyText(v2Result);
    const nextAction =
      v2Result?.structuredDecision?.decision?.nextAction || null;
    const executionSuccess = Boolean(
      v2Result?.execution?.success && v2Result?.execution?.appointmentId
    );

    // After successful V2 create, V2 owns outbound + durable — never fall through to CE.
    if (executionSuccess) {
      let confirmedReply = replyText;
      if (!confirmedReply) {
        const { renderCustomerReply } = require("./responseRenderer");
        const performed = v2Result.execution.performed?.[0] || {};
        const lang =
          v2Result.nextContext?.preferredLanguage ||
          v2Result.context?.preferredLanguage ||
          "spanish";
        confirmedReply = extractAuthoredReplyText({
          rendered: renderCustomerReply({
            templateKey: "appointment_confirmed",
            language: lang,
            organizationId:
              v2Result.nextContext?.organizationId ||
              v2Result.context?.organizationId ||
              organizationId ||
              null,
            organizationName:
              v2Result.nextContext?.organizationName ||
              v2Result.context?.organizationName ||
              null,
            entities: {
              dateLabel:
                performed.dateKey ||
                v2Result.nextContext?.appointment?.confirmedDate ||
                null,
              requestedTime:
                performed.timeKey ||
                v2Result.nextContext?.appointment?.confirmedTime ||
                null
            }
          })
        });
      }

      if (typeof logStage === "function") {
        logStage(STAGES.USED, {
          phone: normalized.phone || prospect.phone || null,
          organizationId,
          agentId: actingUserId,
          nextAction,
          allowExecution,
          executionOwned: true,
          providerMessageId: normalized.providerMessageId || null
        });
      }

      return {
        eligible: true,
        authored: true,
        fallThrough: false,
        reason: null,
        replyText: confirmedReply,
        v2Result,
        actingUserId,
        organizationId,
        nextAction,
        allowExecution,
        stage: STAGES.USED
      };
    }

    if (!replyText) {
      const protectedReply = await reclaimOrProtectConfirmableProposal({
        v2Result,
        prospect,
        normalized,
        organizationId,
        actingUserId,
        allowExecution,
        persistence,
        findActiveAppointment: dependencies.findActiveAppointmentForProspect,
        logStage,
        env
      });
      if (protectedReply) {
        return protectedReply;
      }

      if (typeof logStage === "function") {
        logStage(STAGES.FALLBACK, {
          level: "warn",
          phone: normalized.phone || prospect.phone || null,
          organizationId,
          agentId: actingUserId,
          reason: "EMPTY_OR_UNSAFE_REPLY",
          nextAction
        });
      }
      if (nextAction === "create_appointment") {
        try {
          const { EVENTS, emitRecruitAiV2Signal } = require("./stage1Observability");
          emitRecruitAiV2Signal(
            EVENTS.CE_FALLTHROUGH_AFTER_V2_OWNERSHIP,
            {
              organizationId,
              agentId: actingUserId,
              phone: normalized.phone || prospect.phone || null,
              decisionCode: nextAction,
              correlationId: normalized.providerMessageId || null,
              allowExecution,
              reasonCodes: ["EMPTY_OR_UNSAFE_REPLY"],
              outcome: "ce_fallthrough"
            },
            { logStage }
          );
        } catch {
          // ignore
        }
      }
      return {
        eligible: true,
        authored: false,
        fallThrough: true,
        reason: "EMPTY_OR_UNSAFE_REPLY",
        replyText: null,
        v2Result,
        actingUserId,
        organizationId,
        nextAction,
        allowExecution,
        stage: STAGES.FALLBACK
      };
    }

    // Valid conversational decisions (incl. clarify_once) are SUCCESS — not fallback.
    if (typeof logStage === "function") {
      logStage(STAGES.USED, {
        phone: normalized.phone || prospect.phone || null,
        organizationId,
        agentId: actingUserId,
        nextAction,
        allowExecution,
        providerMessageId: normalized.providerMessageId || null
      });
    }

    return {
      eligible: true,
      authored: true,
      fallThrough: false,
      reason: null,
      replyText,
      v2Result,
      actingUserId,
      organizationId,
      nextAction,
      allowExecution,
      stage: STAGES.USED
    };
  } catch (error) {
    const reason =
      error?.code === "LIVE_AUTHORING_TIMEOUT"
        ? "LIVE_AUTHORING_TIMEOUT"
        : "LIVE_AUTHORING_TECHNICAL_FAILURE";

    const protectedReply = await reclaimOrProtectConfirmableProposal({
      error,
      prospect,
      normalized,
      organizationId,
      actingUserId,
      allowExecution,
      persistence,
      findActiveAppointment: dependencies.findActiveAppointmentForProspect,
      logStage,
      env
    });
    if (protectedReply) {
      // Implements BR-219 — booking continues after the 8s authoring wait.
      try {
        const { isIulPolicyReviewContext } = require("./iulSchedulingOwnership");
        const held =
          protectedReply.v2Result?.nextContext ||
          contextInput ||
          null;
        if (
          reason === "LIVE_AUTHORING_TIMEOUT" &&
          isIulPolicyReviewContext(held)
        ) {
          const { scheduleIulBookingFollowUp } = require("./iulBookingFollowUp");
          scheduleIulBookingFollowUp({
            error,
            prospect,
            normalized,
            organizationId,
            actingUserId,
            env,
            logStage,
            deliverReply: dependencies.deliverIulFollowUp || null
          });
        }
      } catch {
        // Follow-up scheduling must never block the deferred acknowledgement.
      }
      return protectedReply;
    }

    // Implements BR-219 — IUL create timeout sends deferred immediately, no CE.
    try {
      const {
        isIulPolicyReviewContext,
        isIulSchedulingOwnedState,
        resolveIulSelectedSlotFromInbound,
        buildIulDeferredAcknowledgement
      } = require("./iulSchedulingOwnership");
      const loadedForIul =
        (typeof error.getLateResult === "function"
          ? error.getLateResult()?.nextContext || error.getLateResult()?.context
          : null) || contextInput;
      if (
        reason === "LIVE_AUTHORING_TIMEOUT" &&
        isIulPolicyReviewContext(loadedForIul) &&
        (isIulSchedulingOwnedState(loadedForIul) ||
          normalized.interactiveReply?.id)
      ) {
        const slot = resolveIulSelectedSlotFromInbound(loadedForIul, {
          text: normalized.text,
          interactiveReply: normalized.interactiveReply
        });
        const replyText = buildIulDeferredAcknowledgement({
          language:
            loadedForIul.preferredLanguage === "english" ||
            loadedForIul.preferredLanguage === "en"
              ? "en"
              : "es",
          slot,
          context: loadedForIul,
          officeAddress: loadedForIul.knownFacts?.reviewOfficeAddress || null
        });
        if (replyText) {
          const { scheduleIulBookingFollowUp } = require("./iulBookingFollowUp");
          scheduleIulBookingFollowUp({
            error,
            prospect,
            normalized,
            organizationId,
            actingUserId,
            env,
            logStage,
            deliverReply: dependencies.deliverIulFollowUp || null
          });
          return {
            eligible: true,
            authored: true,
            fallThrough: false,
            reason: null,
            replyText,
            v2Result: {
              nextContext: loadedForIul,
              customerReplyPlan: { templateKey: "iul_confirm_review_deferred" }
            },
            actingUserId,
            organizationId,
            nextAction: "iul_create_review_appointment",
            allowExecution,
            stage: STAGES.OWNED_CONFIRMABLE_PROPOSAL
          };
        }
      }
    } catch {
      // Fall through to existing late-recovery / BR-167 handling.
    }

    // Implements BR-168 — recover a late-settled safe conversational reply
    // instead of BR-167 silence when processTurn finished after the 8s budget.
    let lateRecovered = null;
    if (reason === "LIVE_AUTHORING_TIMEOUT") {
      lateRecovered = await recoverLateSettledAuthoringReply({
        error,
        prospect,
        normalized,
        organizationId,
        actingUserId,
        allowExecution,
        env,
        logStage
      });
      if (lateRecovered?.authored && lateRecovered.replyText) {
        return lateRecovered;
      }
    }

    if (typeof logStage === "function") {
      logStage(STAGES.FALLBACK, {
        level: "warn",
        phone: normalized.phone || prospect.phone || null,
        organizationId,
        agentId: actingUserId,
        reason,
        error: String(error?.message || error).slice(0, 200)
      });
    }
    try {
      const lateNext =
        (typeof error?.getLateResult === "function"
          ? error.getLateResult()?.structuredDecision?.decision?.nextAction
          : null) || null;
      if (
        reason === "LIVE_AUTHORING_TIMEOUT" ||
        lateNext === "create_appointment"
      ) {
        const { EVENTS, emitRecruitAiV2Signal } = require("./stage1Observability");
        emitRecruitAiV2Signal(
          EVENTS.CE_FALLTHROUGH_AFTER_V2_OWNERSHIP,
          {
            organizationId,
            agentId: actingUserId,
            phone: normalized.phone || prospect.phone || null,
            decisionCode: lateNext || "create_appointment",
            correlationId: normalized.providerMessageId || null,
            allowExecution,
            reasonCodes: [reason],
            outcome: "ce_fallthrough"
          },
          { logStage }
        );
      }
    } catch {
      // ignore
    }

    return {
      eligible: true,
      authored: false,
      fallThrough: true,
      reason,
      replyText: null,
      v2Result: lateRecovered?.v2Result || null,
      actingUserId,
      organizationId,
      nextAction: lateRecovered?.nextAction || null,
      allowExecution,
      stage: STAGES.FALLBACK,
      lateResultReason: lateRecovered?.reason || null
    };
  }
}

module.exports = {
  STAGES,
  POST_TIMEOUT_GRACE_MS,
  POST_TIMEOUT_GRACE_MS_ENV,
  attemptLiveV2Authoring,
  extractAuthoredReplyText,
  withTimeout,
  awaitLateTrackedResult,
  recoverLateSettledAuthoringReply,
  resolvePostTimeoutGraceMs,
  reclaimOwnershipAfterAuthoringLoss,
  ownConfirmableProposalAfterAuthoringLoss,
  reclaimOrProtectConfirmableProposal,
  isConfirmableProposedDurable,
  createDefaultPersistenceService,
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect,
  resolveLiveAuthoringConfig: require("./liveAuthoringConfig").resolveLiveAuthoringConfig,
  isLiveAuthoringFlagEnabled: require("./liveAuthoringConfig").isLiveAuthoringFlagEnabled,
  HUMAN_REQUIRED_HOLD_REASON,
  HUMAN_REQUIRED_HOLD_UNRESOLVED_REASON
};
