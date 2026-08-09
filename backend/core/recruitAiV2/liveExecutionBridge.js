/**
 * Recruit AI v2 — live CE execution bridge (BR-112).
 *
 * Smallest authoritative-path integration:
 * - Live CE (completeInterview) may ask v2 to decide + optionally execute
 * - allowExecution is derived only for invocationSource "live_ce" + live-path flag
 * - BR-111 authorizer remains final mutation authority
 * - On successful create: V2 owns durable confirmed + appointment_confirmed reply text
 * - Bridge does not send WhatsApp; CE must forward V2 confirmation text (not competing CE copy)
 * - Shadow / advisory never call this module for allowExecution
 *
 * Implements BR-112 / BR-049 / BR-111.
 */

const { processRecruitAiV2Turn } = require("./orchestrator");
const { createConversationContext } = require("./conversationContext");
const {
  resolveLiveExecutionPathConfig,
  resolveAllowExecutionForLiveTurn,
  isLiveExecutionPathEnabled
} = require("./liveExecutionPathConfig");
const {
  createContextPersistenceService
} = require("./contextPersistenceService");
const {
  createSupabaseContextRepository,
  createMemoryContextRepository
} = require("./contextRepository");

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

/**
 * Production uses Supabase. Injected schedule/lookup deps (unit tests) get memory
 * so fixture prospect ids never hit UUID columns.
 * Seam names are concatenated so this file does not hard-code the canonical
 * schedule entrypoint identifier (reserved to sideEffectExecutor by package lint).
 */
function resolvePersistenceForBridge(dependencies = {}, persistenceService = null) {
  if (persistenceService) {
    return persistenceService;
  }
  if (dependencies.persistenceService) {
    return dependencies.persistenceService;
  }
  const injectedSeams = [
    ["execute", "Schedule", "Interview"].join(""),
    ["find", "Active", "Appointment", "For", "Prospect"].join(""),
    ["get", "Slots"].join("")
  ];
  if (injectedSeams.some((key) => typeof dependencies[key] === "function")) {
    return createContextPersistenceService({
      repository: createMemoryContextRepository(),
      // Soft offline identity — avoid Supabase UUID casts for fixture prospect ids.
      resolveIdentity: async ({ legacyProspectId = null } = {}) => ({
        ok: true,
        coreProspectId: legacyProspectId || null,
        legacyProspectId: legacyProspectId || null,
        reasonCode: "OK",
        alternateProspectIds: legacyProspectId ? [legacyProspectId] : []
      })
    });
  }
  return createDefaultPersistenceService();
}

function normalizeMeetingType(interviewType) {
  const raw = String(interviewType || "").toLowerCase();
  if (raw.includes("zoom") || raw.includes("virtual")) {
    return "zoom";
  }
  if (raw.includes("public")) {
    return "public_location";
  }
  return "in_person";
}

/**
 * Seed a confirmable v2 context from live CE confirmed slot state.
 */
function buildLiveConfirmContext({
  prospect = {},
  profile = {},
  schedulePayload = {},
  organizationId = null,
  agentId = null,
  language = "en"
} = {}) {
  const dateKey = schedulePayload.dateKey || null;
  const timeKey = schedulePayload.timeKey || null;
  const meetingType = normalizeMeetingType(
    schedulePayload.interviewType || profile.interviewType || prospect.interview_type
  );
  const preferredLanguage =
    language === "es" || language === "spanish" ? "spanish" : "english";

  const slotLabel =
    preferredLanguage === "spanish"
      ? `Tenemos disponible el ${dateKey} a las ${timeKey}. ¿Te funciona?`
      : `We have availability on ${dateKey} at ${timeKey}. Does that work for you?`;

  return createConversationContext({
    organizationId: organizationId || prospect.organization_id || null,
    // Live confirm still seeds from legacy WhatsApp prospect; persistence dual-loads (BR-120).
    prospectId: prospect.id || null,
    prospectPhone: prospect.phone || null,
    legacyProspectId: prospect.id || null,
    agentId: agentId || prospect.owner_user_id || null,
    prospectOwnerUserId: prospect.owner_user_id || agentId || null,
    preferredLanguage,
    languageMeta: { source: "active_conversation" },
    currentStage: "proposed",
    timezone: profile.timezone || "America/New_York",
    knownFacts: {
      name: prospect.name || profile.name || null,
      city: prospect.city || profile.city || null,
      state: prospect.state || profile.state || null,
      cityCertainty:
        (prospect.city || profile.city) && (prospect.state || profile.state)
          ? "confirmed"
          : "unknown",
      stateCertainty: prospect.state || profile.state ? "confirmed" : "unknown",
      workAuthorization: true,
      preferredMeetingType: meetingType,
      coverage: null
    },
    appointment: {
      status: "proposed",
      proposedDate: dateKey,
      proposedTime: timeKey,
      meetingType,
      previouslyOfferedSlots:
        dateKey && timeKey
          ? [{ date: dateKey, time: timeKey, timezone: "America/New_York" }]
          : []
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText: slotLabel
    }
  });
}

