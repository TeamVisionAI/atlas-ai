/**
 * Implements BR-240 — SUPER_ADMIN-only CANARY RESET for explicitly marked
 * test prospects. Clears blocking runtime state so the same phone can run a
 * new canary after a fresh legitimate intake. Never sends WhatsApp, never
 * creates appointments or Calendar events, never deletes history.
 */

"use strict";

const { isSuperAdmin } = require("../security/saasRoles");
const { writeAuditLog } = require("../security/auditLogService");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { OWNERSHIP } = require("./workflowConstants");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("./workflowStateStore");

const CANARY_RESET_ACTION = "CANARY_RESET";
const CANARY_RESET_MODE_FULL = "full";
const CANARY_RESET_MIN_REASON_LENGTH = 3;

const ERRORS = Object.freeze({
  FORBIDDEN: "CANARY_RESET_FORBIDDEN",
  TARGET_REQUIRED: "CANARY_RESET_TARGET_REQUIRED",
  REASON_REQUIRED: "CANARY_RESET_REASON_REQUIRED",
  PROSPECT_NOT_FOUND: "CANARY_RESET_PROSPECT_NOT_FOUND",
  ORG_MISMATCH: "CANARY_RESET_ORG_MISMATCH",
  NOT_TEST_PROSPECT: "CANARY_RESET_NOT_TEST_PROSPECT"
});

/** Extra IUL / campaign keys stored on workflow_state but not in DURABLE_RUNTIME_FIELDS. */
const CANARY_RESET_CLEARED_WORKFLOW_EXTRAS = Object.freeze({
  conversationGoal: null,
  campaignKind: null,
  iulWorkflowStage: null,
  iulConversationStatus: null,
  campaignIntakePurpose: null,
  campaignIntakeCodeId: null,
  campaignIntakeMatchedAt: null,
  lastOfferMade: null,
  lastQuestionAsked: null
});

function fail(code, message, statusCode) {
  const error = new Error(message);
  error.publicCode = code;
  error.statusCode = statusCode;
  throw error;
}

function trimReason(value) {
  return String(value || "").trim();
}

function summarizeOwnershipState(workflow = {}) {
  return {
    workflowOwnership: workflow.workflowOwnership || null,
    manualAgentOwnership: workflow.manualAgentOwnership === true,
    humanTakenOverAt: workflow.humanTakenOverAt || null,
    handoffReason: workflow.handoffReason || null,
    keepWithHuman: workflow.keepWithHuman === true,
    needsHumanAttention: workflow.needsHumanAttention === true,
    atlasAutomationEnabled:
      workflow.atlasAutomationEnabled === true
        ? true
        : workflow.atlasAutomationEnabled === false
          ? false
          : null,
    atlasEligibilitySource: workflow.atlasEligibilitySource || null,
    conversationGoal: workflow.conversationGoal || null,
    campaignKind: workflow.campaignKind || null,
    iulWorkflowStage: workflow.iulWorkflowStage || null,
    iulConversationStatus: workflow.iulConversationStatus || null,
    canaryAwaitingFreshIntake: workflow.canaryAwaitingFreshIntake === true
  };
}

function buildCanaryReadyPatch({ resetReason, resetMode, actorUserId, nowIso }) {
  return {
    workflowOwnership: OWNERSHIP.ATLAS,
    manualAgentOwnership: false,
    needsHumanAttention: false,
    handoffReason: null,
    handoffAt: null,
    humanTakenOverAt: null,
    keepWithHuman: false,
    // Do not set returnedToAtlasAt — that would resume Return-to-Atlas, not a fresh canary.
    returnedToAtlasAt: null,
    returnToAtlasResumeKey: null,
    returnToAtlasResumeLastError: null,
    returnToAtlasResumeLastAttemptAt: null,
    atlasAutomationEnabled: null,
    atlasEligibilitySource: null,
    ctwaReferral: null,
    ctwa_clid: null,
    ctwaEvidencePersistedAt: null,
    lastProspectInboundProviderMessageId: null,
    lastProspectInboundAt: null,
    canaryResetAt: nowIso,
    canaryAwaitingFreshIntake: true,
    canaryResetReason: resetReason,
    canaryResetMode: resetMode,
    canaryResetActorUserId: actorUserId || null,
    ...CANARY_RESET_CLEARED_WORKFLOW_EXTRAS
  };
}

async function defaultLoadProspect(prospectId, organizationId) {
  const { loadLegacyProspectById } = require("../security/prospectAccessService");
  return loadLegacyProspectById(prospectId, organizationId);
}

async function defaultArchiveContext(args) {
  const { createContextPersistenceService } = require("./recruitAiV2/contextPersistenceService");
  const { createSupabaseContextRepository } = require("./recruitAiV2/contextRepository");
  const { supabase } = require("../services/supabaseService");
  const persistence = createContextPersistenceService({
    repository: createSupabaseContextRepository(supabase)
  });
  return persistence.archiveContext(args);
}

