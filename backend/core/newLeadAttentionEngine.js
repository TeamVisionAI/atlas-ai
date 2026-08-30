/**
 * BR-080 — New lead attention, acknowledgement, claim, and escalation.
 * Lifecycle/current_step, AI workflow ownership, and human acknowledgement are separate.
 */

const supabaseService = require("../services/supabaseService");
const { writeAuditLog } = require("../security/auditLogService");
const { ROLES } = require("../security/roles");
const { canAccessProspect } = require("../security/authorizationService");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("./workflowStateStore");
const { MILESTONES, OWNERSHIP } = require("./workflowConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const {
  ASSIGNMENT_STATUS,
  isEligibleNewLeadOwner
} = require("./newLeadAssignmentEngine");
const atlasUserService = require("../services/atlasUserService");
const {
  evaluateRecruitingInboxEligibility,
  resolveRecruitingInboxEligibility
} = require("./conversationsCenter/conversationsCenterInboxEligibility");

const ATTENTION_STATUS = Object.freeze({
  NEW: "new",
  AI_RESPONDING: "ai_responding",
  WAITING_FOR_PROSPECT: "waiting_for_prospect",
  HUMAN_REQUIRED: "human_required",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED: "resolved"
});

const ESCALATION_LEVELS = Object.freeze({
  NONE: 0,
  UNASSIGNED_RAISED: 1,
  HUMAN_REQUIRED: 2
});

/** Pilot SLA — elapsed time from new_lead_received_at (UTC). */
const ESCALATION_UNASSIGNED_MS = 5 * 60 * 1000;
const ESCALATION_UNACKNOWLEDGED_MS = 15 * 60 * 1000;

const BR080_COLUMN_KEYS = [
  "assignment_status",
  "assignment_source",
  "attention_status",
  "acknowledged_at",
  "acknowledged_by_user_id",
  "human_attention_reason",
  "new_lead_received_at",
  "escalation_level",
  "last_escalated_at",
  "owner_user_id"
];

function isMissingBr080Column(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    BR080_COLUMN_KEYS.some((key) => message.includes(key))
  );
}

function sanitizeReason(reason) {
  if (!reason) {
    return null;
  }

  return String(reason).replace(/\s+/g, " ").trim().slice(0, 240);
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 4) {
    return "***";
  }

  return `***-***-${digits.slice(-4)}`;
}

function isAcknowledged(prospect = {}) {
  return Boolean(prospect.acknowledged_at || prospect.attention_status === ATTENTION_STATUS.ACKNOWLEDGED);
}

function isUnassigned(prospect = {}) {
  return (
    !prospect.owner_user_id &&
    (prospect.assignment_status === ASSIGNMENT_STATUS.UNASSIGNED ||
      prospect.assignment_status == null)
  );
}

function isHealthyAtlasWaitingAttention(prospect = {}) {
  const attention = prospect.attention_status;
  return (
    attention === ATTENTION_STATUS.AI_RESPONDING ||
    attention === ATTENTION_STATUS.WAITING_FOR_PROSPECT
  );
}

const FIRST_RESPONSE_SLA_REASONS = new Set([
  "unacknowledged_sla_15m",
  "unassigned_sla_15m"
]);

function isFirstResponseSlaReason(reason) {
  return FIRST_RESPONSE_SLA_REASONS.has(String(reason || "").trim());
}

/**
 * A delivered Atlas reply satisfies the first-response SLA.
 * Does not acknowledge the New mission (BR-080 human ack stays explicit).
 */
function isFirstResponseSlaSatisfied(prospect = {}, extras = {}) {
  if (isHealthyAtlasWaitingAttention(prospect)) {
    return true;
  }
  return extras.deliveredAutomatedOutbound === true;
}

async function resolveBr080WorkflowState(prospect = {}, workflowState = null) {
  if (workflowState && typeof workflowState === "object") {
    return workflowState;
  }
  const embedded =
    prospect.workflow_state && typeof prospect.workflow_state === "object"
      ? prospect.workflow_state
      : {};
  if (!prospect.phone) {
    return embedded;
  }
  try {
    const loaded = await loadPersistedWorkflowState(prospect.phone, {
      organizationId: prospect.organization_id || prospect.organizationId || null,
      prospectId: prospect.id || null
    });
    return { ...embedded, ...loaded };
  } catch {
    return embedded;
  }
}

