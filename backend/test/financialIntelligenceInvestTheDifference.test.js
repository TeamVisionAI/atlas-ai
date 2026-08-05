/**
 * RC3 Phase A — Invest-the-Difference Strategy Evaluation tests.
 * Covers adapter, engine, projections, status, quote sources, overrides, BR-066 language.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCurrentIulSnapshot,
  normalizeToMonthlyPremium,
  buildInvestTheDifferenceEvaluation,
  calculateMonthlyFutureValue,
  PROJECTION_SCENARIOS,
  resolveStrategyEvaluationStatus,
  PREMIUM_SOURCES,
  RISK_PROFILES,
  EVALUATION_STATUSES,
  SECTION_TITLE,
  CURRENCY_TOLERANCE,
  getFundCatalog
} = require("../modules/financial-intelligence");

const {
  nearlyEqual
} = require("../modules/financial-intelligence/domain/engines/investTheDifferenceEngine");

function iulFacts(overrides = {}) {
  return {
    layer: "insurance_facts",
    immutable: true,
    productType: "Indexed Universal Life",
    product: "Indexed Universal Life",
    carrier: "Sample Carrier",
    faceAmount: 400000,
    premium: { amount: 310, frequency: "monthly", currency: "USD" },
    issueAge: 48,
    gender: "Male",
    riskClassification: "Preferred Non-Smoker",
    tobaccoStatus: "Non-Smoker",
    illustratedDuration: 33,
    guaranteedDuration: 17,
    cashValues: [],
    loans: [],
    riders: [],
    ...overrides
  };
}

function okSnapshot(overrides = {}) {
  return buildCurrentIulSnapshot(iulFacts(overrides), {
    sourceReviewId: "review-1",
    sourceFactVersion: "extract-1"
  });
}

describe("FI premium-frequency normalization", () => {
  it("normalizes annual, quarterly, monthly, weekly, biweekly", () => {
    assert.equal(normalizeToMonthlyPremium(3600, "annual"), 300);
    assert.equal(normalizeToMonthlyPremium(900, "quarterly"), 300);
    assert.equal(normalizeToMonthlyPremium(310, "monthly"), 310);
    assert.equal(Number(normalizeToMonthlyPremium(100, "weekly").toFixed(2)), 433.33);
    assert.equal(Number(normalizeToMonthlyPremium(200, "biweekly").toFixed(2)), 433.33);
  });

  it("returns null for missing premium", () => {
    assert.equal(normalizeToMonthlyPremium(null, "monthly"), null);
  });
});

describe("FI CurrentIulSnapshot adapter", () => {
  it("builds snapshot from IUL facts", () => {
    const result = okSnapshot();
    assert.equal(result.ok, true);
    assert.equal(result.snapshot.currentMonthlyPremium, 310);
    assert.equal(result.snapshot.currentDeathBenefit, 400000);
    assert.equal(result.snapshot.sourceReviewId, "review-1");
  });

  it("fails closed on missing premium", () => {
    const result = buildCurrentIulSnapshot(
      iulFacts({ premium: { amount: null, frequency: "monthly" } })
    );
    assert.equal(result.ok, false);
    assert.ok(result.missing.includes("premium"));
  });

  it("fails closed on missing death benefit", () => {
    const result = buildCurrentIulSnapshot(iulFacts({ faceAmount: null }));
    assert.equal(result.ok, false);
    assert.ok(result.missing.includes("faceAmount"));
  });

  it("fails closed on non-IUL source", () => {
    const result = buildCurrentIulSnapshot(
      iulFacts({ productType: "Term Life", product: "Term Life" })
    );
    assert.equal(result.ok, false);
    assert.ok(result.missing.includes("productType"));
  });

  it("does not invent identity fields", () => {
    const result = okSnapshot();
    assert.equal(result.snapshot.clientName, undefined);
    assert.equal(result.snapshot.email, undefined);
    assert.equal(result.snapshot.policyNumber, undefined);
  });
});

describe("FI Invest-the-Difference formulas", () => {
  const termQuote = {
    deathBenefit: 400000,
    termDurationYears: 20,
    monthlyPremium: 80,
    premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
    longestAvailableTermConfirmed: true,
    representativeConfirmed: true
  };

  it("keeps same premium outlay and same death benefit", () => {
    const evaluation = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: termQuote,
      investmentHorizon: { years: 20, confirmed: true },
      riskProfile: RISK_PROFILES.MODERATE,
      replacementAcknowledged: true
    });

    const calc = evaluation.calculations;
    assert.equal(calc.totalProposedMonthlyOutlay, 310);
    assert.equal(calc.proposedTermDeathBenefit, 400000);
    assert.equal(calc.currentIulDeathBenefit, 400000);
    assert.equal(calc.unboundedPremiumDifference, 230);
    assert.equal(calc.monthlyInvestmentDifference, 230);
    assert.equal(calc.proposedMutualFundContribution, 230);
    assert.equal(evaluation.sectionTitle, SECTION_TITLE);
    assert.equal(evaluation.metadata.recommendsSurrender, false);
    assert.equal(evaluation.metadata.recommendsPurchase, false);
  });

  it("handles positive, zero, and negative difference", () => {
    const positive = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: { ...termQuote, monthlyPremium: 100 }
    });
    assert.equal(positive.calculations.monthlyInvestmentDifference, 210);

    const zero = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: { ...termQuote, monthlyPremium: 310 }
    });
    assert.equal(zero.calculations.monthlyInvestmentDifference, 0);

    const negative = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: { ...termQuote, monthlyPremium: 400 }
    });
    assert.equal(negative.calculations.unboundedPremiumDifference, -90);
    assert.equal(negative.calculations.monthlyInvestmentDifference, 0);
    assert.equal(negative.calculations.negativeDifferenceFlag, true);
    assert.ok(
      negative.missingDataWarnings.some((w) => /exceeds the current IUL/i.test(w))
    );
  });

  it("passes rounding tolerance identity check", () => {
    const evaluation = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: { ...termQuote, monthlyPremium: 80.33 }
    });
    const calc = evaluation.calculations;
    const sum = calc.proposedTermMonthlyPremium + calc.proposedMutualFundContribution;
    assert.ok(nearlyEqual(sum, calc.totalProposedMonthlyOutlay, CURRENCY_TOLERANCE));
    assert.equal(calc.validation.passesOutlayIdentity, true);
  });

  it("requires override reason and does not silently raise outlay without override", () => {
    assert.throws(
      () =>
        buildInvestTheDifferenceEvaluation({
          snapshotResult: okSnapshot(),
          termQuoteInput: termQuote,
          override: { totalProposedMonthlyOutlay: 400 }
        }),
      /override requires a reason/i
    );

    const withOverride = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: termQuote,
      investmentHorizon: { years: 15, confirmed: true },
      riskProfile: RISK_PROFILES.MODERATE,
      replacementAcknowledged: true,
      override: { totalProposedMonthlyOutlay: 400, reason: "Client requested higher investable amount" }
    });
    assert.equal(withOverride.calculations.totalProposedMonthlyOutlay, 400);
    assert.equal(withOverride.override.reason.length > 0, true);
    assert.equal(withOverride.status, EVALUATION_STATUSES.REPRESENTATIVE_ADJUSTED);
  });
});

describe("FI projection engine", () => {
  it("computes zero-rate future value", () => {
    const result = calculateMonthlyFutureValue({
      monthlyContribution: 100,
      annualReturn: 0,
      horizonYears: 1
    });
    assert.equal(result.totalContributions, 1200);
    assert.equal(result.illustrativeEndingValue, 1200);
    assert.equal(result.illustrativeGrowth, 0);
  });

  it("computes positive-rate future value", () => {
    const result = calculateMonthlyFutureValue({
      monthlyContribution: 230,
      annualReturn: 0.07,
      horizonYears: 20
    });
    assert.ok(result.illustrativeEndingValue > result.totalContributions);
    assert.equal(result.guaranteed, false);
  });

  it("rejects invalid horizon", () => {
    assert.throws(
      () =>
        calculateMonthlyFutureValue({
          monthlyContribution: 100,
          annualReturn: 0.07,
          horizonYears: 0
        }),
      /horizonYears/
    );
  });

  it("keeps canonical assumption rates", () => {
    assert.equal(PROJECTION_SCENARIOS.CONSERVATIVE.annualReturn, 0.04);
    assert.equal(PROJECTION_SCENARIOS.MODERATE.annualReturn, 0.07);
    assert.equal(PROJECTION_SCENARIOS.AGGRESSIVE.annualReturn, 0.1);
  });
});

describe("FI term quote and status readiness", () => {
  it("requires term quote and labels preliminary estimate", () => {
    const missing = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot()
    });
    assert.equal(missing.status, EVALUATION_STATUSES.DRAFT_TERM_QUOTE_REQUIRED);

    const preliminary = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: {
        monthlyPremium: 80,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.PRELIMINARY_ESTIMATE,
        longestAvailableTermConfirmed: false
      }
    });
    assert.equal(
      preliminary.status,
      EVALUATION_STATUSES.DRAFT_TERM_CONFIRMATION_REQUIRED
    );
    assert.ok(
      preliminary.missingDataWarnings.some((w) =>
        /confirm the longest available Primerica term/i.test(w)
      )
    );
    assert.ok(
      preliminary.missingDataWarnings.some((w) => /preliminary estimate/i.test(w))
    );
  });

  it("accepts representative-confirmed quote path toward readiness", () => {
    const evaluation = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: {
        monthlyPremium: 80,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
        longestAvailableTermConfirmed: true,
        representativeConfirmed: true
      },
      investmentHorizon: { years: 20, confirmed: true },
      riskProfile: RISK_PROFILES.MODERATE,
      replacementAcknowledged: true
    });
    assert.equal(evaluation.status, EVALUATION_STATUSES.READY_FOR_REPRESENTATIVE_REVIEW);
    assert.equal(evaluation.canEmphasizeInvestmentScenario, true);
  });

  it("keeps scenarios neutral when risk profile missing", () => {
    const evaluation = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: {
        monthlyPremium: 80,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.OFFICIAL_QUOTE,
        longestAvailableTermConfirmed: true
      },
      investmentHorizon: { years: 20, confirmed: true },
      riskProfile: RISK_PROFILES.NOT_COMPLETED,
      replacementAcknowledged: true
    });
    assert.equal(evaluation.status, EVALUATION_STATUSES.DRAFT_RISK_PROFILE_REQUIRED);
    assert.equal(evaluation.canEmphasizeInvestmentScenario, false);
    assert.equal(evaluation.highlightedScenarioId, null);
    assert.equal(evaluation.canViewEducationalIllustration, true);
    assert.ok(
      evaluation.missingDataWarnings.some((w) => /risk-profile process/i.test(w))
    );
  });

  it("does not mark ready merely because arithmetic works", () => {
    const status = resolveStrategyEvaluationStatus({
      snapshotOk: true,
      termQuote: {
        isMissing: false,
        monthlyPremium: 80,
        longestAvailableTermConfirmed: true,
        premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED
      },
      investmentHorizonYears: null,
      riskProfile: RISK_PROFILES.MODERATE,
      replacementAcknowledged: false
    });
    assert.notEqual(status.status, EVALUATION_STATUSES.READY_FOR_REPRESENTATIVE_REVIEW);
  });

  it("includes replacement warnings and never advises surrender", () => {
    const evaluation = buildInvestTheDifferenceEvaluation({
      snapshotResult: okSnapshot(),
      termQuoteInput: {
        monthlyPremium: 80,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
        longestAvailableTermConfirmed: true
      }
    });
    assert.ok(evaluation.replacementWarnings.length >= 6);
    assert.ok(
      evaluation.replacementWarnings.some((w) =>
        /Do not cancel or surrender/i.test(w)
      )
    );
    const blob = JSON.stringify(evaluation);
    assert.equal(/Atlas recommends/i.test(blob), false);
    assert.equal(/client should surrender/i.test(blob), false);
    assert.equal(/best fund/i.test(blob), false);
  });
});

describe("FI fund catalog pending verification", () => {
  it("marks placeholder symbols non-production and forbids live API exposure", () => {
    const catalog = getFundCatalog();
    assert.equal(catalog.productionAuthorized, false);
    assert.equal(catalog.catalogStatus, "NON_PRODUCTION_PLACEHOLDER");
    assert.ok(catalog.families.includes("Fidelity"));
    assert.ok(catalog.families.includes("Invesco"));
    assert.ok(catalog.families.includes("Franklin Templeton"));
    assert.equal(catalog.uiPolicy.showSymbolsInClientUi, false);
    assert.equal(catalog.uiPolicy.liveApiExposureForbidden, true);
    for (const fund of catalog.funds) {
      assert.equal(fund.verificationStatus, "PENDING_VERIFICATION");
      assert.equal(fund.availabilityStatus, "UNKNOWN");
      assert.match(fund.notes, /NON_PRODUCTION_PLACEHOLDER/);
    }
  });
});

describe("FI PI immutability boundary", () => {
  it("adapter does not mutate input facts object", () => {
    const facts = iulFacts();
    const before = JSON.stringify(facts);
    buildCurrentIulSnapshot(facts, { sourceReviewId: "r1" });
    assert.equal(JSON.stringify(facts), before);
  });
});
