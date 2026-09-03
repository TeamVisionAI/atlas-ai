/**
 * Occidental Decreasing Term preview seed — Leidy Scull Tamayo test case.
 * Schedule values are exact fixture rows (no interpolation).
 */

function buildStaticFindings() {
  return [
    {
      ruleId: "PI-011",
      finding: "DEATH_BENEFIT_DECREASES_OVER_TIME",
      title: "Death benefit decreases over time",
      severity: "Info",
      evidence:
        "Basic death benefit declines by policy year. Not a level $290,155 benefit for 45 years.",
      explanation:
        "Basic death benefit declines by policy year. Not a level $290,155 benefit for 45 years.",
      recommendation: null,
      whyItMatters:
        "Coverage amount at claim depends on policy year. Review the schedule with the client."
    },
    {
      ruleId: "PI-012",
      finding: "NO_CASH_VALUE",
      title: "No cash value",
      severity: "Info",
      evidence: "Stated cash value is $0.",
      explanation: "Stated cash value is $0.",
      recommendation: null,
      whyItMatters: "This design does not accumulate cash value."
    },
    {
      ruleId: "PI-013",
      finding: "COVERAGE_EXPIRES_AT_AGE_70",
      title: "Coverage expires at age 70",
      severity: "Info",
      evidence: "Product is Decreasing Term Life – To Age 70. Expiration 2070-04-11.",
      explanation: "Product is Decreasing Term Life – To Age 70. Expiration 2070-04-11.",
      recommendation: null,
      whyItMatters: "Coverage ends at the stated expiration; plan for needs after age 70."
    },
    {
      ruleId: "PI-014",
      finding: "MONTHLY_PAYMENT_MODE_COSTS_MORE_THAN_ANNUAL_MODE",
      title: "Monthly mode costs more than annual mode",
      severity: "Info",
      evidence:
        "Annual if paid annually: $1,063.92. Annualized monthly mode: $1,200.12. Different modes — not contradictory quotes.",
      explanation:
        "Annual if paid annually: $1,063.92. Annualized monthly mode: $1,200.12. Different modes — not contradictory quotes.",
      recommendation: null,
      whyItMatters: "Payment mode choice changes annualized outlay."
    },
    {
      ruleId: "PI-015",
      finding: "SPOUSE_COVERAGE_ALSO_DECREASES",
      title: "Spouse coverage also decreases",
      severity: "Info",
      evidence:
        "Family Insurance Agreement spouse benefit starts at $54,000 and declines (expires 2058-04-11).",
      explanation:
        "Family Insurance Agreement spouse benefit starts at $54,000 and declines (expires 2058-04-11).",
      recommendation: null,
      whyItMatters: "Spouse rider is decreasing term, not level spouse coverage."
    }
  ];
}

const BASE_DEATH_BENEFIT_BY_YEAR = [
  290155, 287412, 284573, 281635, 278594, 275446, 272188, 268817, 265327, 261715,
  257976, 254107, 250103, 245958, 241668, 237228, 232633, 227876, 222954, 217858,
  212585, 207127, 201478, 195632, 189580, 183317, 176835, 170126, 163182, 155995,
  148556, 140857, 132889, 124641, 116106, 107271, 98127, 88663, 78868, 68730,
  58237, 47377, 36137, 24503, 24503, 0
];

const deathBenefitSchedule = BASE_DEATH_BENEFIT_BY_YEAR.map((deathBenefit, year) =>
  Object.freeze({ year, deathBenefit })
);

const annualValues = deathBenefitSchedule.map((row) =>
  Object.freeze({
    policyYear: row.year,
    insuredAge: 25 + row.year,
    annualPremium: row.deathBenefit === 0 ? 0 : 1200.12,
    scheduledPremium: 1200.12,
    cashValue: 0,
    cashSurrenderValue: 0,
    accountValue: 0,
    deathBenefit: row.deathBenefit,
    loanBalance: 0,
    withdrawals: 0,
    netCashValue: 0
  })
);

