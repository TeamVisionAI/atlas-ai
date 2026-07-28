/**
 * Sprint 12 — AI confidence profile for Mission Control (Alpha).
 * Extends rule-based confidence with qualification signals and risk level.
 */

const { assessQualificationFromProspect } = require("./recruitingQualificationEngine");

function resolveRiskLevel(confidencePercent) {
  if (confidencePercent >= 85) {
    return "Low";
  }

  if (confidencePercent >= 70) {
    return "Medium";
  }

  return "High";
}

function resolveWorkAuthorization(prospect = {}, brain = {}) {
  if (prospect.work_authorized === true) {
    return true;
  }

  if (prospect.work_authorized === false) {
    return false;
  }

  const authorizationField = (brain.missingFields || []).includes("authorization")
    ? null
    : brain.authorization;

  if (authorizationField === true || authorizationField === false) {
    return authorizationField;
  }

  return null;
}

function buildConfidenceProfile({
  actionCenter = {},
  workflow = {},
  brain = {},
  prospect = {}
}) {
  const assessment = assessQualificationFromProspect(prospect || {});
  const baseConfidence = actionCenter.confidence ?? assessment.confidence ?? 0.62;
  const confidencePercent = Math.round(Math.min(100, Math.max(0, baseConfidence * 100)));
  const language = prospect.communication_language || brain.language || "en";
  const workAuthorization = resolveWorkAuthorization(prospect, brain);

  let reason = actionCenter.reason || "Atlas evaluated the current recruiting state.";

  if (assessment.isInterviewScheduled) {
    reason = "Interview is scheduled and confirmation workflow is active.";
  } else if (assessment.readyForScheduling) {
    reason = "Prospect is qualified and ready for interview scheduling.";
  } else if (assessment.isQualified) {
    reason = "Core qualification fields are complete.";
  } else if (assessment.preScheduleFields?.length) {
    reason = `Collect remaining fields: ${assessment.preScheduleFields.join(", ")}.`;
  }

  if (workflow.needsHumanAttention) {
    reason = "Human attention recommended before Atlas continues autonomously.";
  }

  return {
    confidence: baseConfidence,
    confidencePercent,
    reason,
    qualified: assessment.isQualified,
    interviewScheduled: assessment.isInterviewScheduled,
    workAuthorization,
    language: String(language).toLowerCase().startsWith("es") ? "Spanish" : "English",
    riskLevel: resolveRiskLevel(confidencePercent),
    signals: {
      readyForScheduling: assessment.readyForScheduling,
      missingFields: assessment.missingFields || [],
      priorityTier: workflow.missionControlPriorityTier || null,
      needsHumanAttention: Boolean(workflow.needsHumanAttention),
      stalled: Boolean(workflow.stall?.isStalled)
    }
  };
}

function enrichActionCenterWithConfidence(actionCenter, context = {}) {
  if (!actionCenter) {
    return null;
  }

  const profile = buildConfidenceProfile({
    actionCenter,
    workflow: context.workflow || {},
    brain: context.brain || {},
    prospect: context.prospect || {}
  });

  return {
    ...actionCenter,
    ...profile,
    humanOverrides: {
      approve: actionCenter.actionId || null,
      edit: true,
      retry: true,
      escalate: true
    }
  };
}

module.exports = {
  buildConfidenceProfile,
  enrichActionCenterWithConfidence,
  resolveRiskLevel
};
