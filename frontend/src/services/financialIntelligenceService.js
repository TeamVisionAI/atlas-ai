/**
 * Financial Intelligence API client (RC3 Phase B).
 * Backend is the sole calculation authority.
 */

import { apiFetch } from "./apiClient";

export async function fetchFinancialIntelligenceSummary() {
  return apiFetch("/api/financial-intelligence");
}

export async function createStrategyEvaluation(reviewId, body = {}) {
  if (!reviewId) {
    throw new Error("reviewId is required.");
  }
  const payload = await apiFetch("/api/financial-intelligence/evaluations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewId, ...body })
  });
  return payload.evaluation;
}

export async function fetchLatestStrategyEvaluation(reviewId) {
  if (!reviewId) {
    throw new Error("reviewId is required.");
  }
  const payload = await apiFetch(
    `/api/financial-intelligence/reviews/${encodeURIComponent(reviewId)}/evaluations/latest`
  );
  return payload.evaluation || null;
}

export async function fetchStrategyEvaluationHistory(reviewId) {
  if (!reviewId) {
    throw new Error("reviewId is required.");
  }
  const payload = await apiFetch(
    `/api/financial-intelligence/reviews/${encodeURIComponent(reviewId)}/evaluations/history`
  );
  return payload.evaluations || [];
}

export async function updateTermQuote(evaluationId, termQuote) {
  const payload = await apiFetch(
    `/api/financial-intelligence/evaluations/${encodeURIComponent(evaluationId)}/term-quote`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termQuote })
    }
  );
  return payload.evaluation;
}

export async function updateInvestmentHorizon(evaluationId, investmentHorizon) {
  const payload = await apiFetch(
    `/api/financial-intelligence/evaluations/${encodeURIComponent(evaluationId)}/investment-horizon`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investmentHorizon })
    }
  );
  return payload.evaluation;
}

export async function updateRiskProfile(evaluationId, riskProfile) {
  const payload = await apiFetch(
    `/api/financial-intelligence/evaluations/${encodeURIComponent(evaluationId)}/risk-profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskProfile })
    }
  );
  return payload.evaluation;
}

export async function acknowledgeReplacement(evaluationId, acknowledged = true) {
  const payload = await apiFetch(
    `/api/financial-intelligence/evaluations/${encodeURIComponent(evaluationId)}/replacement-acknowledgement`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged })
    }
  );
  return payload.evaluation;
}

export async function applyEvaluationOverride(evaluationId, override) {
  const payload = await apiFetch(
    `/api/financial-intelligence/evaluations/${encodeURIComponent(evaluationId)}/override`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override })
    }
  );
  return payload.evaluation;
}
