/**
 * BR-175 — application service for capture, review, and tenant-safe reads.
 */

const { writeAuditLog } = require("../security/auditLogService");
const { createSupabaseStore } = require("../repositories/aiQualityRepository");
const { captureFromSemanticShadow } = require("../core/aiQuality/captureService");
const { applyReviewAction, computeOverview } = require("../core/aiQuality/reviewService");
const { applyLearningAction } = require("../core/aiQuality/learningActions");
const { buildLearningReport } = require("../core/aiQuality/learningReport");
const { resolvePlatformCaptureConfig, parseMode, clampSampleRate } = require("../core/aiQuality/captureConfig");
const { AUDIT_ACTIONS, MODES } = require("../core/aiQuality/constants");
const { supabase } = require("./supabaseService");

let defaultStore = null;

function getStore(store) {
  if (store) {
    return store;
  }
  if (!defaultStore) {
    defaultStore = createSupabaseStore();
  }
  return defaultStore;
}

async function loadConversationTurns(prospectId, organizationId) {
  if (!prospectId || !organizationId) {
    return [];
  }
  try {
    const { data, error } = await supabase
      .from("conversation_logs")
      .select("id,direction,created_at,message_type,template_key")
      .eq("prospect_id", prospectId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) {
      return [];
    }
    return (data || []).reverse().map((row) => ({
      id: row.id,
      direction: row.direction,
      createdAt: row.created_at,
      messageType: row.message_type || null,
      templateKey: row.template_key || null
    }));
  } catch {
    return [];
  }
}

async function captureTurn(payload, { store, env } = {}) {
  const resolved = getStore(store);
  let tenantSettings = payload.tenantSettings;
  if (!tenantSettings && payload.organizationId) {
    tenantSettings = await resolved.getTenantSettings(payload.organizationId);
  }
  return captureFromSemanticShadow({
    ...payload,
    tenantSettings,
    store: resolved,
    env: env || payload.env || process.env
  });
}

async function listCasesForScope({
  organizationId = null,
  signalType = null,
  tab = null,
  store
} = {}) {
  return getStore(store).listCases({ organizationId, signalType, tab });
}

async function getCaseForScope({ caseId, organizationId = null, store, includeTurns = false } = {}) {
  const qualityCase = await getStore(store).getCase(caseId);
  if (!qualityCase) {
    return null;
  }
  if (organizationId && qualityCase.organizationId !== organizationId) {
    return null;
  }
  const resolved = getStore(store);
  const [proposal, implementation, regression] = await Promise.all([
    resolved.getProposalByCase ? resolved.getProposalByCase(qualityCase.id) : null,
    resolved.getImplementationByCase ? resolved.getImplementationByCase(qualityCase.id) : null,
    qualityCase.regressionCandidateId && resolved.getRegression
      ? resolved.getRegression(qualityCase.regressionCandidateId)
      : resolved.getRegressionByCase
        ? resolved.getRegressionByCase(qualityCase.id)
        : null
  ]);
  const withLearning = {
    ...qualityCase,
    learningProposal: proposal,
    implementationProposal: implementation,
    regression
  };
  if (!includeTurns) {
    return withLearning;
  }
  const turns = await loadConversationTurns(qualityCase.prospectId, qualityCase.organizationId);
  return { ...withLearning, conversationTurns: turns };
}

async function reviewCase({
  caseId,
  organizationId = null,
  action,
  notes,
  expectedBehavior,
  reviewerUserId,
  store
} = {}) {
  const resolved = getStore(store);
  const qualityCase = await getCaseForScope({ caseId, organizationId, store: resolved });
  if (!qualityCase) {
    const error = new Error("QUALITY_CASE_NOT_FOUND");
    error.statusCode = 404;
    error.publicCode = "QUALITY_CASE_NOT_FOUND";
    throw error;
  }
  const result = await applyReviewAction({
    qualityCase,
    action,
    notes,
    expectedBehavior,
    reviewerUserId,
    store: resolved
  });
  await writeAuditLog(result.auditEntry);
  return result;
}

async function applyLearningCaseAction({
  caseId,
  organizationId = null,
  action,
  notes,
  expectedBehavior,
  linkedPr,
  linkedBr,
  actorUserId,
  preAuthorize,
  skipAuthorization,
  autoAuthorize,
  store
} = {}) {
  const resolved = getStore(store);
  const qualityCase = await getCaseForScope({ caseId, organizationId, store: resolved });
  if (!qualityCase) {
    const error = new Error("QUALITY_CASE_NOT_FOUND");
    error.statusCode = 404;
    error.publicCode = "QUALITY_CASE_NOT_FOUND";
    throw error;
  }
  const result = await applyLearningAction({
    qualityCase,
    action,
    notes,
    expectedBehavior,
    linkedPr,
    linkedBr,
    actorUserId,
    preAuthorize,
    skipAuthorization,
    autoAuthorize,
    store: resolved
  });
  await writeAuditLog(result.auditEntry);
  return result;
}

async function getLearningReportForScope({ organizationId = null, store } = {}) {
  const resolved = getStore(store);
  const [cases, proposals, regressions, implementations] = await Promise.all([
    resolved.listCases({ organizationId }),
    resolved.listProposals({ organizationId }),
    resolved.listRegressions({ organizationId }),
    resolved.listImplementations({ organizationId })
  ]);
  return buildLearningReport({ cases, proposals, regressions, implementations });
}

async function updateTenantParticipation({
  organizationId,
  participationEnabled,
  mode,
  sampleRate,
  actorUserId,
  store
} = {}) {
  const resolved = getStore(store);
  const next = await resolved.upsertTenantSettings(organizationId, {
    participationEnabled: Boolean(participationEnabled),
    mode: parseMode(mode),
    sampleRate: clampSampleRate(sampleRate),
    updatedByUserId: actorUserId
  });
  const auditEntry = {
    action: AUDIT_ACTIONS.TENANT_PARTICIPATION_UPDATED,
    organizationId,
    userId: actorUserId,
    targetType: "organization",
    targetId: organizationId,
    result: "success",
    metadata: {
      participationEnabled: next.participationEnabled,
      mode: next.mode,
      sampleRate: next.sampleRate
    }
  };
  if (typeof resolved.recordAudit === "function") {
    resolved.recordAudit(auditEntry);
  }
  await writeAuditLog(auditEntry);
  return next;
}

function presentPlatformSettings(env = process.env) {
  const platform = resolvePlatformCaptureConfig(env);
  return {
    captureEnabled: platform.captureEnabled,
    mode: platform.mode,
    failClosed: platform.failClosed,
    failClosedReason: platform.failClosedReason,
    applyEnabled: false,
    autonomousApply: false,
    availableModes: [MODES.OFF, MODES.OBSERVE, MODES.REVIEW]
  };
}

module.exports = {
  captureTurn,
  listCasesForScope,
  getCaseForScope,
  reviewCase,
  applyLearningCaseAction,
  getLearningReportForScope,
  updateTenantParticipation,
  presentPlatformSettings,
  computeOverview,
  getStore
};
