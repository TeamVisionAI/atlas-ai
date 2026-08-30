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
const appointmentListService = require("../services/appointmentListService");
const { MILESTONES } = require("./workflowConstants");
const {
  isLifecycleNew,
  needsManualAcknowledge
} = require("./newLeadAttentionEngine");

function buildProspectCenterItem(prospect, summary, options = {}) {
  const interviewMs = parseInterviewDatetime(prospect);
  const hasCanonicalAppointment = options.phonesWithAppointments
    ? options.phonesWithAppointments.has(summary.phone)
    : true;

  // Implements BR-039 — do not present INTERVIEW_SCHEDULED without a persisted appointment.
  let canonicalMilestone = summary.canonicalMilestone;
  let interviewAt = interviewMs ? new Date(interviewMs).toISOString() : null;

  if (canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED && !hasCanonicalAppointment) {
    canonicalMilestone = MILESTONES.INTERVIEW_READY;
    interviewAt = null;
  }

  const unassigned = !prospect?.owner_user_id;
  const attentionStatus = prospect?.attention_status || (unassigned ? "new" : null);
  const lifecycleNew = isLifecycleNew(prospect);
  const manualAcknowledge = needsManualAcknowledge(prospect);

  return {
    phone: summary.phone,
    name: summary.name || prospect?.name || null,
    prospectNumber: prospect?.prospect_number || null,
    canonicalMilestone,
    currentStep: summary.currentStep,
    missionControlPriority: summary.missionControlPriority,
    missionControlPriorityTier: summary.missionControlPriorityTier,
    interviewAt,
    interviewType: prospect?.interview_type || null,
    city: prospect?.city || null,
    state: prospect?.state || null,
    stalledAt: summary.stalledAt,
    needsHumanAttention:
      summary.needsHumanAttention || attentionStatus === "human_required",
    workflowOwnership: summary.workflowOwnership,
    communicationLanguage: prospect?.communication_language || null,
    lastMessagePreview: prospect?.last_message
      ? String(prospect.last_message).slice(0, 120)
      : null,
    appointmentMissing:
      summary.canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED && !hasCanonicalAppointment,
    // Implements BR-080 — assignment / attention surface fields (safe operational).
    ownerUserId: prospect?.owner_user_id || null,
    assignmentStatus: prospect?.assignment_status || (unassigned ? "unassigned" : "assigned"),
    attentionStatus,
    acknowledgedAt: prospect?.acknowledged_at || null,
    newLeadReceivedAt: prospect?.new_lead_received_at || prospect?.created_at || null,
    escalationLevel: prospect?.escalation_level || 0,
    source: prospect?.source || null,
    entryMethod: prospect?.entry_method || null,
    isUnassigned: unassigned,
    isNew: lifecycleNew,
    isNewUnacknowledged: manualAcknowledge,
    needsManualAcknowledge: manualAcknowledge,
    isHumanAttentionRequired:
      summary.needsHumanAttention || attentionStatus === "human_required",
    badges: {
      new: lifecycleNew,
      needsManualAcknowledge: manualAcknowledge,
      unassigned,
      humanAttention:
        summary.needsHumanAttention || attentionStatus === "human_required",
      aiResponding: attentionStatus === "ai_responding"
    }
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
 * @param {{ filter?: string, search?: string, organizationId: string, prospects?: object[] }} options
 */
async function buildProspectCenterReadModel(options = {}) {
  if (!options.organizationId) {
    throw new Error("organizationId is required to build prospect center read model");
  }

  const prospects =
    options.prospects ?? (await loadProductionProspects(options.organizationId));
  const queue = await buildPrioritizedWorkflowQueue(prospects);
  const prospectByPhone = new Map(prospects.map((row) => [row.phone, row]));

  const appointmentList = await appointmentListService.listPersistedAppointments({
    organizationId: options.organizationId
  });
  const phonesWithAppointments = new Set(
    (appointmentList.items || [])
      .filter((appointment) =>
        ["scheduled", "confirmed", "rescheduled", "in_progress"].includes(
          String(appointment.status || "").toLowerCase()
        )
      )
      .map((appointment) => appointment.prospectPhone)
      .filter(Boolean)
  );

  let items = queue
    .map((summary) =>
      buildProspectCenterItem(prospectByPhone.get(summary.phone), summary, {
        phonesWithAppointments
      })
    )
    .filter(Boolean);

  const activeFilter = options.filter && options.filter !== "all" ? options.filter : "all";
  const search = String(options.search || "").trim();

  const dateOptions = {
    organizationId: options.organizationId,
    reference: options.reference ? new Date(options.reference) : new Date()
  };

  if (activeFilter !== "all") {
    const allowedPhones = new Set(
      resolveExecutiveFilterPhones(activeFilter, prospects, queue, dateOptions)
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
    filters: buildExecutiveFilterCounts(prospects, queue, dateOptions),
    items
  };
}

module.exports = {
  buildProspectCenterReadModel,
  buildProspectCenterItem,
  matchesSearch
};
