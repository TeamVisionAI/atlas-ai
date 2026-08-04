/**
 * Monthly contribution future-value utility (RC3).
 * Ordinary annuity, monthly compounding. Not React. Not guaranteed returns.
 */

function roundCurrency(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @param {{ monthlyContribution: number, annualReturn: number, horizonYears: number, initialInvestment?: number }} input
 */
function calculateMonthlyFutureValue(input = {}) {
  const monthlyContribution = Number(input.monthlyContribution);
  const annualReturn = Number(input.annualReturn);
  const horizonYears = Number(input.horizonYears);
  const initialInvestment =
    input.initialInvestment == null || input.initialInvestment === ""
      ? 0
      : Number(input.initialInvestment);

  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) {
    const error = new Error("monthlyContribution must be a non-negative number.");
    error.statusCode = 400;
    error.publicCode = "FI_INVALID_MONTHLY_CONTRIBUTION";
    throw error;
  }

  if (!Number.isFinite(annualReturn) || annualReturn < -0.99) {
    const error = new Error("annualReturn must be a finite number >= -0.99.");
    error.statusCode = 400;
    error.publicCode = "FI_INVALID_ANNUAL_RETURN";
    throw error;
  }

  if (!Number.isFinite(horizonYears) || horizonYears <= 0) {
    const error = new Error("horizonYears must be a positive number.");
    error.statusCode = 400;
    error.publicCode = "FI_INVALID_HORIZON";
    throw error;
  }

  if (!Number.isFinite(initialInvestment) || initialInvestment < 0) {
    const error = new Error("initialInvestment must be a non-negative number.");
    error.statusCode = 400;
    error.publicCode = "FI_INVALID_INITIAL_INVESTMENT";
    throw error;
  }

  const months = Math.round(horizonYears * 12);
  const monthlyRate = annualReturn / 12;

  let endingValue = initialInvestment;
  for (let i = 0; i < months; i += 1) {
    endingValue = endingValue * (1 + monthlyRate) + monthlyContribution;
  }

  const totalContributions = initialInvestment + monthlyContribution * months;
  const illustrativeGrowth = endingValue - totalContributions;

  return Object.freeze({
    monthlyContribution: roundCurrency(monthlyContribution),
    annualReturn,
    horizonYears,
    months,
    initialInvestment: roundCurrency(initialInvestment),
    totalContributions: roundCurrency(totalContributions),
    illustrativeGrowth: roundCurrency(illustrativeGrowth),
    illustrativeEndingValue: roundCurrency(endingValue),
    compounding: "monthly",
    annuityType: "ordinary",
    guaranteed: false
  });
}

module.exports = {
  calculateMonthlyFutureValue,
  roundCurrency
};
