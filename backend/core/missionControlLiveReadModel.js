/**
 * Sprint 16.1 — Mission Control live recruiting workflow read model.
 * Composes conversation thread, recruiting funnel, and AI Action Center for agent workspace.
 */

const { MILESTONES } = require("./workflowConstants");
const { getAgentActionLabel } = require("./agentActionRegistry");
const {
  isInterviewReadyWithoutScheduledInterview,
  isQualificationCompleteByCanonicalMilestone
} = require("./missionControlMilestoneProjection");

const WORKFLOW_ONLY_MISSING_FIELDS = new Set(["schedule", "email", "interviewType"]);
const TERMINAL_WORKFLOW_MILESTONES = new Set([
  MILESTONES.CLOSED,
  MILESTONES.DO_NOT_CONTACT
]);

const RECRUITING_FUNNEL_STEPS = Object.freeze([
  { key: "new_lead", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "interview_scheduled", label: "Interview Scheduled" }
]);

const PRIORITY_TIER_LABELS = Object.freeze({
  PENDING_INTERVIEW_RESULTS: "Pending interview results",
  HUMAN_ESCALATION: "Human escalation",
  INTERVIEW_IMMEDIATE: "Interview immediate",
  FOLLOW_UP_DUE: "Follow-up due",
  ATLAS_ACTIVE: "Atlas active",
  MONITORING: "Monitoring"
});

function normalizeDirection(direction) {
  const value = String(direction || "").toLowerCase();

  if (value === "outgoing" || value === "outbound") {
    return "outgoing";
  }

  if (value === "incoming" || value === "inbound") {
    return "incoming";
  }

  return value || "unknown";
}

function resolveSender(direction) {
  return normalizeDirection(direction) === "outgoing" ? "atlas" : "prospect";
}

/**
 * @param {string} phone
 * @param {number} [limit]
 * @param {{ organizationId?: string, prospectId?: string, repository?: object }} [context]
 * @returns {Promise<Array<{ id: string, text: string, direction: string, sender: string, timestamp: string, media?: object, messageType?: string }>>}
 */
async function fetchConversationThread(phone, limit = 50, context = {}) {
  if (!phone) {
    return [];
  }

  try {
    const { supabase } = require("../services/supabaseService");
    const { data, error } = await supabase
      .from("conversation_logs")
      .select("id, message, direction, created_at")
      .eq("prospect_phone", phone)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error || !data?.length) {
      return [];
    }

    const messages = data.map((row) => {
      const direction = normalizeDirection(row.direction);

      return {
        id: String(row.id),
        text: row.message || "",
        direction,
        sender: resolveSender(direction),
        timestamp: row.created_at
      };
    });

    return attachCanonicalAudioMedia(messages, phone, context);
  } catch {
    return [];
  }
}

// Implements BR-140 — WhatsApp thread uses the same public media as Communications Center.

async function attachCanonicalAudioMedia(messages, phone, context = {}) {
  let organizationId = context.organizationId || null;
  let prospectId = context.prospectId || null;

  if (!organizationId || !prospectId) {
    try {
      const { supabase } = require("../services/supabaseService");
      let query = supabase.from("prospects").select("id, organization_id").eq("phone", phone);
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      const { data: prospect, error } = await query.maybeSingle();
      if (!error && prospect) {
        organizationId = organizationId || prospect.organization_id || null;
        prospectId = prospectId || prospect.id || null;
      }
    } catch {
      return messages;
    }
  }

  if (!organizationId || !prospectId) {
    return messages;
  }

  try {
    const {
      getCommunicationMediaRepository,
      attachPublicMediaToConversationMessages
    } = require("./communicationMedia/communicationMediaRepository");
    const rows = await getCommunicationMediaRepository(context).listForProspect({
      organizationId,
      prospectId
    });
    return attachPublicMediaToConversationMessages(messages, rows);
  } catch {
    return messages;
  }
}

