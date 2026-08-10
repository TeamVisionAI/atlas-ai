/**
 * Conversations Center list / badge read model.
 * Reuses production prospects + workflow state + Communications Center history endpoint for threads.
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

function activityMs(row) {
  const candidates = [
    row?.lastActivityAt,
    row?.updated_at,
    row?.last_message_at,
    row?.created_at
  ];

  for (const value of candidates) {
    const ms = Date.parse(value || "");
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }

  return 0;
}

function buildConversationListItem(prospect) {
  const persisted = loadPersistedWorkflowState(prospect.phone);
  const ownershipState = resolveConversationOwnershipState(persisted);
  const lastMessagePreview = prospect?.last_message
    ? String(prospect.last_message).slice(0, 160)
    : null;

  const unread =
    ownershipState === CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION ||
    prospect?.attention_status === "human_required";

  return {
    id: prospect.id || null,
    phone: prospect.phone,
    name: prospect.name || null,
    prospectNumber: prospect.prospect_number || null,
    lastMessagePreview,
    lastActivityAt:
      prospect.updated_at ||
      prospect.last_message_at ||
      prospect.created_at ||
      null,
    unread,
    source: extractSource(prospect),
    conversationGoal: extractConversationGoal(prospect),
    appointmentStatus: prospect.appointment_status || prospect.current_step || null,
    ownershipState,
    workflowOwnership: persisted.workflowOwnership || OWNERSHIP.ATLAS,
    needsHumanAttention: Boolean(persisted.needsHumanAttention),
    handoffReason: persisted.handoffReason || null,
    handoffAt: persisted.handoffAt || null,
    ownerUserId: prospect.owner_user_id || null,
    canonicalMilestone: null
  };
}

function matchesFilter(item, filter) {
  const active = filter || CONVERSATION_FILTERS.ALL;

  if (active === CONVERSATION_FILTERS.ALL) {
    return true;
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
    item.handoffReason
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return haystack.some((value) => value.includes(normalized));
}

function buildFilterCounts(items) {
  return {
    all: items.length,
    needs_attention: items.filter(
      (item) => item.ownershipState === CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION
    ).length,
    atlas: items.filter(
      (item) => item.ownershipState === CONVERSATION_OWNERSHIP_STATE.ATLAS
    ).length,
    human: items.filter(
      (item) => item.ownershipState === CONVERSATION_OWNERSHIP_STATE.HUMAN
    ).length
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

  const scoped = prospects.filter(isProspectInNiovelPilotScope);
  let items = scoped.map(buildConversationListItem).filter((item) => item.phone);

  items.sort((left, right) => activityMs(right) - activityMs(left) || String(left.phone).localeCompare(String(right.phone)));

  const counts = buildFilterCounts(items);
  const filter = options.filter || CONVERSATION_FILTERS.ALL;
  const search = String(options.search || "").trim();

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
    filter: CONVERSATION_FILTERS.ALL
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
  extractSource
};
