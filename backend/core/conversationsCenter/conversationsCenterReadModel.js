/**
 * Conversations Center list / badge read model.
 * Reuses production prospects + workflow state + Communications Center history endpoint for threads.
 * Inbox lifecycle is DERIVED presentation — Active vs Scheduled/Closed/Test/Archived.
 */

const { loadPersistedWorkflowState } = require("../workflowStateStore");
const { OWNERSHIP } = require("../workflowConstants");
const {
  CONVERSATION_FILTERS,
  CONVERSATION_OWNERSHIP_STATE,
  TEAM_VISION_ORG_ID
} = require("./constants");
const { resolveConversationOwnershipState } = require("./conversationsCenterOwnershipService");
const { isProspectInNiovelPilotScope } = require("./conversationsCenterAccess");
const {
  isRecruitingConversationEligibleForInbox,
  resolveRecruitingInboxEligibility
} = require("./conversationsCenterInboxEligibility");
const {
  INBOX_LIFECYCLE,
  resolveInboxLifecycle,
  isActiveInboxLifecycle,
  isArchivedInboxBucket
} = require("./conversationsCenterLifecycle");
const {
  computeLastCommunication,
  computeUnreadState,
  activitySortMs,
  isRealWhatsAppCommunication
} = require("./conversationsUnreadEngine");
const { normalizePhoneNumber, formatPhoneForStorage } = require("../phoneNormalizer");

function loadProductionProspectsSafe(organizationId) {
  const {
    loadProductionProspects
  } = require("../executiveDashboardReadModel");
  return loadProductionProspects(organizationId);
}

function extractConversationGoal(prospect) {
  const lead = prospect?.lead_source && typeof prospect.lead_source === "object"
    ? prospect.lead_source
    : {};

  return (
    prospect?.conversation_goal ||
    lead.conversationGoal ||
    lead.conversation_goal ||
    lead.goal ||
    null
  );
}

function extractSource(prospect) {
  const lead = prospect?.lead_source && typeof prospect.lead_source === "object"
    ? prospect.lead_source
    : {};

  return prospect?.source || lead.source || prospect?.entry_method || null;
}

function phoneLookupKeys(phone) {
  const keys = new Set();
  const raw = String(phone || "").trim();
  if (raw) {
    keys.add(raw);
  }
  const digits = raw.replace(/\D/g, "");
  if (digits) {
    keys.add(digits);
    keys.add(`+${digits}`);
  }
  const normalized = normalizePhoneNumber(raw);
  if (normalized) {
    keys.add(formatPhoneForStorage(normalized));
  }
  return [...keys];
}

function logsForPhone(logsByPhone, phone) {
  if (!logsByPhone) {
    return [];
  }
  for (const key of phoneLookupKeys(phone)) {
    if (logsByPhone instanceof Map && logsByPhone.has(key)) {
      return logsByPhone.get(key) || [];
    }
    if (!(logsByPhone instanceof Map) && logsByPhone[key]) {
      return logsByPhone[key] || [];
    }
  }
  return [];
}

