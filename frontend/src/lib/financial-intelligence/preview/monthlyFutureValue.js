/**
 * Mirrors backend monthlyFutureValue.js — keep in sync.
 * Ordinary annuity, monthly compounding. Not guaranteed returns.
 */

function roundCurrency(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateMonthlyFutureValue({
  monthlyContribution,
  annualReturn,
  horizonYears,
  initialInvestment = 0
} = {}) {
  const contribution = Number(monthlyContribution);
  const rateAnnual = Number(annualReturn);
  const years = Number(horizonYears);
  const initial = Number(initialInvestment) || 0;

  if (!Number.isFinite(contribution) || contribution < 0) {
    throw new Error("monthlyContribution must be a non-negative number.");
  }
  if (!Number.isFinite(rateAnnual) || rateAnnual < -0.99) {
    throw new Error("annualReturn must be a finite number >= -0.99.");
  }
  if (!Number.isFinite(years) || years <= 0) {
    throw new Error("horizonYears must be a positive number.");
  }

  const months = Math.round(years * 12);
  const monthlyRate = rateAnnual / 12;
  let endingValue = initial;
  for (let i = 0; i < months; i += 1) {
    endingValue = endingValue * (1 + monthlyRate) + contribution;
  }

  const totalContributions = initial + contribution * months;
  return Object.freeze({
    monthlyContribution: roundCurrency(contribution),
    annualReturn: rateAnnual,
    horizonYears: years,
    months,
    initialInvestment: roundCurrency(initial),
    totalContributions: roundCurrency(totalContributions),
    illustrativeGrowth: roundCurrency(endingValue - totalContributions),
    illustrativeEndingValue: roundCurrency(endingValue),
    compounding: "monthly",
    annuityType: "ordinary",
    guaranteed: false
  });
}

export { roundCurrency };