/**
 * @param {object} input
 * @param {object} [deps]
 */
async function resetCanaryProspect(input = {}, deps = {}) {
  const authContext = input.authContext || {};
  const saasRole = authContext.saasRole || authContext.role;
  if (!isSuperAdmin(saasRole)) {
    fail(ERRORS.FORBIDDEN, "Super Admin access is required.", 403);
  }

  const organizationId = String(input.organizationId || "").trim();
  const prospectId = String(input.prospectId || "").trim();
  const resetReason = trimReason(input.resetReason);
  const resetMode = String(input.resetMode || CANARY_RESET_MODE_FULL).trim() ||
    CANARY_RESET_MODE_FULL;

  if (!organizationId || !prospectId) {
    fail(
      ERRORS.TARGET_REQUIRED,
      "organizationId and prospectId are required.",
      400
    );
  }
  if (resetReason.length < CANARY_RESET_MIN_REASON_LENGTH) {
    fail(
      ERRORS.REASON_REQUIRED,
      "resetReason is required.",
      400
    );
  }

  const loadProspect = deps.loadProspect || defaultLoadProspect;
  const loadWorkflow = deps.loadPersistedWorkflowState || loadPersistedWorkflowState;
  const saveWorkflow = deps.savePersistedWorkflowState || savePersistedWorkflowState;
  const archiveContext = deps.archiveContext || defaultArchiveContext;
  const writeAudit = deps.writeAuditLog || writeAuditLog;
  const logStage = deps.logWhatsAppStage || logWhatsAppStage;
  const nowIso =
    typeof deps.nowIso === "function"
      ? deps.nowIso()
      : deps.nowIso || new Date().toISOString();

  const prospect = await loadProspect(prospectId, organizationId);
  if (!prospect) {
    fail(ERRORS.PROSPECT_NOT_FOUND, "Prospect not found in organization.", 404);
  }

  const prospectOrg = String(
    prospect.organization_id || prospect.organizationId || ""
  ).trim();
  if (prospectOrg !== organizationId) {
    fail(
      ERRORS.ORG_MISMATCH,
      "Prospect does not belong to the requested organization.",
      403
    );
  }

  const phone = prospect.phone || null;
  const previousWorkflow = await loadWorkflow(phone, {
    organizationId,
    prospectId
  });

  if (!previousWorkflow?.inboxMarkedTestAt) {
    fail(
      ERRORS.NOT_TEST_PROSPECT,
      "Canary reset requires the prospect to be marked as test first.",
      409
    );
  }

  const previousOwnershipSummary = summarizeOwnershipState(previousWorkflow);

  const archivedContext = await archiveContext({
    organizationId,
    prospectId,
    prospectPhone: phone,
    reason: "canary_reset"
  });

  const nextWorkflow = await saveWorkflow(
    phone,
    buildCanaryReadyPatch({
      resetReason,
      resetMode,
      actorUserId: authContext.userId || null,
      nowIso
    }),
    { organizationId, prospectId }
  );

  const auditEntry = {
    organizationId,
    userId: authContext.userId || null,
    userEmail: authContext.email || null,
    action: CANARY_RESET_ACTION,
    targetType: "prospect",
    targetId: prospectId,
    result: "success",
    metadata: {
      prospect_id: prospectId,
      organization_id: organizationId,
      actor_user_id: authContext.userId || null,
      reset_reason: resetReason,
      reset_mode: resetMode,
      timestamp: nowIso,
      previous_workflow_ownership_summary: previousOwnershipSummary,
      archived_context_id: archivedContext?._persistence?.id || null,
      inbox_marked_test_at: previousWorkflow.inboxMarkedTestAt
    }
  };

  await writeAudit(auditEntry);
  logStage(CANARY_RESET_ACTION, {
    organizationId,
    prospectId,
    actorUserId: authContext.userId || null,
    resetReason,
    resetMode,
    previousOwnership: previousOwnershipSummary.workflowOwnership,
    previousEligibilitySource: previousOwnershipSummary.atlasEligibilitySource
  });

  return {
    ok: true,
    action: CANARY_RESET_ACTION,
    resetMode,
    resetReason,
    resetAt: nowIso,
    prospect: {
      id: prospect.id,
      organizationId: prospectOrg,
      phone: prospect.phone,
      normalizedPhone: prospect.normalized_phone || prospect.normalizedPhone || null,
      prospectNumber: prospect.prospect_number || prospect.prospectNumber || null,
      name: prospect.name || null
    },
    previousOwnershipSummary,
    workflowState: nextWorkflow,
    archivedContextId: archivedContext?._persistence?.id || null,
    outboundSent: false,
    appointmentCreated: false,
    calendarEventCreated: false
  };
}

module.exports = {
  resetCanaryProspect,
  summarizeOwnershipState,
  buildCanaryReadyPatch,
  CANARY_RESET_ACTION,
  CANARY_RESET_MODE_FULL,
  CANARY_RESET_CLEARED_WORKFLOW_EXTRAS,
  ERRORS
};
