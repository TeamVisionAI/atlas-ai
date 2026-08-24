/**
 * IUL Follow-Up Worklist read model — reuses prospect/workflow/agent state.
 */

"use strict";

const { loadProductionProspects } = require("./executiveDashboardReadModel");
const { loadAgentState } = require("./agentActionState");
const { loadPersistedWorkflowState } = require("./workflowStateStore");
const { findUserById } = require("../services/atlasUserService");
const {
  IUL_FOLLOW_UP_FILTERS,
  buildIulFollowUpItem,
  matchesIulFilter,
  compareIulFollowUpItems,
  buildIulFilterCounts,
  rowsToCsv
} = require("./iulFollowUpWorklistEngine");

async function resolveOwnerName(ownerUserId, cache) {
  if (!ownerUserId) {
    return null;
  }
  if (cache.has(ownerUserId)) {
    return cache.get(ownerUserId);
  }
  try {
    const user = await findUserById(ownerUserId);
    const name =
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
      user?.display_name ||
      user?.email ||
      null;
    cache.set(ownerUserId, name);
    return name;
  } catch {
    cache.set(ownerUserId, null);
    return null;
  }
}

async function buildIulFollowUpWorklistReadModel(options = {}) {
  if (!options.organizationId) {
    throw new Error("organizationId is required");
  }

  const prospects = await loadProductionProspects(options.organizationId);
  const ownerCache = new Map();
  const items = [];

  for (const prospect of prospects) {
    const workflowState =
      (await loadPersistedWorkflowState(prospect.phone, {
        organizationId: options.organizationId,
        prospectId: prospect.id
      })) || {};
    const agentState = loadAgentState(prospect.phone);
    const item = buildIulFollowUpItem({
      prospect,
      workflowState,
      agentState,
      durableFacts: workflowState.knownFacts || {},
      latestInboundAt: workflowState.latestInboundAt || agentState.latestInboundAt || null,
      lastContactAt: agentState.lastContactAt || prospect.updated_at || null,
      appointmentAt: prospect.appointment_date || workflowState.appointmentAt || null,
      organizationId: options.organizationId,
      reference: options.reference ? new Date(options.reference) : new Date()
    });
    if (!item) {
      continue;
    }
    if (options.ownerUserId && item.ownerUserId !== options.ownerUserId) {
      continue;
    }
    if (options.campaign && item.campaign !== options.campaign) {
      continue;
    }
    item.ownerName = await resolveOwnerName(item.ownerUserId, ownerCache);
    items.push(item);
  }

  const filter = options.filter || IUL_FOLLOW_UP_FILTERS.ALL;
  let filtered = items.filter((item) => matchesIulFilter(item, filter));
  if (options.nearExpiryOnly) {
    filtered = filtered.filter((item) => item.whatsappNearExpiry);
  }
  filtered.sort(compareIulFollowUpItems);

  return {
    filter,
    filters: buildIulFilterCounts(items),
    items: filtered,
    generatedAt: new Date().toISOString()
  };
}

function buildAuthorizedCsv(payload = {}, { organizationId } = {}) {
  const rows = (payload.items || []).map((item) => ({
    organizationId,
    name: item.name,
    phone: item.phone,
    email: item.email,
    owner: item.ownerName,
    campaign: item.campaign,
    iulStage: item.iulStage,
    originalPolicyPurpose: item.originalPolicyPurpose,
    reviewReason: item.reviewReason,
    followUpStatus: item.followUpStatus,
    nextFollowUpAt: item.nextFollowUpAt,
    appointmentAt: item.appointmentAt,
    whatsappWindowStatus: item.whatsappWindowStatus,
    recommendedFollowUpChannel: item.recommendedFollowUpChannel
  }));
  return rowsToCsv(rows);
}

module.exports = {
  buildIulFollowUpWorklistReadModel,
  buildAuthorizedCsv
};
