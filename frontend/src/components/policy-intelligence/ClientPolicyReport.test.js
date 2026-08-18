/**
 * Client policy report rendering — BR-144 DTO consumption only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../..");

function classified(value, classification, extra = {}) {
  return {
    value,
    classification,
    nullReason: extra.nullReason || null,
    invented: false,
    interpolated: false,
    provenance: extra.provenance || (extra.sourcePage != null ? { sourcePage: extra.sourcePage } : null)
  };
}

function nationwideReport() {
  return {
    adapter: { key: "nationwide-iul", supported: true, message: null },
    annualValuesAvailable: true,
    reviewTitle: "Nationwide Test-1",
    illustrationSource: {
      label: "Policy Illustration",
      pages: [22, 23]
    },
    snapshot: {
      carrier: "Nationwide",
      issuer: "Nationwide",
      product: "IUL Protector II",
      formVersion: "ICC20",
      issueAge: 35,
      gender: "Male",
      underwritingClass: "Preferred Non-Smoker",
      tobaccoStatus: "Non-Smoker",
      premiumAmount: 2076,
      premiumFrequency: "annual",
      faceAmount: 100000,
      deathBenefit: 100000,
      deathBenefitOption: "Level"
    },
    economics: {
      policyCostCategories: [
        { id: "percent_of_premium_expense_charge", number: 1, label: "Percent of Premium Expense Charge", display: classified(null, "NOT_AVAILABLE", { sourcePage: 6 }), sourcePages: [6] },
        { id: "cost_of_insurance", number: 2, label: "Cost of Insurance / Monthly COI", display: classified(null, "NOT_AVAILABLE") },
        { id: "monthly_expense_charge", number: 3, label: "Monthly Expense Charge", display: classified(null, "NOT_AVAILABLE") },
        { id: "monthly_policy_fee", number: 4, label: "Monthly Policy Fee", display: classified(null, "NOT_AVAILABLE") },
        { id: "monthly_percent_of_accumulated_value", number: 5, label: "Monthly % of Accumulated Value Charge", display: classified(null, "NOT_AVAILABLE") },
        { id: "rider_charges", number: 6, label: "Rider Charges", display: classified(null, "NOT_AVAILABLE") },
        {
          id: "surrender_charges",
          number: 7,
          label: "Surrender Charges",
          display: classified(2680, "EXTRACTED_EXACT", { sourcePage: 13 }),
          sourcePages: [13],
          scheduleLength: 11,
          separateFromCsv: true
        }
      ],
      policyCostCheckpoints: [
        {
          requestedYear: 1,
          usedYear: 1,
          fallback: false,
          attainedAge: 36,
          premium: classified(2076, "EXTRACTED_EXACT", { sourcePage: 22 }),
          costOfInsurance: classified(null, "NOT_AVAILABLE"),
          otherKnownCharges: classified(null, "NOT_AVAILABLE"),
          surrenderCharge: classified(2680, "EXTRACTED_EXACT", { sourcePage: 22 }),
          accountValue: classified(1422, "EXTRACTED_EXACT", { sourcePage: 22 }),
          cashSurrenderValue: classified(0, "EXTRACTED_EXACT", { sourcePage: 22 }),
          deathBenefit: classified(100000, "EXTRACTED_EXACT", { sourcePage: 22 }),
          provenance: { sourcePage: 22 },
          surrenderChargeSeparateFromCsv: true
        },
        {
          requestedYear: 10,
          usedYear: 10,
          fallback: false,
          attainedAge: 45,
          premium: classified(2076, "EXTRACTED_EXACT", { sourcePage: 22 }),
          costOfInsurance: classified(null, "NOT_AVAILABLE"),
          otherKnownCharges: classified(null, "NOT_AVAILABLE"),
          surrenderCharge: classified(1787, "EXTRACTED_EXACT", { sourcePage: 13 }),
          accountValue: classified(15710, "EXTRACTED_EXACT", { sourcePage: 22 }),
          cashSurrenderValue: classified(14370, "EXTRACTED_EXACT", { sourcePage: 22 }),
          deathBenefit: classified(100000, "EXTRACTED_EXACT", { sourcePage: 22 }),
          provenance: { sourcePage: 22 },
          surrenderChargeSeparateFromCsv: true
        }
      ],
      livingBenefitCards: [
        {
          rider: "Terminal Illness",
          type: "Terminal Illness",
          form: "ICC13-NWLA-495",
          whatQualifies: "terminal_illness_life_expectancy_as_described_in_rider",
          limits: { minAccelerationDollars: 10000, maxAccelerationPercent: 50 },
          carrierCalculationRequired: true,
          carrierCalculationRequiredText:
            "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.",
          exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
          cashReceivedNotEqualToAmountAccelerated: true,
          provenance: { sourcePage: 15, formNumber: "ICC13-NWLA-495" },
          sourcePages: [15]
        },
        {
          rider: "Critical Illness",
          type: "Critical Illness",
          form: "ICC20-NWLA-606",
          limits: { annualLimitPercent: 10, annualLimitDollars: 25000, eventLimits: { perEventDollars: 25000 } },
          carrierCalculationRequired: true,
          carrierCalculationRequiredText:
            "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.",
          exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
          cashReceivedNotEqualToAmountAccelerated: true,
          provenance: { sourcePage: 16, formNumber: "ICC20-NWLA-606" },
          sourcePages: [16]
        },
        {
          rider: "Overloan Lapse Protection",
          type: "Overloan Lapse Protection",
          form: "ICC20-NWLA-594",
          riderCategory: "other",
          whatQualifies: "may_be_invoked_after_year_15_and_age_65_as_described",
          carrierCalculationRequired: true,
          carrierCalculationRequiredText:
            "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.",
          exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
          cashReceivedNotEqualToAmountAccelerated: true,
          provenance: { sourcePage: 18, formNumber: "ICC20-NWLA-594" },
          sourcePages: [18]
        }
      ]
    },
    safeguards: {
      atlasInforms: "Atlas informs. Representatives recommend. Clients decide.",
      replacement: "Do not cancel or surrender an existing policy before replacement coverage is approved and in force.",
      carrierCalculation: "Some living-benefit amounts require a current carrier-specific calculation and underwriting review.",
      hypotheticalInvestments: "Investment projections are hypothetical and not guaranteed."
    }
  };
}

function nationalLifeReport() {
  return {
    adapter: { key: "lsw-flexlife-ii-20417FL", supported: true, message: null },
    annualValuesAvailable: true,
    reviewTitle: "National Life FlexLife II",
    illustrationSource: {
      label: "Current Illustrated Annual Values",
      pages: [21, 22]
    },
    snapshot: {
      carrier: "National Life Group",
      issuer: "Life Insurance Company of the Southwest",
      product: "FlexLife II",
      formVersion: "20417FL",
      issueAge: 34,
      premiumAmount: 2991.53,
      premiumFrequency: "annual",
      deathBenefit: 294921
    },
    economics: {
      policyCostCategories: [
        { id: "cost_of_insurance", number: 2, label: "Cost of Insurance / Monthly COI", display: classified(null, "NOT_AVAILABLE") }
      ],
      policyCostCheckpoints: [
        {
          requestedYear: 1,
          usedYear: 1,
          fallback: false,
          attainedAge: 35,
          premium: classified(2991.53, "EXTRACTED_EXACT", { sourcePage: 21 }),
          costOfInsurance: classified(null, "NOT_AVAILABLE"),
          otherKnownCharges: classified(null, "NOT_AVAILABLE"),
          surrenderCharge: classified(null, "NOT_AVAILABLE"),
          accountValue: classified(1921, "EXTRACTED_EXACT", { sourcePage: 21 }),
          cashSurrenderValue: classified(0, "EXTRACTED_EXACT", { sourcePage: 21 }),
          deathBenefit: classified(294921, "EXTRACTED_EXACT", { sourcePage: 21 }),
          provenance: { sourcePage: 21 }
        },
        {
          requestedYear: 10,
          usedYear: 10,
          fallback: false,
          attainedAge: 44,
          premium: classified(2991.53, "EXTRACTED_EXACT", { sourcePage: 21 }),
          costOfInsurance: classified(null, "NOT_AVAILABLE"),
          otherKnownCharges: classified(null, "NOT_AVAILABLE"),
          surrenderCharge: classified(null, "NOT_AVAILABLE"),
          accountValue: classified(24793, "EXTRACTED_EXACT", { sourcePage: 21 }),
          cashSurrenderValue: classified(24110, "EXTRACTED_EXACT", { sourcePage: 21 }),
          deathBenefit: classified(317793, "EXTRACTED_EXACT", { sourcePage: 21 }),
          provenance: { sourcePage: 21 }
        }
      ],
      livingBenefitCards: [
        {
          rider: "Terminal Illness ABR",
          form: "8052FL",
          discountMethodology: "national_life_abr_mortality_table_and_interest_discount",
          discountSampleInterestRate: 0.065,
          carrierCalculationRequired: true,
          carrierCalculationRequiredText:
            "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.",
          exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
          cashReceivedNotEqualToAmountAccelerated: true,
          provenance: { sourcePage: 9, formNumber: "8052FL" },
          sourcePages: [9]
        },
        {
          rider: "Chronic Illness ABR",
          form: "8095FL",
          carrierCalculationRequired: true,
          carrierCalculationRequiredText:
            "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.",
          exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
          cashReceivedNotEqualToAmountAccelerated: true,
          provenance: { sourcePage: 9, formNumber: "8095FL" },
          sourcePages: [9]
        },
        {
          rider: "Charitable Matching Gift",
          type: "Charitable Matching Gift",
          form: "20186FL",
          riderCategory: "other",
          carrierCalculationRequired: true,
          carrierCalculationRequiredText:
            "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.",
          exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
          cashReceivedNotEqualToAmountAccelerated: true,
          provenance: { sourcePage: 5, formNumber: "20186FL" },
          sourcePages: [5]
        }
      ]
    },
    safeguards: {
      atlasInforms: "Atlas informs. Representatives recommend. Clients decide.",
      replacement: "Do not cancel or surrender an existing policy before replacement coverage is approved and in force.",
      carrierCalculation: "carrier",
      hypotheticalInvestments: "hypothetical"
    }
  };
}

const fiEvaluation = {
  id: "fi-1",
  status: "READY",
  version: 1,
  currentIulMonthlyPremium: 173,
  currentIulDeathBenefit: 100000,
  proposedTermMonthlyPremium: 48,
  monthlyInvestmentDifference: 125,
  comparisonTable: {
    deathBenefit: { existingIul: 100000, discussionScenario: 100000 },
    monthlyInsurancePremium: { existingIul: 173, discussionScenario: 48 },
    monthlyInvestmentAmount: { existingIul: 0, discussionScenario: 125 },
    totalMonthlyOutlay: { existingIul: 173, discussionScenario: 173 }
  },
  projectionOutputs: {
    scenarios: [
      { id: "conservative", label: "Conservative 4%", annualReturn: 0.04, illustrativeProjectedValue: 10000 },
      { id: "moderate", label: "Moderate Growth 7%", annualReturn: 0.07, illustrativeProjectedValue: 20000 },
      { id: "aggressive", label: "Aggressive Growth 10%", annualReturn: 0.1, illustrativeProjectedValue: 30000 }
    ]
  },
  replacementWarnings: ["Do not cancel existing coverage first."],
  disclaimers: ["Hypothetical."]
};

describe("ClientPolicyReport", () => {
  it("source contract: no frontend math and no cash=accelerated-DB assumption", () => {
    const reportJsx = readFileSync(path.join(__dirname, "ClientPolicyReport.jsx"), "utf8");
    const riderJsx = readFileSync(path.join(__dirname, "LivingBenefitRiderCards.jsx"), "utf8");
    const displayJs = readFileSync(path.join(__dirname, "classifiedValueDisplay.js"), "utf8");
    const pageJsx = readFileSync(path.join(__dirname, "../../pages/PolicyIntelligence.jsx"), "utf8");
    assert.equal(reportJsx.includes("Math.pow"), false);
    assert.equal(reportJsx.includes("extractIllustrationFromPdf"), false);
    assert.ok(reportJsx.includes("DiscussionScenariosSection"));
    assert.ok(pageJsx.includes("FinancialIntelligencePanel"));
    assert.ok(pageJsx.includes("pi-tab-report"));
    assert.ok(pageJsx.includes("window.print()"));
    assert.ok(riderJsx.includes("isAcceleratedLivingBenefitRider"));
    assert.ok(riderJsx.includes("Cash received is not the same as the death benefit accelerated"));
    assert.ok(displayJs.includes("NOT_AVAILABLE"));
    assert.equal(displayJs.includes("value === 0 ? \"$0\""), false);
  });

  it("renders Nationwide and National Life reports, missing data, and print classes", async () => {
    const server = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error"
    });

    try {
      const languageModule = await server.ssrLoadModule("/src/i18n/LanguageContext.jsx");
      const reportModule = await server.ssrLoadModule(
        "/src/components/policy-intelligence/ClientPolicyReport.jsx"
      );
      const ClientPolicyReport = reportModule.default;
      const { LanguageProvider } = languageModule;

      const nationwideHtml = renderToString(
        React.createElement(ClientPolicyReport, { report: nationwideReport() })
      );
      assert.match(nationwideHtml, /Nationwide/);
      assert.match(nationwideHtml, /IUL Protector II/);
      assert.match(nationwideHtml, /data-testid="pi-section-band-snapshot"/);
      assert.match(nationwideHtml, /1\. Current Policy Snapshot/);
      assert.match(nationwideHtml, /2\. Policy Cost Analysis — The 7 Costs/);
      assert.match(nationwideHtml, /3\. Policy Values Over Time/);
      assert.match(nationwideHtml, /4\. Living Benefits \/ Riders/);
      assert.match(nationwideHtml, /5\. Term \+ Invest-the-Difference/);
      assert.match(nationwideHtml, /6\. Representative Notes \/ Safeguards/);
      assert.match(nationwideHtml, /pi-snapshot--hero/);
      assert.match(nationwideHtml, /pi-snapshot__fact--hero/);
      assert.equal(nationwideHtml.includes('data-testid="pi-snapshot-issuer"'), false);
      assert.match(nationwideHtml, /data-classification="NOT_AVAILABLE"/);
      assert.match(nationwideHtml, /pi-cost-card--not_available/);
      assert.match(nationwideHtml, /pi-cost-card--extracted_exact/);
      assert.match(nationwideHtml, /Not disclosed in this illustration/);
      assert.equal(nationwideHtml.includes("$0</p>"), false);
      assert.match(nationwideHtml, /ICC13-NWLA-495/);
      assert.match(nationwideHtml, /data-rider-kind="living-benefit"/);
      assert.match(nationwideHtml, /data-rider-kind="policy-feature"/);
      assert.match(nationwideHtml, /pi-rider-group-living/);
      assert.match(nationwideHtml, /pi-rider-group-other/);
      assert.match(nationwideHtml, /Exact accelerated benefit cannot be determined/);
      assert.match(nationwideHtml, /pi-checkpoint-table__av/);
      assert.match(nationwideHtml, /pi-checkpoint-table__csv/);
      assert.match(nationwideHtml, /pi-checkpoint-table__head-line/);
      assert.match(nationwideHtml, /data-testid="pi-checkpoint-h-coi"/);
      assert.match(nationwideHtml, /pi-checkpoint-table__note/);
      assert.equal(nationwideHtml.includes("<caption"), false);
      assert.match(nationwideHtml, /Cash received is not the same/);
      assert.match(nationwideHtml, /Atlas informs/);
      assert.match(nationwideHtml, /Not disclosed in this illustration/);
      const overloanHtml = nationwideHtml.slice(
        nationwideHtml.indexOf("pi-rider-card-ICC20-NWLA-594")
      );
      const overloanCard = overloanHtml.slice(0, overloanHtml.indexOf("</article>") + 10);
      assert.match(overloanCard, /Overloan Lapse Protection/);
      assert.equal(overloanCard.includes("Cash received is not the same"), false);
      assert.equal(overloanCard.includes("Exact accelerated benefit cannot be determined"), false);

      assert.match(nationwideHtml, /pi-source-line/);
      assert.match(nationwideHtml, /Source: Policy Illustration — Pages 22–23/);
      assert.match(nationwideHtml, /Source: Policy Illustration — Page 13/);
      assert.match(nationwideHtml, /Source: Policy Illustration — Page 6/);
      assert.match(nationwideHtml, /Source: Form ICC13-NWLA-495 — Page 15/);
      assert.match(nationwideHtml, /Carrier calculation required — methodology described on Page 15/);
      assert.match(nationwideHtml, /data-testid="pi-values-chart"/);
      assert.match(nationwideHtml, /Policy values over time/);
      assert.match(nationwideHtml, /Accumulated Value/);
      assert.match(nationwideHtml, /Cash Surrender Value/);
      assert.match(nationwideHtml, /Yr 1/);
      assert.match(nationwideHtml, /data-testid="pi-section-sources"/);
      assert.match(nationwideHtml, /fi-print-hide/);
      assert.match(nationwideHtml, /<details/);
      assert.match(nationwideHtml, /Source references/);
      assert.equal(nationwideHtml.includes("7. Source references"), false);
      assert.match(nationwideHtml, /6\. Representative Notes \/ Safeguards/);
      assert.match(nationwideHtml, /\[1\]/);
      assert.equal(nationwideHtml.includes("Page 24"), false);

      const lswHtml = renderToString(
        React.createElement(ClientPolicyReport, { report: nationalLifeReport() })
      );
      assert.match(lswHtml, /National Life Group/);
      assert.match(lswHtml, /20417FL/);
      assert.match(lswHtml, /8052FL/);
      assert.match(lswHtml, /Source: Current Illustrated Annual Values — Pages 21–22/);
      assert.match(lswHtml, /Source: Form 8095FL — Page 9/);
      assert.equal(lswHtml.includes("Pages 9–10"), false);
      assert.match(lswHtml, /illustrative only/);
      assert.match(lswHtml, /national life abr mortality table/i);
      assert.equal(lswHtml.includes("ICC13-NWLA"), false);
      assert.match(lswHtml, /data-testid="pi-snapshot-issuer"/);
      const charitableHtml = lswHtml.slice(lswHtml.indexOf("pi-rider-card-20186FL"));
      const charitableCard = charitableHtml.slice(0, charitableHtml.indexOf("</article>") + 10);
      assert.match(charitableCard, /Charitable Matching Gift/);
      assert.equal(charitableCard.includes("Cash received is not the same"), false);
      assert.equal(charitableCard.includes("Exact accelerated benefit cannot be determined"), false);

      const missingHtml = renderToString(
        React.createElement(ClientPolicyReport, {
          report: {
            adapter: { key: null, supported: true, message: null },
            annualValuesAvailable: false,
            annualValuesUnavailableMessage: "Illustrated annual values are not available for this review.",
            snapshot: { carrier: "Nationwide" },
            economics: { policyCostCategories: [], policyCostCheckpoints: [], livingBenefitCards: [] },
            safeguards: { atlasInforms: "Atlas informs. Representatives recommend. Clients decide." }
          }
        })
      );
      assert.match(missingHtml, /Illustrated annual values are not available/);

      const unsupportedHtml = renderToString(
        React.createElement(ClientPolicyReport, {
          report: {
            adapter: { key: "unknown-x", supported: false, message: "Policy structure requires additional review" },
            annualValuesAvailable: false,
            snapshot: {},
            economics: null,
            safeguards: {}
          }
        })
      );
      assert.match(unsupportedHtml, /Policy structure requires additional review/);

      const withFi = renderToString(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(ClientPolicyReport, {
            report: nationwideReport(),
            financialEvaluation: fiEvaluation
          })
        )
      );
      assert.match(withFi, /fi-discussion-scenarios/);
      assert.match(withFi, /Conservative|4%/);

      const reportCss = readFileSync(path.join(__dirname, "ClientPolicyReport.css"), "utf8");
      assert.ok(reportCss.includes("@page"));
      assert.ok(reportCss.includes("counter(page)"));
      assert.ok(reportCss.includes("background: #fff !important"));
      assert.ok(reportCss.includes("break-inside: avoid"));
      assert.ok(reportCss.includes(".pi-source-line"));
      assert.ok(reportCss.includes(".pi-section-band"));
      assert.ok(reportCss.includes(".pi-cost-card--extracted_exact"));
      assert.ok(reportCss.includes(".pi-cost-card--not_available"));
      assert.ok(reportCss.includes(".pi-cost-card--carrier_calculation_required"));
      assert.ok(reportCss.includes(".pi-rider-card--living"));
      assert.ok(reportCss.includes(".pi-report-section--sources"));
      assert.match(
        reportCss,
        /\.pi-report-section--sources[\s\S]{0,80}display:\s*none\s*!important/
      );
      assert.equal(
        /pi-source-line[^{]*\{[^}]*display:\s*none/m.test(reportCss),
        false
      );
      assert.equal(/\.pi-report-section--sources[\s\S]{0,40}break-before:\s*page/.test(reportCss), false);
      assert.ok(reportCss.includes("break-inside: avoid"));
      assert.ok(reportCss.includes("page-break-inside: avoid"));
      assert.ok(reportCss.includes("table-layout: fixed"));
      assert.ok(reportCss.includes(".pi-checkpoint-table__head-line"));
      assert.match(reportCss, /\.pi-checkpoint-wrap\s*\{[\s\S]*?overflow-x:\s*visible/);
      assert.match(
        reportCss,
        /@media print[\s\S]*\.pi-checkpoint-table[\s\S]*width:\s*100%\s*!important/
      );
    } finally {
      await server.close();
    }
  });
});
