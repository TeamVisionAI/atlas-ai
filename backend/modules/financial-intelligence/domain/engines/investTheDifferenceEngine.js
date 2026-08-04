/**
 * Invest-the-Difference Strategy Evaluation engine (RC3).
 * Planning illustration only — not a client recommendation (BR-066).
 */

const { CURRENCY_TOLERANCE, RISK_PROFILES, SECTION_TITLE } = require("../constants");
const { roundCurrency } = require("../adapters/currentIulSnapshotAdapter");
const { normalizeTermQuote } = require("../models/termQuoteModel");
const { resolveStrategyEvaluationStatus } = require("../models/strategyEvaluationStatus");
const {
  PROJECTION_SCENARIOS,
  PROJECTION_DISCLAIMER,
  listProjectionScenarios
} = require("../projections/projectionAssumptions");
const { calculateMonthlyFutureValue } = require("../projections/monthlyFutureValue");

function nearlyEqual(a, b, tolerance = CURRENCY_TOLERANCE) {
  return Math.abs(a - b) <= tolerance;
}

function buildTalkingPoints({
  snapshot,
  termQuote,
  monthlyInvestmentDifference,
  totalProposedMonthlyOutlay
}) {
  const premiumLabel =
    termQuote?.monthlyPremium != null
      ? `$${Number(termQuote.monthlyPremium).toFixed(2)}`
      : "[term premium pending confirmation]";
  const termLabel =
    termQuote?.selectedTermDuration != null
      ? `${termQuote.selectedTermDuration}-year`
      : "[term duration pending]";

  return [
    `The client currently pays $${Number(snapshot.currentMonthlyPremium).toFixed(2)} per month for an IUL with a $${Number(snapshot.currentDeathBenefit).toLocaleString()} death benefit.`,
    `An initial Primerica term discussion scenario evaluates a ${termLabel} term using the same $${Number(snapshot.currentDeathBenefit).toLocaleString()} death benefit.`,
    termQuote?.monthlyPremium != null
      ? `If the term premium is confirmed at ${premiumLabel} per month, the remaining $${Number(monthlyInvestmentDifference).toFixed(2)} per month may be evaluated for mutual-fund investing under educational assumptions.`
      : "An official or representative-confirmed term premium is required before an investable difference can be finalized.",
    `The total proposed monthly outlay remains $${Number(totalProposedMonthlyOutlay).toFixed(2)} unless a documented representative override exists.`,
    "The representative must review insurability, replacement implications, surrender charges, policy loans, tax considerations, risk profile, investment suitability, product availability, and official illustrations before the client makes a decision."
  ];
}

/**
 * Build a full Invest-the-Difference strategy evaluation (pure).
 */