async function lookupDeliveredAutomatedFirstResponse(prospect = {}, lookupFn = null) {
  if (typeof lookupFn === "function") {
    return Boolean(await lookupFn(prospect));
  }
  if (!prospect.phone) {
    return false;
  }
  try {
    const {
      queryOutboundDeliveries,
      isAutomatedReplyIntent,
      DELIVERED_META_STATUSES
    } = require("./whatsappAutomatedReplyDelivery");
    const rows = await queryOutboundDeliveries(
      prospect.phone,
      prospect.organization_id || prospect.organizationId || null
    );
    return (rows || []).some((row) => {
      if (!isAutomatedReplyIntent(row.intent)) {
        return false;
      }
      const meta = String(row.meta_delivery_status || "").trim().toLowerCase();
      if (!meta) {
        return true;
      }
      return DELIVERED_META_STATUSES.has(meta);
    });
  } catch (error) {
    logWhatsAppStage("br080_first_response_lookup_failed", {
      level: "warn",
      phone: maskPhone(prospect.phone),
      error: error.message
    });
    // Fail closed — a lookup error must not skip a real unacknowledged SLA.
    return false;
  }
}

function isNewLeadAttentionOpen(prospect = {}) {
  if (isAcknowledged(prospect)) {
    return false;
  }

  const step = String(prospect.current_step || prospect.status || "").toUpperCase();
  if (["CLOSED", "DO_NOT_CONTACT", "RECRUITED"].includes(step)) {
    return false;
  }

  if (prospect.attention_status === ATTENTION_STATUS.RESOLVED) {
    return false;
  }

  const attention = prospect.attention_status;
  if (
    attention === ATTENTION_STATUS.NEW ||
    attention === ATTENTION_STATUS.AI_RESPONDING ||
    attention === ATTENTION_STATUS.WAITING_FOR_PROSPECT ||
    attention === ATTENTION_STATUS.HUMAN_REQUIRED
  ) {
    return true;
  }

  // Pre-migration / unknown attention: open when create clock exists.
  if (!attention) {
    return Boolean(prospect.new_lead_received_at || prospect.created_at);
  }

  return false;
}

function receivedAtMs(prospect = {}) {
  const raw = prospect.new_lead_received_at || prospect.created_at;
  const ms = Date.parse(raw || "");
  return Number.isNaN(ms) ? null : ms;
}

async function updateProspectAttention(phone, organizationId, updates) {
  if (!organizationId) {
    const error = new Error("organizationId is required for tenant-scoped lead attention updates.");
    error.statusCode = 400;
    error.publicCode = "TENANT_ORGANIZATION_REQUIRED";
    throw error;
  }

  try {
    return await supabaseService.updateProspectInOrganization(phone, organizationId, updates);
  } catch (error) {
    if (!isMissingBr080Column(error)) {
      throw error;
    }

    // Pre-migration environments: persist owner + keep workflow-compatible fields only.
    const fallback = {};
    if (Object.prototype.hasOwnProperty.call(updates, "owner_user_id")) {
      fallback.owner_user_id = updates.owner_user_id;
    }

    if (Object.keys(fallback).length === 0) {
      logWhatsAppStage("br080_columns_missing", {
        level: "warn",
        phone: maskPhone(phone)
      });
      return null;
    }

    return supabaseService.updateProspectInOrganization(phone, organizationId, fallback);
  }
}

async function writeSafeAudit({
  organizationId,
  userId = null,
  userEmail = null,
  action,
  targetId = null,
  metadata = {}
}) {
  try {
    await writeAuditLog({
      organizationId,
      userId,
      userEmail,
      action,
      targetType: "prospect",
      targetId,
      result: "success",
      metadata: {
        ...metadata,
        phone: metadata.phone ? maskPhone(metadata.phone) : undefined
      }
    });
  } catch (error) {
    logWhatsAppStage("br080_audit_failed", {
      level: "warn",
      action,
      error: error.message
    });
  }
}

function isRecruitingProspectForBr080(prospect = {}, workflowState = null) {
  return evaluateRecruitingInboxEligibility(prospect, workflowState).eligible;
}

/**
 * Mark AI actively handling without clearing New / acknowledgement.
 */
