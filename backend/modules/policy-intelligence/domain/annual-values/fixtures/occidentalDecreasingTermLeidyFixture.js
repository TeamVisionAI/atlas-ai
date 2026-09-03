/**
 * Occidental Life decreasing-term schedule fixture (Leidy Scull Tamayo test case).
 * Exact carrier schedule values only — no interpolation.
 *
 * Identity for review/display may live in review title / CRM.
 * Extract payload itself stays mechanics-focused (BR-054).
 */

const { ATLAS_TERMS } = require("../../insurance-language/insuranceVocabulary");

/** Base policy death benefit by policy year (year 0 = issue). Year 45 = expired (0). */
const BASE_DEATH_BENEFIT_BY_YEAR = Object.freeze([
  290155, 287412, 284573, 281635, 278594, 275446, 272188, 268817, 265327, 261715,
  257976, 254107, 250103, 245958, 241668, 237228, 232633, 227876, 222954, 217858,
  212585, 207127, 201478, 195632, 189580, 183317, 176835, 170126, 163182, 155995,
  148556, 140857, 132889, 124641, 116106, 107271, 98127, 88663, 78868, 68730,
  58237, 47377, 36137, 24503, 24503, 0
]);

/** Family Insurance Agreement spouse schedule (policy years 1–33). */
const SPOUSE_DEATH_BENEFIT_BY_YEAR = Object.freeze([
  54000, 52250, 50500, 48750, 47000, 45250, 43500, 41750, 40000, 38250,
  36500, 34750, 33000, 31250, 29500, 27750, 26000, 24250, 22500, 20750,
  19000, 17250, 15500, 13750, 12000, 10250, 8500, 6750, 5000, 5000,
  5000, 5000, 5000
]);

function buildDeathBenefitSchedule(valuesByYear = BASE_DEATH_BENEFIT_BY_YEAR) {
  return Object.freeze(
    valuesByYear.map((deathBenefit, year) =>
      Object.freeze({ year, deathBenefit })
    )
  );
}

function buildSpouseDeathBenefitSchedule(valuesByYear = SPOUSE_DEATH_BENEFIT_BY_YEAR) {
  return Object.freeze(
    valuesByYear.map((deathBenefit, index) =>
      Object.freeze({ year: index + 1, deathBenefit })
    )
  );
}

function deathBenefitScheduleToAnnualValues({
  schedule = buildDeathBenefitSchedule(),
  issueAge = 25,
  annualPremium = 1200.12
} = {}) {
  return Object.freeze(
    schedule.map((row) => {
      const year = Number(row.year);
      const deathBenefit = Number(row.deathBenefit);
      const expired = deathBenefit === 0;
      return Object.freeze({
        policyYear: year,
        insuredAge: issueAge + year,
        annualPremium: expired ? 0 : annualPremium,
        scheduledPremium: annualPremium,
        premiumLoad: 0,
        administrativeCharge: 0,
        costOfInsurance: null,
        riderCharges: null,
        interestCredited: 0,
        accountValue: 0,
        cashValue: 0,
        cashSurrenderValue: 0,
        deathBenefit,
        loanBalance: 0,
        withdrawals: 0,
        netCashValue: 0,
        expired
      });
    })
  );
}

const deathBenefitSchedule = buildDeathBenefitSchedule();
const spouseDeathBenefitSchedule = buildSpouseDeathBenefitSchedule();
const annualValues = deathBenefitScheduleToAnnualValues({
  schedule: deathBenefitSchedule,
  issueAge: 25,
  annualPremium: 1200.12
});

