"use strict";

/**
 * BR-166 — Global pre-send conversation coherence guard.
 *
 * Scope is tenant-agnostic: every Recruit AI v2 live WhatsApp reply is checked
 * against the newest durable context immediately before transport sends it.
 *
 * Invariants:
 * - newer durable context wins over an older authored turn;
 * - Atlas must not ask for a qualification fact already resolved durably;
 * - tenant/prospect scope is explicit; no phone-only lookup;
 * - guard failures fail closed for v2 live authoring rather than sending a
 *   potentially incoherent reply or handing the stale reply to legacy CE.
 */

const {
  resolveFaqResumeTemplateKeyFromFacts,
  factsAheadOfLastQuestion
} = require("../recruitConversationSequencing");
const { createContextPersistenceService } = require("./contextPersistenceService");
const {
  createSupabaseContextRepository,
  createMemoryContextRepository
} = require("./contextRepository");

const REASONS = Object.freeze({
  NOT_V2: "COHERENCE_NOT_V2",
  OK: "COHERENCE_OK",
  SCOPE_MISSING: "COHERENCE_SCOPE_MISSING",
  CONTEXT_UNAVAILABLE: "COHERENCE_CONTEXT_UNAVAILABLE",
  STALE_OUTBOUND: "COHERENCE_STALE_OUTBOUND",
  RESOLVED_FACT_REASK: "COHERENCE_RESOLVED_FACT_REASK",
  GUARD_ERROR: "COHERENCE_GUARD_ERROR"
});

const SEQUENCED_QUESTION_KEYS = new Set([
  "ask_location",
  "greeting_ask_location",
  "ask_city",
  "ask_state",
  "confirm_location",
  "ask_authorization",
  "continue_qualification_after_location",
  "ask_day_part",
  "ask_day_part_simple",
  "continue_qualification_after_authorization",
  "ask_time_preference",
  "ask_time_after_day_part",
  "ask_time_after_constraint",
  "acknowledge_morning_ask_time",
  "acknowledge_afternoon_ask_time",
  "explain_pending_time",
  "offer_time_choices",
  "confirm_slot",
  "awaiting_availability",
  "clarify_license_type"
]);