export const POLICY_INTELLIGENCE_DECREASING_TERM_PREVIEW_SEED = Object.freeze({
  meta: Object.freeze({
    preview: true,
    fixtureId: "occidental_decreasing_term_leidy_scull_tamayo",
    containsPii: true,
    note: "Named test case for Decreasing Term Policy Intelligence verification."
  }),
  policyStatus: "Review Ready",
  executiveSummary: Object.freeze({
    headline: "Decreasing Term — Leidy Scull Tamayo (Occidental)",
    overallSummary:
      "Occidental Decreasing Term to age 70. Initial death benefit $290,155 declines by schedule to expiration in 2070. Cash value is $0. Monthly mode annualizes higher than annual-pay premium. Facts only — no replacement recommendation.",
    bullets: Object.freeze([
      "Female, issue age 25, Non-Tobacco — Decreasing Term Life – To Age 70.",
      "Initial death benefit $290,155; year 20 = $212,585; year 40 = $58,237; year 45 expired.",
      "Annual if paid annually $1,063.92 vs monthly mode annualized $1,200.12."
    ])
  }),
  policySnapshot: Object.freeze({
    insuredName: "Leidy Scull Tamayo",
    carrier: "Occidental Life Insurance Company of North Carolina",
    productType: "Decreasing Term",
    product: "Decreasing Term Life – To Age 70",
    formVersion: "OL21-FL-3422",
    gender: "Female",
    issueAge: 25,
    riskClassification: "Non-Tobacco",
    tobaccoStatus: "Non-Tobacco",
    faceAmount: 290155,
    initialDeathBenefit: 290155,
    deathBenefit: 290155,
    deathBenefitOption: "Decreasing Death Benefit",
    cashValue: 0,
    effectiveDate: "2025-04-11",
    expirationDate: "2070-04-11",
    coverageExpiresAtAge: 70,
    benefitDeclinesOverTime: true,
    illustratedDuration: 45,
    guaranteedDuration: 45,
    deathBenefitSchedule: Object.freeze(deathBenefitSchedule),
    premium: Object.freeze({
      amount: 100.01,
      frequency: "monthly",
      currency: "USD",
      annualIfPaidAnnually: 1063.92,
      annualizedCurrentMode: 1200.12
    }),
    annualPremiumIfPaidAnnually: 1063.92,
    annualizedCurrentMode: 1200.12
  }),
  annualValues: Object.freeze(annualValues),
  financialSnapshot: Object.freeze({
    annualPremium: 1200.12,
    annualPremiumIfPaidAnnually: 1063.92,
    annualizedCurrentMode: 1200.12,
    lifetimePremium: 1200.12 * 45,
    totalCoi: 0,
    totalAdministrativeCharges: 0,
    totalPremiumLoads: 0,
    totalRiderCharges: 40.8 + 195,
    breakEvenYear: null,
    policyDuration: 45,
    cashValueAtAge65: 0,
    cashValueAtAge70: 0,
    cashValueAtAge80: 0,
    cashValueAtAge90: 0
  }),
  findings: Object.freeze(buildStaticFindings()),
  livingBenefitCards: Object.freeze([
    Object.freeze({
      rider: "Terminal Illness Accelerated Benefit Rider",
      type: "Terminal Illness Accelerated Benefit Rider",
      limits: Object.freeze({
        maxAccelerationPercent: 100
      }),
      actuarialAdjustment: Object.freeze({
        adjustmentType: "ACTUARIAL_ADJUSTMENT_FACTOR",
        displayLabel: "Actuarial Adjustment Factor",
        applies: true,
        factorDisclosed: false,
        formulaDisclosed: false,
        administrativeCharge: 100,
        uiNote: "Factor/formula not disclosed in policy."
      }),
      administrativeFees: Object.freeze({ amount: 100 }),
      discountFactor: null,
      exactPayoutCalculable: false,
      carrierCalculationRequired: true,
      carrierCalculationRequiredText:
        "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.",
      cashReceivedNotEqualToAmountAccelerated: true,
      loanDebtEffect: "Subject to indebtedness and rider terms.",
      exactPayout: Object.freeze({
        value: null,
        classification: "CARRIER_CALCULATION_REQUIRED"
      })
    })
  ]),
  recommendations: Object.freeze([]),
  advisorDiscussionGuide: Object.freeze([
    "Walk the client through the year-by-year declining death-benefit schedule.",
    "Confirm they understand coverage expires at age 70 (2070-04-11).",
    "Compare annual-pay vs monthly-pay annualized cost without framing either as an error.",
    "Review spouse decreasing-term rider separately from the base insured schedule."
  ]),
  conclusion: Object.freeze({
    keyFindings: [
      "Death benefit decreases over time",
      "No cash value",
      "Coverage expires at age 70"
    ],
    characteristics: [
      "Decreasing Term with Decreasing Death Benefit",
      "45-year schedule to age 70 expiration",
      "Monthly $100.01 (annualized $1,200.12) vs annual-pay $1,063.92"
    ],
    suggestedNextStep:
      "Present the declining schedule and payment-mode comparison; licensed agent conducts suitability analysis."
  })
});

export function deathBenefitAtYear(year) {
  const row = deathBenefitSchedule.find((item) => item.year === year);
  return row ? row.deathBenefit : null;
}