function resolveRecruitingFunnelIndex(canonicalMilestone, brain = {}) {
  const milestone = canonicalMilestone || MILESTONES.NEW_LEAD;
  const missingFields = brain.missingFields || [];
  const scheduledMilestones = new Set([
    MILESTONES.INTERVIEW_SCHEDULED,
    MILESTONES.INTERVIEW_DUE,
    MILESTONES.INTERVIEW_COMPLETED,
    MILESTONES.INTERVIEW_RESULT_PENDING
  ]);
  const qualifiedMilestones = new Set([MILESTONES.QUALIFICATION, MILESTONES.INTERVIEW_READY]);
  const contactedMilestones = new Set([MILESTONES.GREETING_SENT]);

  if (scheduledMilestones.has(milestone) || brain.currentStep === "CONFIRMED") {
    return 3;
  }

  if (
    qualifiedMilestones.has(milestone) ||
    brain.currentStep === "SCHEDULE" ||
    (missingFields.length === 1 && missingFields.includes("schedule"))
  ) {
    return 2;
  }

  if (
    contactedMilestones.has(milestone) ||
    (brain.currentStep && !["NEW", "GREETING"].includes(brain.currentStep))
  ) {
    return 1;
  }

  return 0;
}

function buildRecruitingFunnelStatus(workflow = {}, brain = {}) {
  const activeIndex = resolveRecruitingFunnelIndex(workflow.canonicalMilestone, brain);

  return {
    activeStepKey: RECRUITING_FUNNEL_STEPS[activeIndex]?.key || "new_lead",
    canonicalMilestone: workflow.canonicalMilestone || MILESTONES.NEW_LEAD,
    workflowOwnership: workflow.workflowOwnership || null,
    updatedAt: new Date().toISOString(),
    steps: RECRUITING_FUNNEL_STEPS.map((step, index) => ({
      key: step.key,
      label: step.label,
      state: index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming"
    }))
  };
}

function formatActionLabel(actionId) {
  return getAgentActionLabel(actionId);
}

function buildActionReason({ workflow, brain, conversationMessages }) {
  if (workflow?.stall?.isStalled) {
    return workflow.stall.reason || "Prospect has not replied to Atlas outreach.";
  }

  if (workflow?.needsHumanAttention) {
    return "Human attention required for this workflow state.";
  }

  if (isInterviewReadyWithoutScheduledInterview(workflow)) {
    return "Prospect is qualified and ready to schedule an interview.";
  }

  const missingFields = brain?.missingFields || [];
  const workflowOnlyMissing = missingFields.filter((field) =>
    WORKFLOW_ONLY_MISSING_FIELDS.has(field)
  );
  const qualificationComplete = isQualificationCompleteByCanonicalMilestone(workflow);

  if (
    !qualificationComplete &&
    workflowOnlyMissing.includes("schedule") &&
    missingFields.every((field) => WORKFLOW_ONLY_MISSING_FIELDS.has(field))
  ) {
    return "Prospect is qualified and ready to schedule an interview.";
  }

  if (
    !qualificationComplete &&
    (missingFields.includes("schedule") || brain?.currentStep === "SCHEDULE")
  ) {
    return "Prospect is qualified and ready to schedule an interview.";
  }

  const missingProspectFacts = missingFields.filter(
    (field) => !WORKFLOW_ONLY_MISSING_FIELDS.has(field)
  );

  if (!qualificationComplete && brain?.nextField) {
    return `Qualification in progress — waiting for ${brain.nextField}.`;
  }

  if (!qualificationComplete && missingProspectFacts.length) {
    return `Qualification in progress — waiting for: ${missingProspectFacts.join(", ")}.`;
  }

  const lastInbound = [...conversationMessages].reverse().find((entry) => entry.direction === "incoming");

  if (lastInbound?.text) {
    return "Continue the conversation based on the prospect's latest reply.";
  }

  const lastOutbound = [...conversationMessages].reverse().find((entry) => entry.direction === "outgoing");

  if (lastOutbound) {
    return "Follow up on the last Atlas message.";
  }

  return "Start outreach for this new lead.";
}

function computeActionConfidence({ workflow, primaryAction }) {
  if (workflow?.stall?.isStalled) {
    return 0.78;
  }

  if (workflow?.needsHumanAttention) {
    return 0.82;
  }

  if (primaryAction?.priority === "primary") {
    return 0.91;
  }

  return 0.74;
}