async function markAiResponding(prospect, options = {}) {
  if (!prospect?.phone || isAcknowledged(prospect)) {
    return prospect;
  }

  const workflowState = await resolveBr080WorkflowState(
    prospect,
    options.workflowState || null
  );
  if (!isRecruitingProspectForBr080(prospect, workflowState)) {
    return prospect;
  }

  const attention =
    prospect.attention_status === ATTENTION_STATUS.HUMAN_REQUIRED
      ? ATTENTION_STATUS.HUMAN_REQUIRED
      : ATTENTION_STATUS.AI_RESPONDING;

  await updateProspectAttention(prospect.phone, prospect.organization_id, {
    attention_status: attention
  });

  if (options.waitingForProspect) {
    await updateProspectAttention(prospect.phone, prospect.organization_id, {
      attention_status: ATTENTION_STATUS.WAITING_FOR_PROSPECT
    });
  }

  return {
    ...prospect,
    attention_status: options.waitingForProspect
      ? ATTENTION_STATUS.WAITING_FOR_PROSPECT
      : attention
  };
}

/**
 * Human Attention Required — AI/provider/template failure path.
 * Does not imply acknowledgement.
 */
async function markHumanAttentionRequired(prospect, reason, actor = {}) {
  if (!prospect?.phone) {
    return null;
  }

  const recruiting = await resolveRecruitingInboxEligibility(prospect);
  if (!recruiting.eligible) {
    return null;
  }

  const sanitized = sanitizeReason(reason) || "human_attention_required";
  const updates = {
    attention_status: ATTENTION_STATUS.HUMAN_REQUIRED,
    human_attention_reason: sanitized
  };

  await updateProspectAttention(prospect.phone, prospect.organization_id, updates);

  await savePersistedWorkflowState(
    prospect.phone,
    {
      needsHumanAttention: true,
      workflowOwnership: OWNERSHIP.AGENT,
      manualAgentOwnership: true
    },
    {
      organizationId: prospect.organization_id || null,
      prospectId: prospect.id || null,
      prospect,
      ownerUserId: prospect.owner_user_id || null
    }
  );

  await writeSafeAudit({
    organizationId: prospect.organization_id,
    userId: actor.userId || null,
    action: "lead.human_attention_required",
    targetId: prospect.id || null,
    metadata: {
      phone: prospect.phone,
      reason: sanitized,
      prospect_number: prospect.prospect_number || null
    }
  });

  return {
    ...prospect,
    ...updates
  };
}

function canAcknowledgeProspect(context, prospect) {
  if (!context || !prospect) {
    return false;
  }

  if (!canAccessProspect(context, prospect)) {
    return false;
  }

  if (context.role === ROLES.ADMINISTRATOR || context.role === ROLES.RVP) {
    return true;
  }

  if (context.role === ROLES.DIVISION_LEADER) {
    return canAccessProspect(context, prospect);
  }

  if (context.role === ROLES.AGENT || context.role === ROLES.RECRUITER) {
    return String(context.userId) === String(prospect.owner_user_id || "");
  }

  return false;
}

function canClaimUnassigned(context, prospect) {
  if (!context || !prospect || !isUnassigned(prospect)) {
    return false;
  }

  if (!canAccessProspect(context, prospect)) {
    return false;
  }

  return (
    context.role === ROLES.ADMINISTRATOR ||
    context.role === ROLES.RVP ||
    context.role === ROLES.DIVISION_LEADER
  );
}

/**
 * Explicit acknowledgement — page view / AI reply must NOT call this.
 */
async function acknowledgeLead(prospect, actor = {}) {
  if (!prospect?.phone) {
    throw Object.assign(new Error("Prospect required"), { statusCode: 400 });
  }

  if (isAcknowledged(prospect)) {
    return {
      prospect,
      alreadyAcknowledged: true
    };
  }

  const now = new Date().toISOString();
  const updates = {
    attention_status: ATTENTION_STATUS.ACKNOWLEDGED,
    acknowledged_at: now,
    acknowledged_by_user_id: actor.userId || null,
    human_attention_reason: prospect.human_attention_reason || null
  };

  await updateProspectAttention(prospect.phone, prospect.organization_id, updates);

  await writeSafeAudit({
    organizationId: prospect.organization_id,
    userId: actor.userId || null,
    userEmail: actor.userEmail || null,
    action: "lead.acknowledged",
    targetId: prospect.id || null,
    metadata: {
      phone: prospect.phone,
      prospect_number: prospect.prospect_number || null,
      prior_assignment_status: prospect.assignment_status || null,
      resulting_assignment_status: prospect.owner_user_id
        ? ASSIGNMENT_STATUS.ASSIGNED
        : ASSIGNMENT_STATUS.UNASSIGNED
    }
  });

  return {
    prospect: { ...prospect, ...updates },
    alreadyAcknowledged: false
  };
}

