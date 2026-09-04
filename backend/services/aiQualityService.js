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
const {
  AUDIT_ACTIONS,
  MODES,
  CONVERSATION_TURN_LIMIT,
  CONVERSATION_TURN_LOOKBACK
} = require("../core/aiQuality/constants");
const { assessEvidenceCompleteness } = require("../core/aiQuality/evidenceCompleteness");
const { supabase } = require("./supabaseService");

const CONVERSATION_TURN_COLUMNS = "id,direction,created_at,intent,pipeline,current_step,language";

function turnsLookupError(cause) {
  const error = new Error("QUALITY_TURNS_LOOKUP_FAILED");
  error.statusCode = 500;
  error.publicCode = "QUALITY_TURNS_LOOKUP_FAILED";
  error.cause = cause;
  return error;
}

function resolveTurnRole(row = {}) {
  const direction = String(row.direction || "").toLowerCase();
  if (direction === "incoming" || direction === "inbound") {
    return "prospect";
  }
  const intent = String(row.intent || "").toUpperCase();
  if (intent === "AGENT_ACTION" || intent.startsWith("HUMAN_")) {
    return "agent";
  }
  return "atlas";
}

function mapConversationTurn(row) {
  return {
    id: row.id,
    direction: row.direction || null,
    role: resolveTurnRole(row),
    createdAt: row.created_at || row.createdAt || null,
    intent: row.intent || null,
    pipeline: row.pipeline || null,
    currentStep: row.current_step || row.currentStep || null,
    language: row.language || null
  };
}

function boundTurnsAround(turns, detectedAt, limit = CONVERSATION_TURN_LIMIT) {
  const sorted = [...(turns || [])].sort(
    (left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
  );
  if (!detectedAt || sorted.length <= limit) {
    return sorted.slice(-limit);
  }
  const target = new Date(detectedAt).getTime();
  let idx = sorted.findIndex((turn) => new Date(turn.createdAt || 0).getTime() > target);
  if (idx < 0) {
    idx = sorted.length;
  }
  const start = Math.max(0, idx - Math.ceil(limit * 0.75));
  return sorted.slice(start, start + limit);
}

async function loadProspectPhone(prospectId, organizationId, { supabaseClient } = {}) {
  if (!prospectId || !organizationId) {
    return null;
  }
  const db = supabaseClient || supabase;
  const { data, error } = await db
    .from("prospects")
    .select("id,phone,organization_id")
    .eq("id", prospectId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    throw turnsLookupError(error);
  }
  if (!data || String(data.organization_id) !== String(organizationId)) {
    return null;
  }
  return data.phone || null;
}

async function loadConversationTurns(
  prospectId,
  organizationId,
  qualityCase = {},
  { supabaseClient, prospectPhone } = {}
) {
  if (!organizationId || !prospectId) {
    return { turns: [], error: null };
  }
  try {
    const phone = prospectPhone || (await loadProspectPhone(prospectId, organizationId, { supabaseClient }));
    if (!phone) {
      return { turns: [], error: null };
    }
    const db = supabaseClient || supabase;
    const { data, error } = await db
      .from("conversation_logs")
      .select(CONVERSATION_TURN_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("prospect_phone", phone)
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_TURN_LOOKBACK);
    if (error) {
      throw turnsLookupError(error);
    }
    const mapped = (data || []).map(mapConversationTurn);
    return {
      turns: boundTurnsAround(mapped, qualityCase.detectedAt || qualityCase.detected_at),
      error: null
    };
  } catch (error) {
    if (error.publicCode === "QUALITY_TURNS_LOOKUP_FAILED") {
      return {
        turns: [],
        error: {
          code: error.publicCode,
          message: "Conversation context could not be loaded."
        }
      };
    }
    throw error;
  }
}

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
    const evidence = assessEvidenceCompleteness(withLearning);
    return { ...withLearning, ...evidence };
  }
  const loaded = await loadConversationTurns(qualityCase.prospectId, qualityCase.organizationId, qualityCase, {
    supabaseClient: store?.supabase || undefined
  });
  const withTurns = {
    ...withLearning,
    conversationTurns: loaded.turns,
    conversationTurnsError: loaded.error
  };
  return { ...withTurns, ...assessEvidenceCompleteness(withTurns) };
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
  const qualityCase = await getCaseForScope({
    caseId,
    organizationId,
    store: resolved,
    includeTurns: true
  });
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
  loadConversationTurns,
  CONVERSATION_TURN_COLUMNS,
  boundTurnsAround,
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