function buildAiActionCenter({ workflow = {}, availableActions = [], brain = {}, conversationMessages = [] }) {
  const primaryAction =
    availableActions.find((action) => action.priority === "primary") || availableActions[0] || null;
  const tier = workflow.missionControlPriorityTier || "MONITORING";

  return {
    priority: PRIORITY_TIER_LABELS[tier] || tier.replace(/_/g, " "),
    priorityTier: tier,
    priorityRank: workflow.missionControlPriority || null,
    nextBestAction: formatActionLabel(primaryAction?.id),
    actionId: primaryAction?.id || null,
    reason: buildActionReason({ workflow, brain, conversationMessages }),
    confidence: computeActionConfidence({ workflow, primaryAction: primaryAction }),
    updatedAt: new Date().toISOString()
  };
}

function enrichAtlasBriefSummary(summary, conversationMessages = []) {
  const lines = Array.isArray(summary) ? [...summary] : summary ? [summary] : [];
  const lastInbound = [...conversationMessages].reverse().find((entry) => entry.direction === "incoming");
  const lastOutbound = [...conversationMessages].reverse().find((entry) => entry.direction === "outgoing");

  if (lastInbound?.text) {
    const preview = lastInbound.text.slice(0, 140);
    lines.push(
      `Prospect replied: "${preview}${lastInbound.text.length > preview.length ? "…" : ""}"`
    );
  } else if (lastOutbound) {
    lines.push("Awaiting prospect reply.");
  }

  return lines.filter(Boolean).slice(0, 6);
}

function isCollectPhrase(value) {
  return /^Collect\s/i.test(String(value || ""));
}

function mergeMissionControlActionCenters(gateCenter, autonomousCenter, context = {}) {
  if (!autonomousCenter) {
    return gateCenter;
  }

  if (!gateCenter) {
    return {
      ...autonomousCenter,
      autonomous: true
    };
  }

  const brain = context.brain || {};
  const workflow = context.workflow || {};
  const missingFields = brain.missingFields || [];
  const missingProspectFacts = missingFields.filter(
    (field) => !WORKFLOW_ONLY_MISSING_FIELDS.has(field)
  );

  if (TERMINAL_WORKFLOW_MILESTONES.has(workflow.canonicalMilestone)) {
    return gateCenter;
  }

  if (missingProspectFacts.length > 0) {
    return {
      ...autonomousCenter,
      confidence: autonomousCenter.confidence ?? gateCenter.confidence,
      autonomous: true
    };
  }

  if (
    gateCenter.actionId === "schedule" &&
    (isCollectPhrase(autonomousCenter.nextBestAction) ||
      autonomousCenter.nextBestAction === "Complete interview scheduling" ||
      autonomousCenter.nextBestAction === "Collect scheduling preference")
  ) {
    return {
      ...gateCenter,
      reason: gateCenter.reason || autonomousCenter.reason,
      confidence: Math.max(gateCenter.confidence || 0, autonomousCenter.confidence || 0),
      autonomous: true
    };
  }

  if (gateCenter.actionId === "schedule") {
    return {
      ...gateCenter,
      confidence: autonomousCenter.confidence ?? gateCenter.confidence,
      autonomous: true
    };
  }

  if (autonomousCenter.actionId && !gateCenter.actionId) {
    return {
      ...autonomousCenter,
      reason: autonomousCenter.reason || gateCenter.reason,
      confidence: autonomousCenter.confidence ?? gateCenter.confidence,
      autonomous: true
    };
  }

  return {
    ...gateCenter,
    nextBestAction: gateCenter.nextBestAction || autonomousCenter.nextBestAction,
    reason: gateCenter.reason || autonomousCenter.reason,
    confidence: gateCenter.confidence ?? autonomousCenter.confidence,
    priority: gateCenter.priority || autonomousCenter.priority,
    actionId: gateCenter.actionId ?? autonomousCenter.actionId,
    autonomous: Boolean(autonomousCenter)
  };
}

function buildLiveRevision(conversationMessages = [], workflow = {}) {
  const lastMessage = conversationMessages[conversationMessages.length - 1];

  return {
    messageCount: conversationMessages.length,
    lastMessageAt: lastMessage?.timestamp || null,
    canonicalMilestone: workflow.canonicalMilestone || null,
    stalledAt: workflow.stalledAt || null
  };
}

module.exports = {
  RECRUITING_FUNNEL_STEPS,
  WORKFLOW_ONLY_MISSING_FIELDS,
  fetchConversationThread,
  buildRecruitingFunnelStatus,
  buildAiActionCenter,
  mergeMissionControlActionCenters,
  enrichAtlasBriefSummary,
  buildLiveRevision
};
