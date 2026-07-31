/**
 * Sprint 12.5.2 — Follow-ups operational queue read model.
 * Composes workflow priority queue + agent state — no duplicate follow-up logic.
 * Implements BR-035 / BR-036 / BR-037 follow-up scheduling from interview outcomes.
 */

const { loadProductionProspects } = require("./executiveDashboardReadModel");
const { buildPrioritizedWorkflowQueue } = require("./missionControlPriorityEngine");
const { loadAgentState } = require("./agentActionState");
const { findUserById } = require("../services/atlasUserService");
const {
  FOLLOW_UP_FILTERS,
  parseFollowUpAtMs,
  classifyFollowUpStatus,
  isFollowUpQueueCandidate,
  matchesSearch,
  compareFollowUpItems,
  buildFilterCounts
} = require("./followUpsQueueEngine");

async function resolveRepresentativeName(ownerUserId, cache) {
  if (!ownerUserId) {
    return null;
  }

  if (cache.has(ownerUserId)) {
    return cache.get(ownerUserId);
  }

  try {
    const user = await findUserById(ownerUserId);

    if (!user) {
      cache.set(ownerUserId, null);
      return null;
    }

    const name =
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.display_name ||
      user.email ||
      null;

    cache.set(ownerUserId, name);
    return name;
  } catch {
    cache.set(ownerUserId, null);
    return null;
  }
}

async function buildFollowUpItem(prospect, summary, representativeCache) {
  const agentState = loadAgentState(summary.phone);
  const followUpAtMs = parseFollowUpAtMs(agentState.followUpDate, agentState.followUpTime);
  const status = classifyFollowUpStatus({
    canonicalMilestone: summary.canonicalMilestone,
    followUpAtMs,
    priorityTier: summary.missionControlPriorityTier
  });

  if (!status) {
    return null;
  }

  const ownerUserId = prospect?.owner_user_id || null;
  const representativeName = await resolveRepresentativeName(ownerUserId, representativeCache);

  return {
    phone: summary.phone,
    name: summary.name || prospect?.name || null,
    prospectNumber: prospect?.prospect_number || null,
    canonicalMilestone: summary.canonicalMilestone,
    missionControlPriority: summary.missionControlPriority,
    missionControlPriorityTier: summary.missionControlPriorityTier,
    followUpDate: agentState.followUpDate || null,
    followUpTime: agentState.followUpTime || null,
    followUpAtMs,
    followUpReason: agentState.outcome || null,
    status,
    representativeId: ownerUserId,
    representativeName,
    needsHumanAttention: summary.needsHumanAttention,
    workflowOwnership: summary.workflowOwnership,
    stalledAt: summary.stalledAt || null
  };
}

/**
 * @param {{ filter?: string, search?: string, sort?: string, organizationId: string }} options
 */
async function buildFollowUpsReadModel(options = {}) {
  if (!options.organizationId) {
    throw new Error("organizationId is required to build follow-ups read model");
  }

  const prospects = await loadProductionProspects(options.organizationId);
  const queue = await buildPrioritizedWorkflowQueue(prospects);
  const prospectByPhone = new Map(prospects.map((row) => [row.phone, row]));
  const representativeCache = new Map();

  let items = [];

  for (const summary of queue) {
    const agentState = loadAgentState(summary.phone);

    if (!isFollowUpQueueCandidate(summary, agentState)) {
      continue;
    }

    const prospect = prospectByPhone.get(summary.phone);
    const item = await buildFollowUpItem(prospect, summary, representativeCache);

    if (item) {
      items.push(item);
    }
  }

  const activeFilter =
    options.filter && options.filter !== FOLLOW_UP_FILTERS.ALL
      ? options.filter
      : FOLLOW_UP_FILTERS.ALL;
  const search = String(options.search || "").trim();
  const sortKey = options.sort === "priority" || options.sort === "name" ? options.sort : "due-date";
  const filters = buildFilterCounts(items);

  if (activeFilter !== FOLLOW_UP_FILTERS.ALL) {
    items = items.filter((item) => item.status === activeFilter);
  } else {
    items = items.filter((item) => item.status !== "completed");
  }

  if (search) {
    items = items.filter((item) => matchesSearch(item, search));
  }

  items.sort((a, b) => compareFollowUpItems(a, b, sortKey));

  return {
    generatedAt: new Date().toISOString(),
    totalCount: filters.find((row) => row.id === FOLLOW_UP_FILTERS.ALL)?.count || 0,
    filteredCount: items.length,
    activeFilter,
    search,
    sort: sortKey,
    filters,
    items
  };
}

module.exports = {
  FOLLOW_UP_FILTERS,
  buildFollowUpsReadModel
};
