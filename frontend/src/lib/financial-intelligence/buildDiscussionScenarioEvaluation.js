/**
 * Preview/local builder for Invest-the-Difference Strategy Evaluation.
 * Mirrors backend investTheDifferenceEngine — keep in sync. Not React.
 */

import { calculateMonthlyFutureValue } from "./monthlyFutureValue.js";

export const SECTION_TITLE =
  "Possible Discussion Scenarios for the Primerica Representative";

export const CURRENCY_TOLERANCE = 0.02;

export const PROJECTION_SCENARIOS = Object.freeze({
  CONSERVATIVE: Object.freeze({
    id: "conservative",
    label: "Conservative",
    annualReturn: 0.04
  }),
  MODERATE: Object.freeze({
    id: "moderate_growth",
    label: "Moderate Growth",
    annualReturn: 0.07
  }),
  AGGRESSIVE: Object.freeze({
    id: "aggressive_growth",
    label: "Aggressive Growth",
    annualReturn: 0.1
  })
});

const REPLACEMENT_WARNINGS = Object.freeze([
  "Do not cancel or surrender the existing policy before new coverage is approved, issued, accepted, paid, and confirmed in force.",
  "The proposed term coverage may be declined, rated, delayed, or modified through underwriting.",
  "Replacement forms and procedures may be required.",
  "Existing surrender charges, loans, tax consequences, riders, guarantees, contestability periods, and other policy differences must be reviewed.",
  "Term insurance does not build cash value and expires after the selected term.",
  "Mutual funds fluctuate and may lose value.",
  "Investment returns are not guaranteed."
]);