const OCCIDENTAL_DECREASING_TERM_LEIDY = Object.freeze({
  meta: Object.freeze({
    fixtureId: "occidental_decreasing_term_leidy_scull_tamayo",
    reviewTitle: "Leidy Scull Tamayo — Occidental Decreasing Term",
    insuredDisplayName: "Leidy Scull Tamayo",
    containsScheduleExactValues: true,
    interpolated: false
  }),
  extractedData: Object.freeze({
    schemaVersion: "2.0",
    carrier: "Occidental Life Insurance Company of North Carolina",
    productType: ATLAS_TERMS.DECREASING_TERM,
    product: "Decreasing Term Life – To Age 70",
    insured: Object.freeze({
      gender: "Female",
      issueAge: 25,
      riskClassification: "Non-Tobacco",
      tobaccoStatus: "Non-Tobacco"
    }),
    premium: Object.freeze({
      amount: 100.01,
      currency: "USD",
      frequency: "monthly",
      annualIfPaidAnnually: 1063.92,
      annualizedCurrentMode: 1200.12
    }),
    paymentMode: "monthly",
    faceAmount: 290155,
    initialDeathBenefit: 290155,
    cashValue: 0,
    deathBenefitOption: ATLAS_TERMS.DECREASING_DEATH_BENEFIT,
    effectiveDate: "2025-04-11",
    expirationDate: "2070-04-11",
    policyYears: 45,
    guaranteedDuration: 45,
    illustratedDuration: 45,
    deathBenefitSchedule,
    annualValues,
    riders: Object.freeze([
      Object.freeze({
        type: "Accidental Death Benefit",
        amount: 42500,
        notes: "Annual premium $40.80 under annual-payment schedule; expires after 40 years."
      }),
      Object.freeze({
        type: "Family Insurance Agreement — Spouse",
        amount: 54000,
        notes:
          "Spouse: Alejandro L Mirabal. Decreasing term spouse coverage. Annual premium $195. Expires 2058-04-11.",
        deathBenefitSchedule: spouseDeathBenefitSchedule
      }),
      Object.freeze({
        type: "Family Insurance Agreement — Dependent Child",
        amount: 15000,
        notes: "Level term $15,000 per eligible dependent child."
      }),
      Object.freeze({
        type: "Terminal Illness Accelerated Benefit Rider",
        amount: null,
        // Election language may allow accelerating up to 100% of the death benefit.
        // That is not a guaranteed 100% cash payment — actuarial adjustment applies.
        maximumAccelerationPercent: 100,
        discountFactor: null,
        completeCalculationChain: false,
        actuarialAdjustment: Object.freeze({
          adjustmentType: "ACTUARIAL_ADJUSTMENT_FACTOR",
          displayLabel: "Actuarial Adjustment Factor",
          applies: true,
          factorDisclosed: false,
          formulaDisclosed: false,
          administrativeCharge: 100,
          uiNote: "Factor/formula not disclosed in policy."
        }),
        administrativeFees: Object.freeze({
          amount: 100
        }),
        loanDebtEffect: "Subject to indebtedness and rider terms.",
        notes:
          "Acceleration is subject to actuarial adjustment, a $100 administrative charge, indebtedness, and rider terms. Not a guaranteed 100% immediate payout."
      })
    ]),
    mechanics: Object.freeze({
      baseForm: "OL21-FL-3422",
      formVersion: "OL21-FL-3422",
      initialMonthlyIncomeDeathBenefit: 1058,
      policyLoanInterestRate: 0.074,
      coverageExpiresAtAge: 70,
      benefitDeclinesOverTime: true,
      premiumModes: Object.freeze({
        annualIfPaidAnnually: 1063.92,
        monthlyPayment: 100.01,
        annualizedCurrentMode: 1200.12
      })
    })
  }),
  deathBenefitSchedule,
  spouseDeathBenefitSchedule,
  annualValues
});

module.exports = {
  BASE_DEATH_BENEFIT_BY_YEAR,
  SPOUSE_DEATH_BENEFIT_BY_YEAR,
  buildDeathBenefitSchedule,
  buildSpouseDeathBenefitSchedule,
  deathBenefitScheduleToAnnualValues,
  OCCIDENTAL_DECREASING_TERM_LEIDY
};
