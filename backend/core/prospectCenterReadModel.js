/**
 * Sprint 10.3 — Prospect Center read model.
 * Operational browse list bridging Executive Dashboard and Prospect Workspace.
 * Composes existing priority queue + prospect rows — no new business rules.
 */

const { loadProductionProspects } = require("./executiveDashboardReadModel");
const { buildPrioritizedWorkflowQueue } = require("./missionControlPriorityEngine");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const {
  resolveExecutiveFilterPhones,
  buildExecutiveFilterCounts
} = require("./executiveFilterResolver");

function buildProspectCenterItem(prospect, summary) {
  const interviewMs = parseInterviewDatetime(prospect);

  return {
    phone: summary.phone,
    name: summary.name || prospect?.name || null,
    prospectNumber: prospect?.prospect_number || null,
    canonicalMilestone: summary.canonicalMilestone,
    currentStep: summary.currentStep,
    missionControlPriority: summary.missionControlPriority,
    missionControlPriorityTier: summary.missionControlPriorityTier,
    interviewAt: interviewMs ? new Date(interviewMs).toISOString() : null,
    interviewType: prospect?.interview_type || null,
    city: prospect?.city || null,
    state: prospect?.state || null,
    stalledAt: summary.stalledAt,
    needsHumanAttention: summary.needsHumanAttention,
    workflowOwnership: summary.workflowOwnership,
    communicationLanguage: prospect?.communication_language || null,
    lastMessagePreview: prospect?.last_message
      ? String(prospect.last_message).slice(0, 120)
      : null
  };
}

function matchesSearch(item, query) {
  if (!query) {
    return true;
  }

  const normalized = query.toLowerCase().trim();
  const haystack = [
    item.name,
    item.phone,
    item.prospectNumber,
    item.city,
    item.state,
    item.lastMessagePreview
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return haystack.some((value) => value.includes(normalized));
}

/**
 * @param {{ filter?: string, search?: string }} [options]
 */
async function buildProspectCenterReadModel(options = {}) {
  const prospects = await loadProductionProspects();
  const queue = await buildPrioritizedWorkflowQueue(prospects);
  const prospectByPhone = new Map(prospects.map((row) => [row.phone, row]));

  let items = queue
    .map((summary) =>
      buildProspectCenterItem(prospectByPhone.get(summary.phone), summary)
    )
    .filter(Boolean);

  const activeFilter = options.filter && options.filter !== "all" ? options.filter : "all";
  const search = String(options.search || "").trim();

  if (activeFilter !== "all") {
    const allowedPhones = new Set(
      resolveExecutiveFilterPhones(activeFilter, prospects, queue)
    );
    items = items.filter((item) => allowedPhones.has(item.phone));
  }

  if (search) {
    items = items.filter((item) => matchesSearch(item, search));
  }

  return {
    generatedAt: new Date().toISOString(),
    totalCount: queue.length,
    filteredCount: items.length,
    activeFilter,
    search,
    filters: buildExecutiveFilterCounts(prospects, queue),
    items
  };
}

module.exports = {
  buildProspectCenterReadModel,
  buildProspectCenterItem,
  matchesSearch
};
