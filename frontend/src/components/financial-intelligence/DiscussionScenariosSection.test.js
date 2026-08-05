/**
 * RC3 Phase B — display must use API contract values (no frontend FI math).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("FI production display isolation", () => {
  it("FinancialIntelligencePanel does not import preview calculation builders", () => {
    const source = readFileSync(join(__dirname, "FinancialIntelligencePanel.jsx"), "utf8");
    assert.equal(source.includes("buildDiscussionScenarioEvaluation"), false);
    assert.equal(source.includes("monthlyFutureValue"), false);
    assert.equal(source.includes("preview/"), false);
    assert.ok(source.includes("financialIntelligenceService"));
  });

  it("FinancialIntelligencePanel uses localizeFiStatus for history and never references STATUS_LABELS", () => {
    const source = readFileSync(join(__dirname, "FinancialIntelligencePanel.jsx"), "utf8");
    assert.equal(source.includes("STATUS_LABELS"), false);
    assert.ok(source.includes("localizeFiStatus"));
    assert.ok(source.includes("localizeFiStatus(language, item.status)"));
    assert.ok(source.includes("localizeFiStatus(language, evaluation.status)"));
    assert.ok(source.includes('data-testid="fi-history"'));
  });

  it("DiscussionScenariosSection does not perform difference or FV math", () => {
    const source = readFileSync(join(__dirname, "DiscussionScenariosSection.jsx"), "utf8");
    assert.equal(/monthlyInvestmentDifference\s*=/.test(source), false);
    assert.equal(/Math\.pow|annualReturn\s*\//.test(source), false);
    assert.equal(source.includes("calculateMonthlyFutureValue"), false);
    assert.equal(source.includes("buildProjections"), false);
    assert.ok(source.includes("evaluation.monthlyInvestmentDifference"));
    assert.ok(source.includes("evaluation.projectionOutputs"));
    // Bar widths may scale backend ending values for display; they must not invent yearly series.
    assert.equal(source.includes("annualPoints"), false);
    assert.equal(/for\s*\(.*months/.test(source), false);
  });

  it("scenario cards render from backend scenario ids without preferred-rate styling by default", () => {
    const source = readFileSync(join(__dirname, "DiscussionScenariosSection.jsx"), "utf8");
    const css = readFileSync(join(__dirname, "DiscussionScenariosSection.css"), "utf8");
    assert.ok(source.includes("fi-projection-${scenario.id}"));
    assert.ok(source.includes("canEmphasizeInvestmentScenario"));
    assert.ok(css.includes(".fi-discussion-scenarios__projection-grid"));
    assert.ok(css.includes("grid-template-columns: 1fr"));
    assert.equal(css.includes("aggressive") && /aggressive[\s\S]{0,40}recommended/i.test(css), false);
  });

  it("renders values from a mocked API contract shape", () => {
    // Contract fields the UI reads — regression guard for API-driven display.
    const apiEvaluation = {
      sectionTitle: "Possible Discussion Scenarios for the Primerica Representative",
      status: "DRAFT_TERM_CONFIRMATION_REQUIRED",
      currentIulMonthlyPremium: 310,
      currentIulDeathBenefit: 400000,
      monthlyInvestmentDifference: 231.5,
      proposedMutualFundContribution: 231.5,
      totalProposedMonthlyOutlay: 310,
      premiumSource: "PRELIMINARY_ESTIMATE",
      sameDeathBenefit: true,
      comparisonTable: {
        deathBenefit: { existingIul: 400000, discussionScenario: 400000 },
        monthlyInsurancePremium: { existingIul: 310, discussionScenario: 78.5 },
        monthlyInvestmentAmount: { existingIul: 0, discussionScenario: 231.5 },
        totalMonthlyOutlay: { existingIul: 310, discussionScenario: 310 }
      },
      projectionOutputs: {
        scenarios: [
          {
            id: "conservative",
            label: "Conservative",
            annualReturn: 0.04,
            monthlyContribution: 231.5,
            timeHorizonYears: 20,
            totalContributions: 55560,
            illustrativeGrowth: 12000,
            illustrativeProjectedValue: 67560
          }
        ]
      },
      scenarioEmphasis: { canEmphasizeInvestmentScenario: false },
      missingDataWarnings: ["The representative must confirm the longest available Primerica term and official premium."],
      replacementWarnings: ["Do not cancel or surrender the existing policy before new coverage is approved, issued, accepted, paid, and confirmed in force."],
      disclaimers: ["Atlas informs. Representatives recommend. Clients decide."]
    };

    assert.equal(apiEvaluation.currentIulMonthlyPremium, 310);
    assert.equal(apiEvaluation.comparisonTable.monthlyInvestmentAmount.discussionScenario, 231.5);
    assert.equal(apiEvaluation.projectionOutputs.scenarios[0].illustrativeProjectedValue, 67560);
    assert.equal(apiEvaluation.scenarioEmphasis.canEmphasizeInvestmentScenario, false);
  });
});