/**
 * Claim unassigned lead — compare-and-set on owner_user_id null.
 */
async function claimLead(prospect, actor = {}) {
  if (!prospect?.phone) {
    throw Object.assign(new Error("Prospect required"), { statusCode: 400 });
  }

  if (!actor.userId) {
    throw Object.assign(new Error("Actor required"), { statusCode: 401 });
  }

  if (prospect.owner_user_id && String(prospect.owner_user_id) !== String(actor.userId)) {
    const error = new Error("Lead already claimed by another user.");
    error.statusCode = 409;
    error.publicCode = "LEAD_ALREADY_CLAIMED";
    throw error;
  }

  const claimant = await atlasUserService.findUserById(actor.userId).catch(() => null);
  if (!claimant || !isEligibleNewLeadOwner(claimant, prospect.organization_id)) {
    const error = new Error("Claimant is not eligible to own this lead.");
    error.statusCode = 403;
    error.publicCode = "CLAIMANT_INELIGIBLE";
    throw error;
  }

  if (!prospect.organization_id) {
    const error = new Error("Prospect organization is required to claim a lead.");
    error.statusCode = 400;
    error.publicCode = "TENANT_ORGANIZATION_REQUIRED";
    throw error;
  }

  const now = new Date().toISOString();

  // Compare-and-set: only claim when still unassigned.
  const { data, error } = await supabaseService.supabase
    .from("prospects")
    .update({
      owner_user_id: actor.userId,
      assignment_status: ASSIGNMENT_STATUS.ASSIGNED,
      assignment_source: "claim",
      attention_status: ATTENTION_STATUS.ACKNOWLEDGED,
      acknowledged_at: now,
      acknowledged_by_user_id: actor.userId,
      escalation_level: prospect.escalation_level || 0
    })
    .eq("phone", prospect.phone)
    .eq("organization_id", prospect.organization_id)
    .is("owner_user_id", null)
    .select("*")
    .maybeSingle();

  if (error && isMissingBr080Column(error)) {
    const { data: fallback, error: fallbackError } = await supabaseService.supabase
      .from("prospects")
      .update({ owner_user_id: actor.userId })
      .eq("phone", prospect.phone)
      .eq("organization_id", prospect.organization_id)
      .is("owner_user_id", null)
      .select("*")
      .maybeSingle();

    if (fallbackError) {
      throw fallbackError;
    }

    if (!fallback) {
      const conflict = new Error("Lead already claimed by another user.");
      conflict.statusCode = 409;
      conflict.publicCode = "LEAD_ALREADY_CLAIMED";
      throw conflict;
    }

    await writeSafeAudit({
      organizationId: prospect.organization_id,
      userId: actor.userId,
      userEmail: actor.userEmail || null,
      action: "lead.claimed",
      targetId: prospect.id || null,
      metadata: {
        phone: prospect.phone,
        prospect_number: prospect.prospect_number || null,
        migration_fallback: true
      }
    });

    return { prospect: fallback, claimed: true };
  }

  if (error) {
    throw error;
  }

  if (!data) {
    const conflict = new Error("Lead already claimed by another user.");
    conflict.statusCode = 409;
    conflict.publicCode = "LEAD_ALREADY_CLAIMED";
    throw conflict;
  }

  await writeSafeAudit({
    organizationId: prospect.organization_id,
    userId: actor.userId,
    userEmail: actor.userEmail || null,
    action: "lead.claimed",
    targetId: prospect.id || data.id || null,
    metadata: {
      phone: prospect.phone,
      prospect_number: prospect.prospect_number || null,
      prior_assignment_status: ASSIGNMENT_STATUS.UNASSIGNED,
      resulting_assignment_status: ASSIGNMENT_STATUS.ASSIGNED
    }
  });

  return { prospect: data, claimed: true };
}

