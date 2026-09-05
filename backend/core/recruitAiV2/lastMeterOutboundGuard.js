/**
 * BR-237 — Last-meter automated outbound guard.
 * Runs immediately before Graph send. Suppresses stale and HUMAN-owned replies.
 */

"use strict";

const { REASONS } = require("./globalConversationCoherenceGuard");
const { logWhatsAppStage } = require("../whatsappStructuredLogger");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("../workflowStateStore");
const { EVENTS, emitRecruitAiV2Signal } = require("./stage1Observability");

const LAST_INBOUND_ID_FIELD = "lastProspectInboundProviderMessageId";
const LAST_INBOUND_AT_FIELD = "lastProspectInboundAt";

function isDurableHumanSeal(workflow = {}) {
  return (
    workflow.manualAgentOwnership === true || Boolean(workflow.humanTakenOverAt)
  );
}

function toTime(value) {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function resolveAuthoredInboundId(options = {}) {
  return (
    options.authoredInboundProviderMessageId ||
    options.normalized?.providerMessageId ||
    options.engineResult?.authoredInboundProviderMessageId ||
    options.engineResult?.v2Result?.inboundMessageId ||
    null
  );
}

function resolveAuthoredVersion(engineResult = {}) {
  const v2 = engineResult.v2Result || {};
  const n = Number(
    v2.nextContext?._persistence?.contextVersion ??
      v2.context?._persistence?.contextVersion ??
      v2.persistence?.result?.contextVersion ??
      engineResult.contextVersion
  );
  return Number.isFinite(n) ? n : null;
}

function resolveLatestInbound(workflow = {}, latestContext = null) {
  const fromWorkflowId = workflow[LAST_INBOUND_ID_FIELD] || null;
  const fromWorkflowAt = workflow[LAST_INBOUND_AT_FIELD] || null;
  const fromContextId =
    latestContext?._persistence?.lastProcessedMessageId || null;
  const fromContextVersion = Number(
    latestContext?._persistence?.contextVersion
  );
  return {
    latestInboundProviderMessageId: fromWorkflowId || fromContextId || null,
    latestInboundAt: fromWorkflowAt || null,
    latestVersion: Number.isFinite(fromContextVersion) ? fromContextVersion : null
  };
}

/**
 * Newer inbound exists than the one this reply was authored from.
 * Missing version is not permission to send.
 */
function evaluateStaleInbound({
  authoredInboundProviderMessageId = null,
  authoredInboundAt = null,
  authoredVersion = null,
  latestInboundProviderMessageId = null,
  latestInboundAt = null,
  latestVersion = null
} = {}) {
  const authoredId = String(authoredInboundProviderMessageId || "").trim();
  const latestId = String(latestInboundProviderMessageId || "").trim();

  if (authoredId && latestId && latestId !== authoredId) {
    return {
      stale: true,
      reason: REASONS.STALE_OUTBOUND,
      authoredInboundProviderMessageId: authoredId,
      latestInboundProviderMessageId: latestId,
      authoredVersion,
      latestVersion
    };
  }

  const authoredTs = toTime(authoredInboundAt);
  const latestTs = toTime(latestInboundAt);
  if (authoredTs != null && latestTs != null && latestTs > authoredTs) {
    if (!authoredId || !latestId || latestId !== authoredId) {
      return {
        stale: true,
        reason: REASONS.STALE_OUTBOUND,
        authoredInboundProviderMessageId: authoredId || null,
        latestInboundProviderMessageId: latestId || null,
        authoredVersion,
        latestVersion
      };
    }
  }

  if (
    authoredVersion != null &&
    latestVersion != null &&
    latestVersion > authoredVersion &&
    authoredId &&
    latestId &&
    latestId !== authoredId
  ) {
    return {
      stale: true,
      reason: REASONS.STALE_OUTBOUND,
      authoredInboundProviderMessageId: authoredId,
      latestInboundProviderMessageId: latestId,
      authoredVersion,
      latestVersion
    };
  }

  return {
    stale: false,
    reason: REASONS.OK,
    authoredInboundProviderMessageId: authoredId || null,
    latestInboundProviderMessageId: latestId || null,
    authoredVersion,
    latestVersion
  };
}

function emitStaleSuppressed(fields = {}) {
  emitRecruitAiV2Signal(EVENTS.REPLY_SUPPRESSED_STALE, {
    organizationId: fields.organizationId || null,
    prospectId: fields.prospectId || null,
    authoredInboundProviderMessageId: fields.authoredInboundProviderMessageId || null,
    latestInboundProviderMessageId: fields.latestInboundProviderMessageId || null,
    authoredVersion: fields.authoredVersion ?? null,
    latestVersion: fields.latestVersion ?? null,
    reason: fields.reason || REASONS.STALE_OUTBOUND,
    outcome: "suppressed",
    correlationId: fields.authoredInboundProviderMessageId || null
  });
}

function emitHumanOwnedSuppressed(fields = {}) {
  emitRecruitAiV2Signal(EVENTS.REPLY_SUPPRESSED_HUMAN_OWNED, {
    organizationId: fields.organizationId || null,
    prospectId: fields.prospectId || null,
    ownershipState: fields.ownershipState || "HUMAN",
    humanTakenOverAt: fields.humanTakenOverAt || null,
    handoffReason: fields.handoffReason || null,
    outcome: "suppressed"
  });
}

/**
 * Record the latest prospect inbound so last-meter can see it even when
 * contextVersion / lastProcessedMessageId are still null.
 */
async function recordProspectInboundCoherenceMarker({
  phone = null,
  organizationId = null,
  prospectId = null,
  providerMessageId = null,
  inboundAt = null,
  saveWorkflowState = null
} = {}) {
  const inboundId = String(providerMessageId || "").trim();
  if (!phone || !inboundId) {
    return { ok: false, reason: "MISSING_INBOUND" };
  }
  const save = saveWorkflowState || savePersistedWorkflowState;
  try {
    await save(
      phone,
      {
        [LAST_INBOUND_ID_FIELD]: inboundId,
        [LAST_INBOUND_AT_FIELD]: inboundAt || new Date().toISOString()
      },
      { organizationId, prospectId }
    );
    return { ok: true };
  } catch (error) {
    logWhatsAppStage("recruit_ai_v2_inbound_coherence_marker_failed", {
      level: "warn",
      organizationId,
      prospectId,
      providerMessageId: inboundId,
      error: error?.message || "unknown"
    });
    return { ok: false, reason: error?.message || "MARKER_FAILED" };
  }
}

async function guardLastMeterAutomatedOutbound({
  actor = "ATLAS",
  prospect = {},
  normalized = {},
  engineResult = {},
  organizationId = null,
  inboundEvent = null,
  loadWorkflowState = null,
  latestContext = null
} = {}) {
  if (String(actor || "").toUpperCase() !== "ATLAS") {
    return { allowed: true, reason: "MANUAL_ACTOR" };
  }

  const orgId =
    organizationId ||
    prospect.organization_id ||
    prospect.organizationId ||
    null;
  const prospectId =
    prospect.id ||
    engineResult?.v2Result?.nextContext?.prospectId ||
    engineResult?.prospectId ||
    null;
  const phone = prospect.phone || normalized.phone || inboundEvent?.phone || null;

  const load = loadWorkflowState || loadPersistedWorkflowState;
  let workflow = {};
  try {
    workflow = phone
      ? await load(phone, { organizationId: orgId, prospectId })
      : {};
  } catch {
    workflow = {};
  }

  if (isDurableHumanSeal(workflow)) {
    const result = {
      allowed: false,
      reason: "HUMAN_OWNED",
      ownershipState: "HUMAN",
      humanTakenOverAt: workflow.humanTakenOverAt || null,
      handoffReason: workflow.handoffReason || null
    };
    emitHumanOwnedSuppressed({
      organizationId: orgId,
      prospectId,
      ...result
    });
    return result;
  }

  const authoredInboundProviderMessageId = resolveAuthoredInboundId({
    normalized: normalized.providerMessageId ? normalized : inboundEvent || normalized,
    engineResult,
    authoredInboundProviderMessageId:
      engineResult.authoredInboundProviderMessageId ||
      normalized.providerMessageId ||
      inboundEvent?.providerMessageId ||
      null
  });
  const latest = resolveLatestInbound(workflow, latestContext);
  const stale = evaluateStaleInbound({
    authoredInboundProviderMessageId,
    authoredInboundAt:
      engineResult.authoredInboundAt ||
      normalized.receivedAt ||
      inboundEvent?.receivedAt ||
      null,
    authoredVersion: resolveAuthoredVersion(engineResult),
    latestInboundProviderMessageId: latest.latestInboundProviderMessageId,
    latestInboundAt: latest.latestInboundAt,
    latestVersion: latest.latestVersion
  });

  if (stale.stale) {
    emitStaleSuppressed({
      organizationId: orgId,
      prospectId,
      ...stale
    });
    return {
      allowed: false,
      reason: stale.reason,
      ...stale
    };
  }

  return {
    allowed: true,
    reason: REASONS.OK,
    ...stale
  };
}

module.exports = {
  LAST_INBOUND_ID_FIELD,
  LAST_INBOUND_AT_FIELD,
  isDurableHumanSeal,
  evaluateStaleInbound,
  recordProspectInboundCoherenceMarker,
  guardLastMeterAutomatedOutbound,
  emitStaleSuppressed,
  emitHumanOwnedSuppressed
};