function roundCurrency(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeToMonthlyPremium(amount, frequency) {
  const premium = Number(amount);
  if (!Number.isFinite(premium) || premium < 0) {
    return null;
  }
  const freq = String(frequency || "monthly").toLowerCase();
  if (freq.includes("year") || freq === "annual" || freq === "annually") {
    return premium / 12;
  }
  if (freq.includes("quarter")) {
    return premium / 3;
  }
  if (freq.includes("semi") || freq.includes("half")) {
    return premium / 6;
  }
  if (freq.includes("bi") && freq.includes("week")) {
    return (premium * 26) / 12;
  }
  if (freq.includes("week")) {
    return (premium * 52) / 12;
  }
  return premium;
}

/**
 * Build discussion-scenario evaluation from PI-style snapshot + representative inputs.
 */
export function buildDiscussionScenarioEvaluation({
  policySnapshot,
  termQuote = null,
  investmentHorizonYears = null,
  riskProfile = "NOT_COMPLETED"
} = {}) {
  const missingDataWarnings = [];
  const productType = policySnapshot?.productType || policySnapshot?.product || "";
  const iulOk = /iul|indexed|universal life/i.test(productType);
  const currentMonthlyPremium = roundCurrency(
    normalizeToMonthlyPremium(
      policySnapshot?.premium?.amount,
      policySnapshot?.premium?.frequency
    )
  );
  const currentDeathBenefit = Number(policySnapshot?.faceAmount);

  if (!iulOk || currentMonthlyPremium == null || !Number.isFinite(currentDeathBenefit)) {
    missingDataWarnings.push(
      "Upload or confirm the current IUL statement: monthly premium and death benefit are required."
    );
    return Object.freeze({
      sectionTitle: SECTION_TITLE,
      status: "DRAFT_MISSING_POLICY_DATA",
      missingDataWarnings,
      replacementWarnings: REPLACEMENT_WARNINGS,
      canEmphasizeInvestmentScenario: false,
      calculations: null,
      projections: null,
      comparisonTable: null,
      riskProfile,
      disclaimers: buildDisclaimers()
    });
  }

  const proposedTermDeathBenefit = currentDeathBenefit;
  const proposedTermMonthlyPremium =
    termQuote?.monthlyPremium != null ? roundCurrency(Number(termQuote.monthlyPremium)) : null;
  const selectedTermDuration = termQuote?.termDurationYears ?? termQuote?.selectedTermDuration ?? null;
  const premiumSource = termQuote?.premiumSource || "MISSING";
  const longestAvailableTermConfirmed = Boolean(termQuote?.longestAvailableTermConfirmed);

  if (proposedTermMonthlyPremium == null) {
    missingDataWarnings.push(
      "Obtain an official Primerica term quote or enter a representative-confirmed premium."
    );
  } else if (!longestAvailableTermConfirmed || premiumSource === "PRELIMINARY_ESTIMATE") {
    missingDataWarnings.push(
      "The representative must confirm the longest available Primerica term and official premium."
    );
  }

  if (investmentHorizonYears == null || Number(investmentHorizonYears) <= 0) {
    missingDataWarnings.push(
      "Confirm the investment time horizon before emphasizing a projected result."
    );
  }

  if (!riskProfile || riskProfile === "NOT_COMPLETED") {
    missingDataWarnings.push(
      "Complete the client risk-profile process before emphasizing an investment scenario."
    );
  }

  const totalProposedMonthlyOutlay = currentMonthlyPremium;
  let unboundedPremiumDifference = null;
  let monthlyInvestmentDifference = null;

  if (proposedTermMonthlyPremium != null) {
    unboundedPremiumDifference = roundCurrency(
      currentMonthlyPremium - proposedTermMonthlyPremium
    );
    monthlyInvestmentDifference = roundCurrency(Math.max(0, unboundedPremiumDifference));
    if (unboundedPremiumDifference < 0) {
      missingDataWarnings.push(
        "Proposed term premium exceeds the current IUL monthly premium. Investable difference is zero. Representative review required."
      );
    }
  }

  const horizonYears =
    investmentHorizonYears != null && Number(investmentHorizonYears) > 0
      ? Number(investmentHorizonYears)
      : null;

  const projections =
    monthlyInvestmentDifference != null &&
    monthlyInvestmentDifference > 0 &&
    horizonYears != null
      ? {
          scenarios: Object.values(PROJECTION_SCENARIOS).map((scenario) => {
            const result = calculateMonthlyFutureValue({
              monthlyContribution: monthlyInvestmentDifference,
              annualReturn: scenario.annualReturn,
              horizonYears
            });
            return {
              ...scenario,
              totalContributions: result.totalContributions,
              illustrativeGrowth: result.illustrativeGrowth,
              illustrativeProjectedValue: result.illustrativeEndingValue
            };
          }),
          disclaimer: {
            hypothetical: true,
            educational: true,
            guaranteed: false,
            methodology:
              "Future value of an ordinary annuity with monthly contributions and monthly compounding. Figures are before investment fees, expenses, taxes, and inflation unless separately disclosed."
          }
        }
      : null;

  const canEmphasize =
    riskProfile &&
    riskProfile !== "NOT_COMPLETED" &&
    longestAvailableTermConfirmed &&
    premiumSource !== "PRELIMINARY_ESTIMATE" &&
    horizonYears != null;

  return Object.freeze({
    sectionTitle: SECTION_TITLE,
    status: deriveStatus({
      proposedTermMonthlyPremium,
      longestAvailableTermConfirmed,
      premiumSource,
      horizonYears,
      riskProfile
    }),
    missingDataWarnings: Object.freeze([...missingDataWarnings]),
    replacementWarnings: REPLACEMENT_WARNINGS,
    canEmphasizeInvestmentScenario: Boolean(canEmphasize),
    riskProfile,
    highlightedScenarioId: canEmphasize ? mapRisk(riskProfile) : null,
    termQuote: termQuote
      ? Object.freeze({
          selectedTermDuration,
          monthlyPremium: proposedTermMonthlyPremium,
          premiumSource,
          longestAvailableTermConfirmed,
          productLabel: termQuote.productLabel || null
        })
      : null,
    investmentHorizon: horizonYears
      ? Object.freeze({ years: horizonYears, source: "representative" })
      : null,
    calculations: Object.freeze({
      currentIulMonthlyPremium: currentMonthlyPremium,
      currentIulDeathBenefit: currentDeathBenefit,
      proposedTermDeathBenefit,
      proposedTermMonthlyPremium,
      totalProposedMonthlyOutlay,
      unboundedPremiumDifference,
      monthlyInvestmentDifference,
      proposedMutualFundContribution: monthlyInvestmentDifference,
      negativeDifferenceFlag:
        unboundedPremiumDifference != null && unboundedPremiumDifference < 0
    }),
    projections,
    comparisonTable: Object.freeze({
      deathBenefit: Object.freeze({
        existingIul: currentDeathBenefit,
        discussionScenario: proposedTermDeathBenefit
      }),
      monthlyInsurancePremium: Object.freeze({
        existingIul: currentMonthlyPremium,
        discussionScenario: proposedTermMonthlyPremium
      }),
      monthlyInvestmentAmount: Object.freeze({
        existingIul: 0,
        discussionScenario: monthlyInvestmentDifference
      }),
      totalMonthlyOutlay: Object.freeze({
        existingIul: currentMonthlyPremium,
        discussionScenario: totalProposedMonthlyOutlay
      })
    }),
    disclaimers: buildDisclaimers()
  });
}

function deriveStatus({
  proposedTermMonthlyPremium,
  longestAvailableTermConfirmed,
  premiumSource,
  horizonYears,
  riskProfile
}) {
  if (proposedTermMonthlyPremium == null) {
    return "DRAFT_TERM_QUOTE_REQUIRED";
  }
  if (!longestAvailableTermConfirmed || premiumSource === "PRELIMINARY_ESTIMATE") {
    return "DRAFT_TERM_CONFIRMATION_REQUIRED";
  }
  if (horizonYears == null) {
    return "DRAFT_INVESTMENT_HORIZON_REQUIRED";
  }
  if (!riskProfile || riskProfile === "NOT_COMPLETED") {
    return "DRAFT_RISK_PROFILE_REQUIRED";
  }
  return "READY_FOR_REPRESENTATIVE_REVIEW";
}

function mapRisk(riskProfile) {
  if (riskProfile === "CONSERVATIVE") {
    return "conservative";
  }
  if (riskProfile === "AGGRESSIVE") {
    return "aggressive_growth";
  }
  if (riskProfile === "MODERATE") {
    return "moderate_growth";
  }
  return null;
}

function buildDisclaimers() {
  return Object.freeze([
    "Planning illustration for representative discussion only. Not a client recommendation.",
    "Atlas informs. Representatives recommend. Clients decide.",
    "Investment projections are hypothetical and non-guaranteed.",
    "Specific mutual-fund symbols are not recommended in this evaluation.",
    "Official product eligibility, premiums, replacement requirements, and investment suitability must be verified outside any preliminary estimate."
  ]);
}