function evaluateEscalation(prospect, nowMs = Date.now(), extras = {}) {
  if (!isRecruitingProspectForBr080(prospect)) {
    return { shouldEscalate: false, level: prospect.escalation_level || 0 };
  }

  if (!isNewLeadAttentionOpen(prospect)) {
    return { shouldEscalate: false, level: prospect.escalation_level || 0 };
  }

  const received = receivedAtMs(prospect);
  if (received == null) {
    return { shouldEscalate: false, level: prospect.escalation_level || 0 };
  }

  const age = nowMs - received;
  const current = Number(prospect.escalation_level || 0);

  if (isUnassigned(prospect) && age >= ESCALATION_UNASSIGNED_MS && current < 1) {
    return {
      shouldEscalate: true,
      level: ESCALATION_LEVELS.UNASSIGNED_RAISED,
      reason: "unassigned_sla_5m"
    };
  }

  if (age >= ESCALATION_UNACKNOWLEDGED_MS && current < 2) {
    // Implements BR-080 — delivered Atlas reply satisfies first-response SLA.
    if (isFirstResponseSlaSatisfied(prospect, extras)) {
      return {
        shouldEscalate: false,
        level: current,
        reason: "first_response_satisfied"
      };
    }
    return {
      shouldEscalate: true,
      level: ESCALATION_LEVELS.HUMAN_REQUIRED,
      reason: isUnassigned(prospect)
        ? "unassigned_sla_15m"
        : "unacknowledged_sla_15m"
    };
  }

  return { shouldEscalate: false, level: current };
}

/**
 * Restore Atlas-owned waiting after a false unacknowledged-SLA Needs Attention.
 * Does not acknowledge New. Does not clear stall, TAKE OVER, or real failure reasons.
 */
async function repairFalseFirstResponseSlaAttention(prospect, options = {}) {
  if (!prospect?.phone || isAcknowledged(prospect)) {
    return { repaired: false, prospect };
  }
  if (!isFirstResponseSlaReason(prospect.human_attention_reason)) {
    return { repaired: false, prospect };
  }

  const workflowState = await resolveBr080WorkflowState(prospect, options.workflowState || null);
  if (workflowState.humanTakenOverAt || workflowState.stalledAt) {
    return { repaired: false, prospect };
  }
  if (workflowState.handoffReason && !isFirstResponseSlaReason(workflowState.handoffReason)) {
    return { repaired: false, prospect };
  }

  const updates = {
    attention_status: ATTENTION_STATUS.WAITING_FOR_PROSPECT,
    human_attention_reason: null
  };
  await updateProspectAttention(prospect.phone, prospect.organization_id, updates);

  if (workflowState.needsHumanAttention === true && !workflowState.humanTakenOverAt) {
    await savePersistedWorkflowState(
      prospect.phone,
      {
        needsHumanAttention: false,
        workflowOwnership: OWNERSHIP.ATLAS,
        manualAgentOwnership: false
      },
      {
        organizationId: prospect.organization_id || null,
        prospectId: prospect.id || null,
        prospect
      }
    );
  }

  return {
    repaired: true,
    prospect: { ...prospect, ...updates }
  };
}

async function applyEscalation(prospect, decision) {
  if (!decision?.shouldEscalate || !prospect?.phone) {
    return { escalated: false, prospect };
  }

  if (!isRecruitingProspectForBr080(prospect)) {
    return { escalated: false, prospect };
  }

  // Implements BR-080 — never seize Needs Attention for a satisfied first-response SLA.
  if (
    decision.level >= ESCALATION_LEVELS.HUMAN_REQUIRED &&
    isFirstResponseSlaSatisfied(prospect)
  ) {
    return { escalated: false, prospect };
  }

  const now = new Date().toISOString();
  const updates = {
    escalation_level: decision.level,
    last_escalated_at: now
  };

  if (decision.level >= ESCALATION_LEVELS.HUMAN_REQUIRED) {
    updates.attention_status = ATTENTION_STATUS.HUMAN_REQUIRED;
    updates.human_attention_reason = sanitizeReason(decision.reason);

    // Implements BR-080 — 15m SLA is CRM Human Attention metadata, not conversational TAKE OVER.
    // Healthy Atlas-waiting conversations must keep ATLAS ownership so the next inbound still replies.
    if (!isHealthyAtlasWaitingAttention(prospect)) {
      await savePersistedWorkflowState(
        prospect.phone,
        {
          needsHumanAttention: true,
          workflowOwnership: OWNERSHIP.AGENT
        },
        {
          organizationId: prospect.organization_id || null,
          prospectId: prospect.id || null,
          prospect,
          ownerUserId: prospect.owner_user_id || null
        }
      );
    }
  }

  await updateProspectAttention(prospect.phone, prospect.organization_id, updates);

  await writeSafeAudit({
    organizationId: prospect.organization_id,
    action: "lead.escalated",
    targetId: prospect.id || null,
    metadata: {
      phone: prospect.phone,
      prospect_number: prospect.prospect_number || null,
      escalation_level: decision.level,
      reason: decision.reason || null
    }
  });

  return {
    escalated: true,
    prospect: { ...prospect, ...updates }
  };
}

