/**
 * BR-172 — After a successful appointment create, release temporary human
 * ownership so Atlas can manage the booked appointment.
 *
 * Shared canonical layer for every tenant, agent, and appointment purpose.
 * Does not special-case organizations, users, or phone numbers.
 */

const { OWNERSHIP } = require("./workflowConstants");
const {
  loadPersistedWorkflowState
} = require("./workflowStateStore");
const {
  returnConversationToAtlas
} = require("./conversationsCenter/conversationsCenterOwnershipService");
const { HANDOFF_REASONS } = require("./conversationsCenter/constants");
const { writeAuditLog } = require("../security/auditLogService");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

const AUDIT_ACTION = "conversation.returned_to_atlas_after_scheduling";

const TEMPORARY_HANDOFF_REASONS = Object.freeze(
  new Set([
    HANDOFF_REASONS.TAKE_OVER,
    HANDOFF_REASONS.WHATSAPP_BUSINESS_APP
  ])
);

const PERMANENT_HANDOFF_REASONS = Object.freeze(
  new Set([
    HANDOFF_REASONS.EXPLICIT_HUMAN_REQUEST,
    HANDOFF_REASONS.RECRUITER_ESCALATION,
    HANDOFF_REASONS.SYSTEM_FAILURE,
    HANDOFF_REASONS.UNSUPPORTED_SITUATION,
    HANDOFF_REASONS.ESCALATION
  ])
);

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasStickyManualHold(persisted = {}) {
  return persisted.manualAgentOwnership === true && Boolean(persisted.humanTakenOverAt);
}

function hasManualOrAgentOwnership(persisted = {}) {
  return (
    persisted.manualAgentOwnership === true ||
    persisted.workflowOwnership === OWNERSHIP.AGENT ||
    Boolean(persisted.humanTakenOverAt)
  );
}

function isOptOutOrClosed(prospect = {}, persisted = {}) {
  const step = String(prospect.current_step || prospect.currentStep || "").toUpperCase();
  if (step.includes("DO NOT CONTACT") || step === "DO_NOT_CONTACT" || step === "CLOSED") {
    return true;
  }
  if (persisted.doNotContact === true) {
    return true;
  }
  const reason = fold(
    prospect.human_attention_reason || persisted.humanAttentionReason || persisted.handoffReason
  );
  return reason.includes("opt_out") || reason.includes("opt-out") || reason.includes("do_not_contact");
}

function isHumanRequired(prospect = {}, persisted = {}) {
  const attention = fold(prospect.attention_status || persisted.attentionStatus);
  if (attention === "human_required") {
    return true;
  }
  const reason = fold(
    prospect.human_attention_reason || persisted.humanAttentionReason || persisted.handoffReason
  );
  return (
    reason === "human_required" ||
    reason.includes("compliance") ||
    reason.includes("safety") ||
    reason === "v2_human_required_hold"
  );
}

function decideSchedulingOwnershipReturn({ persisted = {}, prospect = {} } = {}) {
  if (!hasManualOrAgentOwnership(persisted)) {
    return { shouldReturn: false, reason: "NOT_HUMAN_OWNED" };
  }

  if (persisted.keepWithHuman === true) {
    return { shouldReturn: false, reason: "KEEP_WITH_HUMAN" };
  }

  if (isOptOutOrClosed(prospect, persisted)) {
    return { shouldReturn: false, reason: "OPT_OUT_OR_CLOSED" };
  }

  if (isHumanRequired(prospect, persisted)) {
    return { shouldReturn: false, reason: "HUMAN_REQUIRED" };
  }

  const handoff = fold(persisted.handoffReason);
  if (handoff && PERMANENT_HANDOFF_REASONS.has(handoff)) {
    return { shouldReturn: false, reason: "DURABLE_HUMAN_SEAL" };
  }

  if (handoff && !TEMPORARY_HANDOFF_REASONS.has(handoff)) {
    return { shouldReturn: false, reason: "UNCLASSIFIED_HOLD" };
  }

  if (TEMPORARY_HANDOFF_REASONS.has(handoff) || (hasStickyManualHold(persisted) && !handoff)) {
    return { shouldReturn: true, reason: "TEMPORARY_TAKEOVER" };
  }

  return { shouldReturn: false, reason: "UNCLASSIFIED_HOLD" };
}

async function writeReturnAudit({
  organizationId,
  prospectId,
  phone,
  appointmentId,
  appointmentPurpose,
  source,
  previousHandoffReason
}) {
  try {
    const digits = String(phone || "").replace(/\D/g, "");
    await writeAuditLog({
      organizationId,
      action: AUDIT_ACTION,
      targetType: "prospect",
      targetId: prospectId || null,
      result: "success",
      metadata: {
        phone: digits.length >= 4 ? `***-***-${digits.slice(-4)}` : "***",
        appointmentId: appointmentId || null,
        appointmentPurpose: appointmentPurpose || null,
        source: source || null,
        previousHandoffReason: previousHandoffReason || null
      }
    });
  } catch (error) {
    logWhatsAppStage("br172_ownership_return_audit_failed", {
      level: "warn",
      organizationId,
      error: error.message
    });
  }
}

/**
 * Fail-open after a persisted appointment: never roll back the booking if
 * ownership release fails.
 */
async function maybeReturnTemporaryOwnershipToAtlasAfterScheduling({
  phone,
  organizationId,
  prospectId = null,
  prospect = {},
  appointmentId = null,
  appointmentPurpose = null,
  source = "appointmentApplicationService.createAppointment",
  dependencies = {}
} = {}) {
  if (!phone || !organizationId) {
    return { attempted: false, returned: false, reason: "MISSING_SCOPE" };
  }

  try {
    const load = dependencies.loadPersistedWorkflowState || loadPersistedWorkflowState;
    const returnToAtlas = dependencies.returnConversationToAtlas || returnConversationToAtlas;
    const persist = await load(phone, { organizationId, prospectId });
    const decision = decideSchedulingOwnershipReturn({ persisted: persist, prospect });

    if (!decision.shouldReturn) {
      return { attempted: false, returned: false, reason: decision.reason };
    }

    const result = await returnToAtlas(phone, { organizationId, prospectId });
    await writeReturnAudit({
      organizationId,
      prospectId,
      phone,
      appointmentId,
      appointmentPurpose,
      source,
      previousHandoffReason: persist.handoffReason
    });

    return {
      attempted: true,
      returned: true,
      reason: decision.reason,
      previous: result.previous,
      next: result.next
    };
  } catch (error) {
    logWhatsAppStage("br172_ownership_return_failed", {
      level: "warn",
      organizationId,
      error: error.message
    });
    return {
      attempted: true,
      returned: false,
      reason: error.code || error.message || "OWNERSHIP_RETURN_FAILED"
    };
  }
}

module.exports = {
  AUDIT_ACTION,
  TEMPORARY_HANDOFF_REASONS,
  PERMANENT_HANDOFF_REASONS,
  decideSchedulingOwnershipReturn,
  maybeReturnTemporaryOwnershipToAtlasAfterScheduling
};