async function fetchConversationLogsByPhones(phones = [], organizationId = null) {
  const unique = [...new Set((phones || []).flatMap((phone) => phoneLookupKeys(phone)))];
  if (!unique.length) {
    return new Map();
  }

  const { supabase } = require("../../services/supabaseService");
  let query = supabase
    .from("conversation_logs")
    .select(
      "id, prospect_phone, direction, message, intent, pipeline, created_at, organization_id"
    )
    .in("prospect_phone", unique)
    .order("created_at", { ascending: false })
    .limit(Math.min(2000, unique.length * 80));

  if (organizationId) {
    query = query.or(
      `organization_id.eq.${organizationId},organization_id.is.null`
    );
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const grouped = new Map();
  for (const row of data || []) {
    const phone = row.prospect_phone;
    if (!phone) {
      continue;
    }
    if (
      organizationId &&
      row.organization_id &&
      String(row.organization_id) !== String(organizationId)
    ) {
      continue;
    }
    const list = grouped.get(phone) || [];
    list.push(row);
    grouped.set(phone, list);
    for (const alias of phoneLookupKeys(phone)) {
      if (!grouped.has(alias)) {
        grouped.set(alias, list);
      }
    }
  }
  return grouped;
}

async function resolveConversationLogsByPhone(phones, organizationId, injected) {
  if (injected) {
    return injected instanceof Map ? injected : new Map(Object.entries(injected));
  }
  try {
    return await fetchConversationLogsByPhones(phones, organizationId);
  } catch {
    return new Map();
  }
}

function activityMs(row) {
  return activitySortMs({
    lastCommunicationAt: row?.lastCommunicationAt,
    lastActivityAt:
      row?.lastActivityAt ||
      row?.updated_at ||
      row?.last_message_at ||
      row?.created_at ||
      null
  });
}

async function buildConversationListItem(prospect, options = {}) {
  const persisted = await loadPersistedWorkflowState(prospect.phone, {
    organizationId: prospect.organization_id || null,
    prospectId: prospect.id || null
  });
  const ownershipState = resolveConversationOwnershipState(persisted);
  const lifecycleInfo = resolveInboxLifecycle({ prospect, persisted });
  const logs = options.logs || logsForPhone(options.logsByPhone, prospect.phone);
  const lastCommunication = computeLastCommunication(logs);
  const unreadState = computeUnreadState({
    logs,
    lastReadInboundAt: persisted.conversationsLastReadInboundAt || null
  });

  const fallbackLastMessage = String(prospect?.last_message || "").trim();
  const fallbackIsRealCommunication =
    Boolean(fallbackLastMessage) &&
    isRealWhatsAppCommunication({
      direction: "outbound",
      message: fallbackLastMessage
    });

  const lastMessagePreview =
    lastCommunication.lastMessagePreview ||
    (fallbackIsRealCommunication ? fallbackLastMessage.slice(0, 160) : null);
  const lastMessagePreviewKind =
    lastCommunication.lastMessagePreviewKind ||
    (fallbackIsRealCommunication ? "text" : null);
  const lastCommunicationAt =
    lastCommunication.lastCommunicationAt ||
    (fallbackIsRealCommunication ? prospect.last_message_at || null : null);
  const lastActivityAt =
    lastCommunicationAt ||
    prospect.updated_at ||
    prospect.created_at ||
    null;

  const needsHumanAttention = Boolean(persisted.needsHumanAttention);
  const unread = unreadState.unreadCount > 0;

  return {
    id: prospect.id || null,
    phone: prospect.phone,
    name: prospect.name || null,
    prospectNumber: prospect.prospect_number || null,
    lastMessagePreview,
    lastMessagePreviewKind,
    lastCommunicationAt,
    lastActivityAt,
    lastDirection: lastCommunication.lastDirection,
    unread,
    unreadCount: unreadState.unreadCount,
    lastReadInboundAt: persisted.conversationsLastReadInboundAt || null,
    source: extractSource(prospect),
    conversationGoal: extractConversationGoal(prospect),
    appointmentStatus: prospect.appointment_status || null,
    currentStep: prospect.current_step || null,
    ownershipState,
    workflowOwnership: persisted.workflowOwnership || OWNERSHIP.ATLAS,
    needsHumanAttention,
    manualAgentOwnership: Boolean(persisted.manualAgentOwnership),
    humanTakenOverAt: persisted.humanTakenOverAt || null,
    handoffReason: persisted.handoffReason || null,
    handoffAt: persisted.handoffAt || null,
    ownerUserId: prospect.owner_user_id || null,
    canonicalMilestone: persisted.canonicalMilestone || null,
    inboxLifecycle: lifecycleInfo.lifecycle,
    inboxCloseReason: lifecycleInfo.closeReason,
    inboxOutcome: lifecycleInfo.outcome,
    inboxArchivedAt: persisted.inboxArchivedAt || null,
    inboxClosedAt: persisted.inboxClosedAt || null
  };
}

function matchesFilter(item, filter) {
  const active = filter || CONVERSATION_FILTERS.ACTIVE;
  const lifecycle = item.inboxLifecycle || INBOX_LIFECYCLE.ACTIVE;

  // Default working inbox: Active only.
  if (active === CONVERSATION_FILTERS.ACTIVE) {
    return isActiveInboxLifecycle(lifecycle);
  }

  // Legacy "all" — every scoped thread (audit/search). Prefer explicit filters.
  if (active === CONVERSATION_FILTERS.ALL) {
    return true;
  }

  if (active === CONVERSATION_FILTERS.ARCHIVED) {
    return isArchivedInboxBucket(lifecycle);
  }

  if (active === CONVERSATION_FILTERS.TEST) {
    return lifecycle === INBOX_LIFECYCLE.TEST;
  }

  // Ownership tabs are Active-only.
  if (!isActiveInboxLifecycle(lifecycle)) {
    return false;
  }

  if (active === CONVERSATION_FILTERS.NEEDS_ATTENTION) {
    return item.ownershipState === CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION;
  }

  if (active === CONVERSATION_FILTERS.ATLAS) {
    return item.ownershipState === CONVERSATION_OWNERSHIP_STATE.ATLAS;
  }

  if (active === CONVERSATION_FILTERS.HUMAN) {
    return item.ownershipState === CONVERSATION_OWNERSHIP_STATE.HUMAN;
  }

  return true;
}

function matchesSearch(item, query) {
  if (!query) {
    return true;
  }

  const normalized = String(query).toLowerCase().trim();
  const haystack = [
    item.name,
    item.phone,
    item.prospectNumber,
    item.lastMessagePreview,
    item.source,
    item.conversationGoal,
    item.handoffReason,
    item.inboxLifecycle,
    item.inboxCloseReason,
    item.inboxOutcome
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return haystack.some((value) => value.includes(normalized));
}

function buildFilterCounts(items) {
  const activeItems = items.filter((item) =>
    isActiveInboxLifecycle(item.inboxLifecycle)
  );
  return {
    active: activeItems.length,
    // Keep `all` key as Active count for older clients that still read counts.all.
    all: activeItems.length,
    needs_attention: activeItems.filter(
      (item) => item.ownershipState === CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION
    ).length,
    atlas: activeItems.filter(
      (item) => item.ownershipState === CONVERSATION_OWNERSHIP_STATE.ATLAS
    ).length,
    human: activeItems.filter(
      (item) => item.ownershipState === CONVERSATION_OWNERSHIP_STATE.HUMAN
    ).length,
    archived: items.filter((item) => isArchivedInboxBucket(item.inboxLifecycle))
      .length,
    test: items.filter((item) => item.inboxLifecycle === INBOX_LIFECYCLE.TEST)
      .length
  };
}

/**
 * @param {{ organizationId: string, filter?: string, search?: string, prospects?: object[] }} options
 */
async function buildConversationsCenterReadModel(options = {}) {
  if (String(options.organizationId || "") !== TEAM_VISION_ORG_ID) {
    throw Object.assign(new Error("organizationId must be Team Vision for Conversations Center"), {
      statusCode: 403,
      code: "CONVERSATIONS_CENTER_ORG_FORBIDDEN"
    });
  }

  const prospects =
    options.prospects ?? (await loadProductionProspectsSafe(options.organizationId));

  const pilotScoped = prospects.filter(isProspectInNiovelPilotScope);
  const scoped = (
    await Promise.all(
      pilotScoped.map(async (prospect) => {
        const eligibility = await resolveRecruitingInboxEligibility(prospect);
        return eligibility.eligible ? prospect : null;
      })
    )
  ).filter(Boolean);
  const logsByPhone = await resolveConversationLogsByPhone(
    scoped.map((row) => row.phone).filter(Boolean),
    options.organizationId,
    options.conversationLogsByPhone
  );
  let items = (
    await Promise.all(
      scoped.map((prospect) =>
        buildConversationListItem(prospect, {
          logs: logsForPhone(logsByPhone, prospect.phone)
        })
      )
    )
  ).filter((item) => item.phone);

  items.sort(
    (left, right) =>
      activityMs(right) - activityMs(left) ||
      String(left.phone).localeCompare(String(right.phone))
  );

  const counts = buildFilterCounts(items);
  const filter = options.filter || CONVERSATION_FILTERS.ACTIVE;
  const search = String(options.search || "").trim();

  // Search across Archived/Test when query present and filter is Active — still Active-only
  // unless user explicitly opens Archived/Test/All.
  items = items.filter((item) => matchesFilter(item, filter) && matchesSearch(item, search));

  return {
    generatedAt: new Date().toISOString(),
    filter,
    search: search || null,
    counts,
    needsAttentionCount: counts.needs_attention,
    items
  };
}

async function getConversationsAttentionCount(organizationId, prospects) {
  const model = await buildConversationsCenterReadModel({
    organizationId,
    prospects,
    filter: CONVERSATION_FILTERS.ACTIVE
  });

  return {
    needsAttentionCount: model.needsAttentionCount,
    generatedAt: model.generatedAt
  };
}

module.exports = {
  buildConversationsCenterReadModel,
  getConversationsAttentionCount,
  buildConversationListItem,
  matchesFilter,
  extractConversationGoal,
  extractSource,
  fetchConversationLogsByPhones,
  logsForPhone,
  isRecruitingConversationEligibleForInbox,
  resolveRecruitingInboxEligibility
};