async function processLeadEscalationsForOrganization(organizationId, options = {}) {
  if (!organizationId) {
    return { processed: 0, escalated: 0 };
  }

  const nowMs = options.nowMs || Date.now();
  const load =
    options.loadProspects ||
    (() => supabaseService.loadProspectsForOrganization(organizationId));

  const prospects = (await load()) || [];
  let escalated = 0;
  let repaired = 0;

  for (const prospect of prospects) {
    const preview = evaluateEscalation(prospect, nowMs);
    let delivered = isFirstResponseSlaSatisfied(prospect);
    const needsDeliveryLookup =
      !delivered &&
      (isFirstResponseSlaReason(prospect.human_attention_reason) ||
        (preview.shouldEscalate && preview.level >= ESCALATION_LEVELS.HUMAN_REQUIRED));

    if (needsDeliveryLookup) {
      delivered = await lookupDeliveredAutomatedFirstResponse(
        prospect,
        options.lookupDeliveredFirstResponse
      );
    }

    const decision = delivered
      ? evaluateEscalation(prospect, nowMs, { deliveredAutomatedOutbound: true })
      : preview;

    if (delivered && isFirstResponseSlaReason(prospect.human_attention_reason)) {
      const heal = await repairFalseFirstResponseSlaAttention(prospect);
      if (heal.repaired) {
        repaired += 1;
      }
      continue;
    }

    if (!decision.shouldEscalate) {
      if (
        delivered &&
        !isAcknowledged(prospect) &&
        !isHealthyAtlasWaitingAttention(prospect) &&
        prospect.attention_status !== ATTENTION_STATUS.HUMAN_REQUIRED
      ) {
        await markAiResponding(prospect, { waitingForProspect: true });
      }
      continue;
    }

    const result = await applyEscalation(prospect, decision);
    if (result.escalated) {
      escalated += 1;
    }
  }

  return { processed: prospects.length, escalated, repaired };
}

let escalationTimer = null;

function startNewLeadEscalationPoller(intervalMs = 60_000) {
  if (escalationTimer) {
    return;
  }

  const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

  escalationTimer = setInterval(() => {
    processLeadEscalationsForOrganization(DEFAULT_ORGANIZATION_ID).catch((error) => {
      logWhatsAppStage("br080_escalation_poller_failed", {
        level: "warn",
        error: error.message
      });
    });
  }, intervalMs);

  if (typeof escalationTimer.unref === "function") {
    escalationTimer.unref();
  }
}

function stopNewLeadEscalationPoller() {
  if (escalationTimer) {
    clearInterval(escalationTimer);
    escalationTimer = null;
  }
}

module.exports = {
  ATTENTION_STATUS,
  ESCALATION_LEVELS,
  ESCALATION_UNASSIGNED_MS,
  ESCALATION_UNACKNOWLEDGED_MS,
  isAcknowledged,
  isUnassigned,
  isNewLeadAttentionOpen,
  isFirstResponseSlaSatisfied,
  isFirstResponseSlaReason,
  markAiResponding,
  markHumanAttentionRequired,
  repairFalseFirstResponseSlaAttention,
  canAcknowledgeProspect,
  canClaimUnassigned,
  acknowledgeLead,
  claimLead,
  evaluateEscalation,
  applyEscalation,
  processLeadEscalationsForOrganization,
  startNewLeadEscalationPoller,
  stopNewLeadEscalationPoller,
  sanitizeReason,
  maskPhone
};
