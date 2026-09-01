/**
 * BR-175 — persist quality cases from semantic shadow and conversation signals.
 * Never writes prospect context, never changes replies, never applies semantic facts.
 */

const crypto = require("node:crypto");
const {
  CASE_STATUSES,
  SOURCE_ENGINES
} = require("./constants");
const { isCaptureEligible } = require("./captureConfig");
const { classifySignals, highestSeverity } = require("./signalDetector");
const { buildEpisodeKey } = require("./episodeKey");
const { summarizeFacts } = require("./regressionSpec");

function compactInterpretation(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    intent: value.intent || null,
    language: value.language || null,
    confidence: value.confidence ?? null,
    facts: summarizeFacts(value.facts),
    objections: Array.isArray(value.objections)
      ? value.objections.map((item) => ({
          kind: item?.kind || null,
          detail: item?.detail || null
        }))
      : [],
    schedulingIntent: value.schedulingIntent || null,
    safety: value.safety
      ? {
          ssnPrivacy: Boolean(value.safety.ssnPrivacy),
          optOut: Boolean(value.safety.optOut),
          humanRequired: Boolean(value.safety.humanRequired)
        }
      : null
  };
}

function buildCaseRow({
  organizationId,
  prospectId,
  ownerUserId,
  signal,
  observation,
  context,
  structuredDecision,
  inboundMessageId
}) {
  return {
    id: crypto.randomUUID(),
    organizationId,
    prospectId: prospectId || null,
    ownerUserId: ownerUserId || null,
    inboundMessageId: inboundMessageId || null,
    sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2_SEMANTIC,
    signalType: signal.type,
    episodeKey: buildEpisodeKey({
      organizationId,
      prospectId,
      signalType: signal.type
    }),
    legacyInterpretation: compactInterpretation(observation?.legacy),
    semanticInterpretation: compactInterpretation(observation?.semantic),
    knownFactsBefore: summarizeFacts(context?.knownFacts),
    knownFactsAfter: summarizeFacts(context?.knownFacts),
    atlasAction:
      structuredDecision?.decision?.nextAction ||
      structuredDecision?.customerReplyPlan?.templateKey ||
      null,
    confidence: observation?.confidence ?? null,
    disagreementFields: observation?.comparison?.disagreements || [],
    latencyMs: observation?.latencyMs ?? null,
    promptTokens: observation?.tokenUsage?.promptTokens ?? null,
    completionTokens: observation?.tokenUsage?.completionTokens ?? null,
    estimatedCostUsd: observation?.estimatedCostUsd ?? null,
    detectedAt: new Date().toISOString(),
    status: CASE_STATUSES.NEW,
    severity: signal.severity,
    reviewerUserId: null,
    reviewNotes: null,
    expectedBehavior: null,
    regressionCandidateId: null,
    inboundTextStored: false
  };
}

async function captureFromSemanticShadow({
  observation = null,
  organizationId = null,
  actingUserId = null,
  prospectId = null,
  inboundMessageId = null,
  inboundText = "",
  context = null,
  interpretation = null,
  structuredDecision = null,
  execution = null,
  tenantSettings = null,
  store,
  env,
  sampleRoll = 0
} = {}) {
  const gate = isCaptureEligible({
    organizationId,
    tenantSettings,
    env,
    sampleRoll
  });
  if (!gate.eligible) {
    return { captured: false, reason: gate.reason, caseIds: [] };
  }

  const signals = classifySignals({
    observation,
    inboundText,
    context,
    interpretation,
    structuredDecision,
    execution
  });
  if (!signals.length) {
    return { captured: false, reason: "NO_QUALITY_SIGNAL", caseIds: [] };
  }

  const caseIds = [];
  const skipped = [];
  for (const signal of signals) {
    const row = buildCaseRow({
      organizationId,
      prospectId,
      ownerUserId: actingUserId,
      signal,
      observation,
      context,
      structuredDecision,
      inboundMessageId
    });
    const existing = await store.findOpenByEpisodeKey(organizationId, row.episodeKey);
    if (existing) {
      skipped.push({ signalType: signal.type, reason: "DUPLICATE_EPISODE", caseId: existing.id });
      continue;
    }
    await store.insertCase(row);
    caseIds.push(row.id);
  }

  return {
    captured: caseIds.length > 0,
    reason: caseIds.length ? null : "DUPLICATE_EPISODE",
    caseIds,
    skipped,
    severity: highestSeverity(signals)
  };
}

module.exports = {
  compactInterpretation,
  buildCaseRow,
  captureFromSemanticShadow
};