function buildInvestTheDifferenceEvaluation({
  snapshotResult,
  termQuoteInput = null,
  investmentHorizon = null,
  riskProfile = RISK_PROFILES.NOT_COMPLETED,
  replacementAcknowledged = false,
  override = null,
  forceClientDiscussion = false
} = {}) {
  const snapshotOk = Boolean(snapshotResult?.ok && snapshotResult.snapshot);
  const snapshot = snapshotResult?.snapshot || null;
  const missingPolicyFields = snapshotResult?.missing || [];

  const termQuote = termQuoteInput ? normalizeTermQuote(termQuoteInput) : null;

  const horizonYears =
    investmentHorizon && investmentHorizon.years != null
      ? Number(investmentHorizon.years)
      : null;

  const hasOverride = Boolean(
    override &&
      override.totalProposedMonthlyOutlay != null &&
      Number.isFinite(Number(override.totalProposedMonthlyOutlay))
  );

  const statusResolution = resolveStrategyEvaluationStatus({
    snapshotOk,
    missingPolicyFields,
    termQuote,
    investmentHorizonYears: horizonYears,
    riskProfile: riskProfile || RISK_PROFILES.NOT_COMPLETED,
    replacementAcknowledged,
    hasOverride,
    forceClientDiscussion
  });

  if (!snapshotOk || !snapshot) {
    return Object.freeze({
      sectionTitle: SECTION_TITLE,
      status: statusResolution.status,
      missingDataWarnings: statusResolution.missingDataWarnings,
      replacementWarnings: statusResolution.replacementWarnings,
      canEmphasizeInvestmentScenario: false,
      canViewEducationalIllustration: false,
      snapshot: null,
      calculations: null,
      projections: null,
      comparisonTable: null,
      talkingPoints: [
        "Confirm the current IUL monthly premium and death benefit from Policy Intelligence before building a discussion scenario."
      ],
      disclaimers: buildDisclaimers(),
      metadata: Object.freeze({
        engine: "invest_the_difference_strategy_evaluation",
        version: "1.0.0",
        br066: true,
        recommendsPurchase: false,
        recommendsSurrender: false
      })
    });
  }

  const currentIulMonthlyPremium = snapshot.currentMonthlyPremium;
  const currentIulDeathBenefit = snapshot.currentDeathBenefit;
  const enteredTermDeathBenefit =
    termQuote?.deathBenefit != null && Number.isFinite(Number(termQuote.deathBenefit))
      ? Number(termQuote.deathBenefit)
      : null;
  // Default = same death benefit. Any different entered value is an explicit representative adjustment.
  const proposedTermDeathBenefit =
    enteredTermDeathBenefit != null ? enteredTermDeathBenefit : currentIulDeathBenefit;
  const sameDeathBenefit = proposedTermDeathBenefit === currentIulDeathBenefit;

  const proposedTermMonthlyPremium =
    termQuote && !termQuote.isMissing ? termQuote.monthlyPremium : null;

  let totalProposedMonthlyOutlay = currentIulMonthlyPremium;
  let overrideRecord = null;

  if (hasOverride) {
    if (!override.reason || !String(override.reason).trim()) {
      const error = new Error("Representative override requires a reason.");
      error.statusCode = 400;
      error.publicCode = "FI_OVERRIDE_REASON_REQUIRED";
      throw error;
    }
    totalProposedMonthlyOutlay = roundCurrency(Number(override.totalProposedMonthlyOutlay));
    overrideRecord = Object.freeze({
      totalProposedMonthlyOutlay,
      reason: String(override.reason).trim(),
      originalGeneratedOutlay: currentIulMonthlyPremium,
      appliedAt: new Date().toISOString()
    });
  }

  let unboundedPremiumDifference = null;
  let monthlyInvestmentDifference = null;
  let proposedMutualFundContribution = null;
  let validation = null;
  let negativeDifferenceFlag = false;

  if (proposedTermMonthlyPremium != null) {
    unboundedPremiumDifference = roundCurrency(
      currentIulMonthlyPremium - proposedTermMonthlyPremium
    );
    monthlyInvestmentDifference = roundCurrency(Math.max(0, unboundedPremiumDifference));
    proposedMutualFundContribution = monthlyInvestmentDifference;
    negativeDifferenceFlag = unboundedPremiumDifference < 0;

    const sum = roundCurrency(proposedTermMonthlyPremium + proposedMutualFundContribution);
    validation = Object.freeze({
      passesOutlayIdentity: nearlyEqual(sum, totalProposedMonthlyOutlay),
      left: sum,
      right: totalProposedMonthlyOutlay,
      tolerance: CURRENCY_TOLERANCE
    });
  }

  const projections =
    monthlyInvestmentDifference != null &&
    monthlyInvestmentDifference > 0 &&
    horizonYears != null &&
    horizonYears > 0
      ? buildProjections(monthlyInvestmentDifference, horizonYears)
      : null;

  const emphasize =
    statusResolution.canEmphasizeInvestmentScenario &&
    riskProfile &&
    riskProfile !== RISK_PROFILES.NOT_COMPLETED;

  const highlightedScenarioId = emphasize
    ? mapRiskToScenarioId(riskProfile)
    : null;

  const comparisonTable = Object.freeze({
    deathBenefit: Object.freeze({
      existingIul: currentIulDeathBenefit,
      discussionScenario: proposedTermDeathBenefit
    }),
    monthlyInsurancePremium: Object.freeze({
      existingIul: currentIulMonthlyPremium,
      discussionScenario: proposedTermMonthlyPremium
    }),
    monthlyInvestmentAmount: Object.freeze({
      existingIul: 0,
      discussionScenario: proposedMutualFundContribution
    }),
    totalMonthlyOutlay: Object.freeze({
      existingIul: currentIulMonthlyPremium,
      discussionScenario: totalProposedMonthlyOutlay
    })
  });

  const extraWarnings = [...statusResolution.missingDataWarnings];
  if (!sameDeathBenefit) {
    extraWarnings.push(
      "Proposed term death benefit differs from the current IUL death benefit. This is an explicit representative adjustment — not the default same-death-benefit discussion scenario."
    );
  }
  if (negativeDifferenceFlag) {
    extraWarnings.push(
      "Proposed term premium exceeds the current IUL monthly premium. Investable difference is zero. Maintaining the same death benefit and selected term may exceed the existing monthly outlay — representative review required."
    );
  }
  if (monthlyInvestmentDifference === 0 && proposedTermMonthlyPremium != null && !negativeDifferenceFlag) {
    extraWarnings.push("No monthly premium difference is available for mutual-fund illustration.");
  }

  return Object.freeze({
    sectionTitle: SECTION_TITLE,
    status: statusResolution.status,
    missingDataWarnings: Object.freeze(extraWarnings),
    replacementWarnings: statusResolution.replacementWarnings,
    canEmphasizeInvestmentScenario: statusResolution.canEmphasizeInvestmentScenario,
    canViewEducationalIllustration: statusResolution.canViewEducationalIllustration,
    snapshot,
    termQuote,
    investmentHorizon: investmentHorizon
      ? Object.freeze({
          years: horizonYears,
          goalLabel: investmentHorizon.goalLabel || null,
          source: investmentHorizon.source || "representative",
          confirmed: Boolean(investmentHorizon.confirmed)
        })
      : null,
    riskProfile: riskProfile || RISK_PROFILES.NOT_COMPLETED,
    highlightedScenarioId,
    highlightedScenarioLabel: emphasize
      ? "Scenario most aligned with the information currently available"
      : null,
    override: overrideRecord,
    calculations: Object.freeze({
      currentIulMonthlyPremium,
      currentIulDeathBenefit,
      proposedTermDeathBenefit,
      proposedTermMonthlyPremium,
      sameDeathBenefit,
      totalProposedMonthlyOutlay,
      unboundedPremiumDifference,
      monthlyInvestmentDifference,
      proposedMutualFundContribution,
      validation,
      negativeDifferenceFlag
    }),
    projections,
    comparisonTable,
    talkingPoints: Object.freeze(
      buildTalkingPoints({
        snapshot,
        termQuote,
        monthlyInvestmentDifference: monthlyInvestmentDifference ?? 0,
        totalProposedMonthlyOutlay
      })
    ),
    disclaimers: buildDisclaimers(),
    metadata: Object.freeze({
      engine: "invest_the_difference_strategy_evaluation",
      version: "1.0.0",
      br066: true,
      recommendsPurchase: false,
      recommendsSurrender: false,
      language: "discussion_scenario"
    })
  });
}