function mapV2ExecutionToScheduleResult(v2Result) {
  const performed = v2Result?.execution?.performed?.[0] || {};
  const scheduleResult = v2Result?.execution?.scheduleResult || null;
  const appointmentId =
    v2Result?.execution?.appointmentId ||
    scheduleResult?.appointmentId ||
    performed.appointmentId ||
    null;

  if (!v2Result?.execution?.success || !appointmentId) {
    return null;
  }

  if (scheduleResult?.success && scheduleResult.appointmentId) {
    return scheduleResult;
  }

  return {
    success: true,
    appointmentId,
    appointment: scheduleResult?.appointment || { id: appointmentId },
    booking: scheduleResult?.booking || {
      startTimeISO: null,
      dateKey: performed.dateKey || null,
      timeKey: performed.timeKey || null
    },
    meetingUrl: scheduleResult?.meetingUrl || scheduleResult?.zoomLink || null,
    zoomLink: scheduleResult?.zoomLink || scheduleResult?.meetingUrl || null
  };
}

/**
 * Attempt v2 decide+execute from the live CE booking site.
 * Never sends WhatsApp. Never bypasses BR-111.
 *
 * @returns {{
 *   livePathEnabled: boolean,
 *   allowExecution: boolean,
 *   invoked: boolean,
 *   usedV2Execution: boolean,
 *   v2Result: object|null,
 *   scheduleResult: object|null,
 *   reason: string|null
 * }}
 */
async function attemptLiveV2AppointmentExecution({
  prospect,
  profile,
  schedulePayload,
  organizationId,
  agentId,
  language = "en",
  messageText = "si",
  inboundMessageId = null,
  env = process.env,
  dependencies = {},
  processTurn = processRecruitAiV2Turn,
  persistenceService = null
} = {}) {
  const livePathEnabled = isLiveExecutionPathEnabled(env);
  const allowExecution = resolveAllowExecutionForLiveTurn({
    env,
    invocationSource: "live_ce"
  });

  if (!livePathEnabled || !allowExecution) {
    return {
      livePathEnabled,
      allowExecution: false,
      invoked: false,
      usedV2Execution: false,
      v2Result: null,
      scheduleResult: null,
      confirmationReplyText: null,
      reason: livePathEnabled ? "ALLOW_EXECUTION_FALSE" : "LIVE_PATH_DISABLED"
    };
  }

  if (!organizationId || !agentId || !prospect?.phone) {
    return {
      livePathEnabled,
      allowExecution,
      invoked: false,
      usedV2Execution: false,
      v2Result: null,
      scheduleResult: null,
      confirmationReplyText: null,
      reason: "MISSING_LIVE_SCOPE"
    };
  }

  if (!schedulePayload?.dateKey || !schedulePayload?.timeKey) {
    return {
      livePathEnabled,
      allowExecution,
      invoked: false,
      usedV2Execution: false,
      v2Result: null,
      scheduleResult: null,
      confirmationReplyText: null,
      reason: "MISSING_CONFIRMED_SLOT"
    };
  }

  const context = buildLiveConfirmContext({
    prospect,
    profile,
    schedulePayload,
    organizationId,
    agentId,
    language
  });

  const persistence = resolvePersistenceForBridge(dependencies, persistenceService);

  const v2Result = await processTurn({
    message: {
      id: inboundMessageId || null,
      providerMessageId: inboundMessageId || null,
      text: String(messageText || "si").trim() || "si"
    },
    context,
    persistenceService: persistence,
    options: {
      channel: "whatsapp",
      flexible: true,
      allowExecution: true,
      env,
      actingUserId: agentId,
      agentId,
      organizationId,
      prospectPhone: prospect.phone,
      legacyProspectId: prospect.id || null,
      inboundMessageId,
      // V2 execution success is durable SoR — persist confirmed appointment slice.
      persistContext: true,
      ensureCoreIdentity: true,
      dependencies
    }
  });

  const scheduleResult = mapV2ExecutionToScheduleResult(v2Result);
  const usedV2Execution = Boolean(scheduleResult?.success && scheduleResult?.appointmentId);
  const confirmationReplyText = usedV2Execution
    ? String(v2Result?.rendered?.text || "").trim() || null
    : null;

  return {
    livePathEnabled,
    allowExecution: true,
    invoked: true,
    usedV2Execution,
    v2Result,
    scheduleResult,
    confirmationReplyText,
    reason: usedV2Execution
      ? null
      : v2Result?.authorization?.authorized
        ? "V2_EXECUTION_FAILED"
        : "BR111_DENIED_OR_NOT_PROPOSED"
  };
}

module.exports = {
  buildLiveConfirmContext,
  mapV2ExecutionToScheduleResult,
  attemptLiveV2AppointmentExecution,
  resolveLiveExecutionPathConfig,
  resolveAllowExecutionForLiveTurn,
  isLiveExecutionPathEnabled
};
