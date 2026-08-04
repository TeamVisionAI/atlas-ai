import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDiscussionScenarioEvaluation,
  SECTION_TITLE
} from "./buildDiscussionScenarioEvaluation.js";
import { calculateMonthlyFutureValue } from "./monthlyFutureValue.js";

const policySnapshot = {
  productType: "Indexed Universal Life",
  carrier: "F&G (sample)",
  faceAmount: 400000,
  premium: { amount: 310, frequency: "monthly" }
};

describe("frontend FI discussion scenario builder", () => {
  it("renders same-outlay positive difference without fabricating values", () => {
    const evaluation = buildDiscussionScenarioEvaluation({
      policySnapshot,
      termQuote: {
        monthlyPremium: 78.5,
        termDurationYears: 20,
        premiumSource: "PRELIMINARY_ESTIMATE",
        longestAvailableTermConfirmed: false
      },
      investmentHorizonYears: 20,
      riskProfile: "NOT_COMPLETED"
    });

    assert.equal(evaluation.sectionTitle, SECTION_TITLE);
    assert.equal(evaluation.calculations.totalProposedMonthlyOutlay, 310);
    assert.equal(evaluation.calculations.proposedTermDeathBenefit, 400000);
    assert.equal(evaluation.calculations.monthlyInvestmentDifference, 231.5);
    assert.equal(evaluation.canEmphasizeInvestmentScenario, false);
    assert.ok(
      evaluation.missingDataWarnings.some((w) =>
        /confirm the longest available Primerica term/i.test(w)
      )
    );
    assert.equal(evaluation.highlightedScenarioId, null);
  });

  it("keeps term duration and investment horizon distinct", () => {
    const evaluation = buildDiscussionScenarioEvaluation({
      policySnapshot,
      termQuote: {
        monthlyPremium: 80,
        termDurationYears: 30,
        premiumSource: "REPRESENTATIVE_CONFIRMED",
        longestAvailableTermConfirmed: true
      },
      investmentHorizonYears: 15,
      riskProfile: "MODERATE"
    });
    assert.equal(evaluation.termQuote.selectedTermDuration, 30);
    assert.equal(evaluation.investmentHorizon.years, 15);
  });

  it("does not invent term premium when missing", () => {
    const evaluation = buildDiscussionScenarioEvaluation({ policySnapshot });
    assert.equal(evaluation.status, "DRAFT_TERM_QUOTE_REQUIRED");
    assert.equal(evaluation.calculations.proposedTermMonthlyPremium, null);
    assert.equal(evaluation.calculations.monthlyInvestmentDifference, null);
    assert.equal(evaluation.projections, null);
  });
});

describe("frontend monthly future value", () => {
  it("matches zero-rate contribution total", () => {
    const result = calculateMonthlyFutureValue({
      monthlyContribution: 100,
      annualReturn: 0,
      horizonYears: 2
    });
    assert.equal(result.illustrativeEndingValue, 2400);
  });
});