function isV2Owned(engineResult = {}) {
  return (
    engineResult?.source === "recruit_ai_v2_live_authoring" ||
    engineResult?.owner === "v2"
  );
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

function toVersion(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isResolvedAuthorization(facts = {}) {
  const status = String(facts.workAuthorizationStatus || "").toLowerCase();
  return (
    facts.workAuthorization === true ||
    facts.workAuthorization === false ||
    status === "authorized" ||
    status === "not_authorized"
  );
}

function locationResolved(facts = {}) {
  return Boolean(facts.city && facts.state);
}

function timeResolved(context = {}) {
  return Boolean(
    context?.appointment?.proposedTime ||
    context?.appointment?.confirmedTime ||
    context?.knownFacts?.requestedTime
  );
}

/**
 * Explicit semantic checks complement the sequencing rank. Keep this table
 * domain-level, never tenant/user specific.
 */
function asksAlreadyResolvedFact(questionKey, latestContext = {}) {
  const key = String(questionKey || "");
  const facts = latestContext.knownFacts || {};

  if (!key) {
    return false;
  }

  if (
    ["ask_location", "greeting_ask_location", "confirm_location"].includes(key)
  ) {
    return locationResolved(facts);
  }
  if (key === "ask_city") {
    return Boolean(facts.city);
  }
  if (key === "ask_state") {
    return Boolean(facts.state);
  }
  if (
    ["ask_authorization", "continue_qualification_after_location"].includes(key)
  ) {
    return isResolvedAuthorization(facts);
  }
  if (
    [
      "ask_day_part",
      "ask_day_part_simple",
      "continue_qualification_after_authorization"
    ].includes(key)
  ) {
    return Boolean(facts.preferredDayPart);
  }
  if (
    [
      "ask_time_preference",
      "ask_time_after_day_part",
      "ask_time_after_constraint",
      "acknowledge_morning_ask_time",
      "acknowledge_afternoon_ask_time"
    ].includes(key)
  ) {
    return timeResolved(latestContext);
  }

  return false;
}

/**
 * Inspect what the turn actually authored, not the post-save nextContext. BR-164
 * may repair nextContext.lastQuestionAsked during persistence, while rendered
 * copy from the stale decision is still waiting to be sent.
 */
function resolveAuthoredQuestionKey(engineResult = {}) {
  const v2 = engineResult.v2Result || {};
  return (
    v2.structuredDecision?.contextPatch?.conversation?.lastQuestionAsked ||
    v2.structuredDecision?.customerReplyPlan?.templateKey ||
    v2.responsePlan?.templateKey ||
    v2.nextContext?.conversation?.lastQuestionAsked ||
    null
  );
}

function evaluateAgainstLatestContext({
  engineResult = {},
  latestContext = null,
  currentInboundMessageId = null
} = {}) {
  if (!isV2Owned(engineResult)) {
    return { allowed: true, reason: REASONS.NOT_V2 };
  }
  if (!latestContext) {
    return { allowed: false, reason: REASONS.CONTEXT_UNAVAILABLE };
  }

  const v2 = engineResult.v2Result || {};
  const authoredContext = v2.nextContext || v2.context || null;
  const authoredVersion = toVersion(
    authoredContext?._persistence?.contextVersion ??
      v2.persistence?.result?.contextVersion
  );
  const latestVersion = toVersion(latestContext?._persistence?.contextVersion);
  const latestProcessed = latestContext?._persistence?.lastProcessedMessageId || null;

  // A later inbound has already advanced the durable row. Never let this older
  // turn speak after the newer state won.
  if (
    authoredVersion != null &&
    latestVersion != null &&
    latestVersion > authoredVersion
  ) {
    return {
      allowed: false,
      reason: REASONS.STALE_OUTBOUND,
      authoredVersion,
      latestVersion,
      latestProcessedMessageId: latestProcessed
    };
  }

  // Defensive message-id check for stores where version metadata is unavailable.
  if (
    currentInboundMessageId &&
    latestProcessed &&
    authoredVersion == null &&
    latestProcessed !== currentInboundMessageId
  ) {
    return {
      allowed: false,
      reason: REASONS.STALE_OUTBOUND,
      authoredVersion,
      latestVersion,
      latestProcessedMessageId: latestProcessed
    };
  }

  const questionKey = resolveAuthoredQuestionKey(engineResult);
  const factResume = resolveFaqResumeTemplateKeyFromFacts(
    latestContext.knownFacts || {}
  );
  // Only apply BR-164's rank comparison to keys that belong to that sequence.
  // Unknown scheduling/dialogue keys (for example ask_date) must not be treated
  // as rank 0 and falsely suppressed.
  const rankRegressed =
    SEQUENCED_QUESTION_KEYS.has(String(questionKey || "")) &&
    factsAheadOfLastQuestion(questionKey, factResume);
  const semanticReask = asksAlreadyResolvedFact(questionKey, latestContext);

  if (rankRegressed || semanticReask) {
    return {
      allowed: false,
      reason: REASONS.RESOLVED_FACT_REASK,
      questionKey,
      nextUnresolvedQuestion: factResume?.lastQuestionAsked || null,
      authoredVersion,
      latestVersion
    };
  }

  return {
    allowed: true,
    reason: REASONS.OK,
    questionKey,
    authoredVersion,
    latestVersion
  };
}

async function guardOutboundConversationCoherence({
  normalized = {},
  prospect = {},
  engineResult = {},
  persistenceService = null
} = {}) {
  if (!isV2Owned(engineResult)) {
    return { allowed: true, reason: REASONS.NOT_V2 };
  }

  const organizationId =
    prospect.organization_id || prospect.organizationId || null;
  const v2 = engineResult.v2Result || {};
  const prospectId =
    v2.nextContext?.prospectId ||
    v2.context?.prospectId ||
    prospect.id ||
    null;

  if (!organizationId || !prospectId) {
    return { allowed: false, reason: REASONS.SCOPE_MISSING };
  }

  const persistence = persistenceService || createDefaultPersistenceService();
  try {
    const latestContext = await persistence.loadContext({
      organizationId,
      prospectId,
      channel: normalized.channel || "whatsapp",
      legacyProspectId: prospect.id || null,
      prospectPhone: prospect.phone || normalized.phone || null,
      ensureCore: false
    });

    return evaluateAgainstLatestContext({
      engineResult,
      latestContext,
      currentInboundMessageId: normalized.providerMessageId || null
    });
  } catch (error) {
    return {
      allowed: false,
      reason: REASONS.GUARD_ERROR,
      code: error?.code || null
    };
  }
}

module.exports = {
  REASONS,
  SEQUENCED_QUESTION_KEYS,
  isV2Owned,
  isResolvedAuthorization,
  asksAlreadyResolvedFact,
  resolveAuthoredQuestionKey,
  evaluateAgainstLatestContext,
  guardOutboundConversationCoherence,
  createDefaultPersistenceService
};
