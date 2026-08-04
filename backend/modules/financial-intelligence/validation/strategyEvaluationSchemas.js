/**
 * Lightweight input validation for FI strategy evaluation APIs (RC3).
 */

const { PREMIUM_SOURCES, RISK_PROFILES } = require("../domain/constants");

function badRequest(message, publicCode = "FI_VALIDATION_ERROR") {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicCode = publicCode;
  return error;
}

function requireObject(body, label = "body") {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest(`${label} must be an object.`);
  }
  return body;
}

function validateTermQuoteInput(body) {
  const input = requireObject(body, "termQuote");
  if (input.monthlyPremium != null && !Number.isFinite(Number(input.monthlyPremium))) {
    throw badRequest("monthlyPremium must be numeric.", "FI_INVALID_TERM_PREMIUM");
  }
  if (input.termDurationYears != null && !Number.isFinite(Number(input.termDurationYears))) {
    throw badRequest("termDurationYears must be numeric.", "FI_INVALID_TERM_DURATION");
  }
  if (
    input.premiumSource != null &&
    !Object.values(PREMIUM_SOURCES).includes(String(input.premiumSource).toUpperCase())
  ) {
    throw badRequest("premiumSource is not recognized.", "FI_INVALID_PREMIUM_SOURCE");
  }
  return input;
}

function validateInvestmentHorizonInput(body) {
  const input = requireObject(body, "investmentHorizon");
  if (input.years == null || !Number.isFinite(Number(input.years)) || Number(input.years) <= 0) {
    throw badRequest("investmentHorizon.years must be a positive number.", "FI_INVALID_HORIZON");
  }
  return {
    years: Number(input.years),
    goalLabel: input.goalLabel || null,
    source: input.source || "representative",
    confirmed: Boolean(input.confirmed)
  };
}

function validateRiskProfileInput(body) {
  const input = requireObject(body, "riskProfile");
  const profile = String(input.riskProfile || input.profile || "").toUpperCase();
  if (!Object.values(RISK_PROFILES).includes(profile)) {
    throw badRequest("riskProfile is not recognized.", "FI_INVALID_RISK_PROFILE");
  }
  return profile;
}

function validateOverrideInput(body) {
  const input = requireObject(body, "override");
  if (
    input.totalProposedMonthlyOutlay == null ||
    !Number.isFinite(Number(input.totalProposedMonthlyOutlay))
  ) {
    throw badRequest(
      "override.totalProposedMonthlyOutlay must be numeric.",
      "FI_INVALID_OVERRIDE_OUTLAY"
    );
  }
  if (!input.reason || !String(input.reason).trim()) {
    throw badRequest("override.reason is required.", "FI_OVERRIDE_REASON_REQUIRED");
  }
  return {
    totalProposedMonthlyOutlay: Number(input.totalProposedMonthlyOutlay),
    reason: String(input.reason).trim()
  };
}

module.exports = {
  validateTermQuoteInput,
  validateInvestmentHorizonInput,
  validateRiskProfileInput,
  validateOverrideInput
};