function mapRiskToScenarioId(riskProfile) {
  if (riskProfile === RISK_PROFILES.CONSERVATIVE) {
    return PROJECTION_SCENARIOS.CONSERVATIVE.id;
  }
  if (riskProfile === RISK_PROFILES.AGGRESSIVE) {
    return PROJECTION_SCENARIOS.AGGRESSIVE.id;
  }
  if (riskProfile === RISK_PROFILES.MODERATE) {
    return PROJECTION_SCENARIOS.MODERATE.id;
  }
  return null;
}

function buildProjections(monthlyContribution, horizonYears) {
  const scenarios = listProjectionScenarios().map((scenario) => {
    const result = calculateMonthlyFutureValue({
      monthlyContribution,
      annualReturn: scenario.annualReturn,
      horizonYears
    });
    return Object.freeze({
      ...scenario,
      monthlyContribution: result.monthlyContribution,
      timeHorizonYears: horizonYears,
      totalContributions: result.totalContributions,
      illustrativeGrowth: result.illustrativeGrowth,
      illustrativeProjectedValue: result.illustrativeEndingValue,
      projection: result
    });
  });

  return Object.freeze({
    scenarios: Object.freeze(scenarios),
    disclaimer: PROJECTION_DISCLAIMER
  });
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

module.exports = {
  buildInvestTheDifferenceEvaluation,
  nearlyEqual
};
