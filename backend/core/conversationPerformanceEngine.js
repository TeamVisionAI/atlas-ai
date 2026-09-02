/**
 * BR-205 — Conversation Performance counts.
 * Eligibility first (same provenance as Conversations / Prospect Center / MC),
 * then exactly one of ATLAS / HUMAN / NEEDS_ATTENTION.
 * Does not infer status from provenance. Average response time is unsupported.
 */

const {
  evaluateOperationalProspectRecord
} = require("./prospectPromotionEligibility");
const {
  evaluateRecruitingInboxEligibility
} = require("./conversationsCenter/conversationsCenterInboxEligibility");
const {
  resolveConversationOwnershipState
} = require("./conversationsCenter/conversationsCenterOwnershipService");
const {
  CONVERSATION_OWNERSHIP_STATE
} = require("./conversationsCenter/constants");
const {
  resolveInboxLifecycle,
  isActiveInboxLifecycle,
  INBOX_LIFECYCLE
} = require("./conversationsCenter/conversationsCenterLifecycle");
const { workflowStateFromProspectRow } = require("./workflowStateStore");

function emptyCounts() {
  return {
    atlas: 0,
    human: 0,
    needsAttention: 0,
    total: 0,
    averageResponseTimeMs: null,
    excluded: 0,
    exclusions: {},
    members: []
  };
}

function prospectIdentityKey(prospect = {}) {
  return String(prospect.id || prospect.phone || "").trim();
}

function persistedFromProspect(prospect = {}) {
  if (prospect.id && prospect.organization_id) {
    return workflowStateFromProspectRow(prospect);
  }
  const raw = prospect.workflow_state;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function evaluateConversationPerformanceEligibility(prospect = null) {
  if (!prospect) {
    return { eligible: false, reason: "MISSING_PROSPECT" };
  }
  if (!prospect.phone && !prospect.id) {
    return { eligible: false, reason: "CONTACT_ONLY" };
  }

  const persisted = persistedFromProspect(prospect);
  const operational = evaluateOperationalProspectRecord(prospect, persisted);
  if (!operational.operational) {
    return { eligible: false, reason: operational.reason || "NOT_OPERATIONAL" };
  }

  const inbox = evaluateRecruitingInboxEligibility(prospect, persisted);
  if (!inbox.eligible) {
    return { eligible: false, reason: inbox.reason || "NOT_RECRUITING_ORIGIN" };
  }

  return { eligible: true, reason: inbox.reason || operational.reason, persisted };
}

function classifyConversationPerformanceStatus(persisted = {}) {
  return resolveConversationOwnershipState(persisted);
}

function isConversationPerformanceMember(prospect, persisted = {}) {
  const lifecycleInfo = resolveInboxLifecycle({
    prospect,
    persisted,
    customerCareWindow: null
  });
  if (lifecycleInfo.lifecycle === INBOX_LIFECYCLE.TEST) {
    return { member: false, reason: "TEST", lifecycle: lifecycleInfo.lifecycle };
  }
  if (!isActiveInboxLifecycle(lifecycleInfo.lifecycle)) {
    return {
      member: false,
      reason: `INBOX_${lifecycleInfo.lifecycle}`,
      lifecycle: lifecycleInfo.lifecycle
    };
  }
  return { member: true, reason: null, lifecycle: lifecycleInfo.lifecycle };
}

function incrementExclusion(exclusions, reason) {
  const key = reason || "UNKNOWN";
  exclusions[key] = (exclusions[key] || 0) + 1;
}

/**
 * Count operationally eligible Active conversations for the Conversation Performance card.
 * @param {object[]} prospects tenant-scoped prospect rows
 */
function buildConversationPerformanceCounts(prospects = []) {
  const counts = emptyCounts();
  const seen = new Set();

  for (const prospect of prospects || []) {
    const key = prospectIdentityKey(prospect);
    if (key && seen.has(key)) {
      incrementExclusion(counts.exclusions, "DUPLICATE_IDENTITY");
      counts.excluded += 1;
      continue;
    }
    if (key) {
      seen.add(key);
    }

    const eligibility = evaluateConversationPerformanceEligibility(prospect);
    if (!eligibility.eligible) {
      incrementExclusion(counts.exclusions, eligibility.reason);
      counts.excluded += 1;
      continue;
    }

    const membership = isConversationPerformanceMember(prospect, eligibility.persisted);
    if (!membership.member) {
      incrementExclusion(counts.exclusions, membership.reason);
      counts.excluded += 1;
      continue;
    }

    const status = classifyConversationPerformanceStatus(eligibility.persisted);
    if (status === CONVERSATION_OWNERSHIP_STATE.HUMAN) {
      counts.human += 1;
    } else if (status === CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION) {
      counts.needsAttention += 1;
    } else {
      counts.atlas += 1;
    }

    counts.members.push({
      key: key || prospect.phone,
      status
    });
  }

  counts.total = counts.atlas + counts.human + counts.needsAttention;
  return counts;
}

/**
 * Legacy Mission Control queue classification — sticky HUMAN wins, then attention.
 * Used only when prospect rows are not available. Does not apply eligibility.
 */
function classifyQueueSummary(summary = {}) {
  return resolveConversationOwnershipState({
    needsHumanAttention: summary.needsHumanAttention,
    manualAgentOwnership: summary.manualAgentOwnership,
    humanTakenOverAt: summary.humanTakenOverAt,
    workflowOwnership: summary.workflowOwnership
  });
}

module.exports = {
  evaluateConversationPerformanceEligibility,
  classifyConversationPerformanceStatus,
  classifyQueueSummary,
  isConversationPerformanceMember,
  buildConversationPerformanceCounts
};
