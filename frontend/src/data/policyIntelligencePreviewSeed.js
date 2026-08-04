/**
 * Anonymous F&G-style sample for Policy Intelligence Executive Review preview.
 * Zero-knowledge: no names, policy numbers, addresses, email, phone, beneficiaries, CRM ids.
 */

/** years=42 reaches insured age 90 (issueAge 48) for milestone cash values. */
function buildAnnualValues({ issueAge = 48, years = 42, monthlyPremium = 310 } = {}) {
  const annualPremiumBase = monthlyPremium * 12;
  const rows = [];
  let accountValue = 0;

  for (let year = 1; year <= years; year += 1) {
    const insuredAge = issueAge + year;
    const annualPremium = year <= 20 ? annualPremiumBase : 0;
    const scheduledPremium = annualPremiumBase;
    const premiumLoad = annualPremium > 0 ? Number((annualPremium * 0.06).toFixed(2)) : 0;
    const administrativeCharge = 96 + year * 1.5;
    const costOfInsurance = 210 + year * 28 + Math.max(0, insuredAge - 60) * 36;
    const riderCharges = year <= 25 ? 180 : 120;
    const interestBase = accountValue + annualPremium - premiumLoad;
    const interestCredited = year === 1 ? 380 : Math.round(Math.max(0, interestBase) * 0.055);

    accountValue = Math.max(
      0,
      accountValue +
        annualPremium -
        premiumLoad -
        administrativeCharge -
        costOfInsurance -
        riderCharges +
        interestCredited
    );

    const surrenderChargeRate = year <= 15 ? Math.max(0, 0.1 - (year - 1) * 0.006) : 0;
    const cashValue = Math.round(accountValue);
    const cashSurrenderValue = Math.round(accountValue * (1 - surrenderChargeRate));
    const deathBenefit = Math.max(400000, Math.round(accountValue + 400000));

    rows.push({
      policyYear: year,
      insuredAge,
      annualPremium,
      scheduledPremium,
      premiumLoad,
      administrativeCharge: Number(administrativeCharge.toFixed(2)),
      costOfInsurance: Number(costOfInsurance.toFixed(2)),
      riderCharges,
      interestCredited,
      accountValue: cashValue,
      cashValue,
      cashSurrenderValue,
      deathBenefit,
      loanBalance: 0,
      withdrawals: 0,
      netCashValue: cashValue
    });
  }

  return rows;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function cashValueAtAge(rows, age) {
  const row = rows.find((item) => item.insuredAge === age);
  return row ? row.cashValue : null;
}

function breakEvenYear(rows) {
  let paid = 0;
  for (const row of rows) {
    paid += row.annualPremium || 0;
    if (row.cashSurrenderValue >= paid && paid > 0) {
      return row.policyYear;
    }
  }
  return null;
}

const annualValues = buildAnnualValues();
const totalCoi = Number(sum(annualValues, "costOfInsurance").toFixed(2));
const totalAdministrativeCharges = Number(sum(annualValues, "administrativeCharge").toFixed(2));
const totalPremiumLoads = Number(sum(annualValues, "premiumLoad").toFixed(2));
const totalRiderCharges = sum(annualValues, "riderCharges");

export const POLICY_INTELLIGENCE_PREVIEW_SEED = Object.freeze({
  meta: Object.freeze({
    preview: true,
    carrierStyle: "F&G-style (anonymous fixture)",
    zeroKnowledge: true,
    containsPii: false
  }),
  policySnapshot: Object.freeze({
    carrier: "F&G (sample)",
    productType: "Indexed Universal Life",
    gender: "Male",
    issueAge: 48,
    riskClassification: "Preferred Non-Smoker",
    tobaccoStatus: "Non-Smoker",
    faceAmount: 400000,
    premium: Object.freeze({ amount: 310, frequency: "monthly", currency: "USD" }),
    deathBenefitOption: "Increasing Death Benefit",
    illustratedDuration: 33,
    guaranteedDuration: 17,
    illustratedRate: 0.055,
    guaranteedRate: 0.02
  }),
  annualValues: Object.freeze(annualValues.map((row) => Object.freeze({ ...row }))),
  financialSnapshot: Object.freeze({
    annualPremium: 310 * 12,
    lifetimePremium: sum(annualValues, "annualPremium"),
    totalCoi,
    totalAdministrativeCharges,
    totalPremiumLoads,
    totalRiderCharges,
    totalInternalCharges: Number(
      (totalCoi + totalAdministrativeCharges + totalPremiumLoads + totalRiderCharges).toFixed(2)
    ),
    breakEvenYear: breakEvenYear(annualValues),
    policyDuration: annualValues.length,
    cashValueAtAge65: cashValueAtAge(annualValues, 65),
    cashValueAtAge70: cashValueAtAge(annualValues, 70),
    cashValueAtAge80: cashValueAtAge(annualValues, 80),
    cashValueAtAge90: cashValueAtAge(annualValues, 90)
  }),
  chargesSummary: Object.freeze({
    costOfInsurance: totalCoi,
    administrativeCharges: totalAdministrativeCharges,
    premiumLoads: totalPremiumLoads,
    riderCharges: totalRiderCharges
  }),
  ruleEngineResults: Object.freeze([
    Object.freeze({
      ruleId: "PI-001",
      finding: "Carrier Identified",
      severity: "Info",
      triggered: true
    }),
    Object.freeze({
      ruleId: "PI-002",
      finding: "Product Identified",
      severity: "Info",
      triggered: true
    }),
    Object.freeze({
      ruleId: "PI-003",
      finding: "Increasing Death Benefit Detected",
      severity: "Info",
      triggered: true
    }),
    Object.freeze({
      ruleId: "PI-005",
      finding: "High Illustration Dependency",
      severity: "High",
      triggered: true
    }),
    Object.freeze({
      ruleId: "PI-008",
      finding: "Indexed Crediting Strategy Detected",
      severity: "Info",
      triggered: true
    }),
    Object.freeze({
      ruleId: "PI-009",
      finding: "Flexible Premium Structure Detected",
      severity: "Info",
      triggered: true
    })
  ]),
  policyStatus: "Elevated Review",
  findings: Object.freeze([
    Object.freeze({
      ruleId: "PI-003",
      severity: "Info",
      finding: "Increasing Death Benefit Detected",
      title: "Increasing Death Benefit Detected",
      evidence: "Death benefit option maps to Increasing Death Benefit (Option B).",
      explanation: "Death benefit option maps to Increasing Death Benefit (Option B).",
      whyItMatters:
        "Option B can raise long-term insurance charges as account value grows, affecting funding needs and illustrated sustainability.",
      recommendation: "Request In-force Illustration"
    }),
    Object.freeze({
      ruleId: "PI-005",
      severity: "High",
      finding: "High Illustration Dependency",
      title: "High Illustration Dependency",
      evidence: "Illustrated duration (33) significantly exceeds guaranteed duration (17).",
      explanation:
        "Illustrated duration (33) significantly exceeds guaranteed duration (17).",
      whyItMatters:
        "Outcomes beyond the guaranteed horizon rely more heavily on non-guaranteed illustrated assumptions and continued funding.",
      recommendation: "Perform lower-interest stress testing."
    }),
    Object.freeze({
      ruleId: "PI-008",
      severity: "Info",
      finding: "Indexed Crediting Strategy Detected",
      title: "Indexed Crediting Strategy Detected",
      evidence: "Product type indicates indexed crediting.",
      explanation: "Product type indicates indexed crediting.",
      whyItMatters:
        "Index credits are not guaranteed; clients should understand caps, participation, and downside floors before relying on illustrated growth.",
      recommendation: "Request In-force Illustration"
    })
  ]),
  recommendations: Object.freeze([
    "Request In-force Illustration",
    "Perform lower-interest stress testing.",
    "Stress Test at 5%",
    "Compare Alternative Funding"
  ]),
  sustainability: Object.freeze({
    illustratedDuration: 33,
    guaranteedDuration: 17,
    durationGapYears: 16,
    riskLevel: "Elevated",
    notes:
      "Policy sustainability under guaranteed assumptions is shorter than the illustrated horizon. Stress funding and crediting rate before long-term commitments."
  }),
  executiveSummary: Object.freeze({
    headline: "Indexed Universal Life — executive sample review",
    overallSummary:
      "Flexible-premium IUL with Increasing Death Benefit. Illustrated performance extends well beyond guaranteed duration; review funding discipline and stress assumptions before long-term planning.",
    bullets: Object.freeze([
      "Male, issue age 48, Preferred Non-Smoker — $400,000 face with Increasing Death Benefit.",
      "Planned funding $310/month; illustrated horizon 33 years vs guaranteed 17 years.",
      "Rule engine flags High Illustration Dependency; indexed crediting and flexible premiums confirmed.",
      "Cash value milestones at ages 65–90 are available from the annual values timeline."
    ])
  }),
  advisorDiscussionGuide: Object.freeze([
    "Confirm objectives for protection vs accumulation under Increasing Death Benefit.",
    "What funding level is sustainable if credits underperform the illustration?",
    "Guaranteed vs illustrated duration gap (17 vs 33 years).",
    "COI path, internal charges, and rider necessity over time.",
    "Run a 5% illustrated-rate stress before relying on long-term cash values.",
    "Document $310/month funding discipline and underfunding consequences."
  ]),
  discussionGuide: Object.freeze({
    questionsToAsk: Object.freeze([
      "Confirm objectives for protection vs accumulation under Increasing Death Benefit.",
      "What funding level is sustainable if credits underperform the illustration?"
    ]),
    topicsToDiscuss: Object.freeze([
      "Guaranteed vs illustrated duration gap (17 vs 33 years).",
      "COI path, internal charges, and rider necessity over time."
    ]),
    followUpItems: Object.freeze([
      "Run a 5% illustrated-rate stress before relying on long-term cash values.",
      "Document $310/month funding discipline and underfunding consequences."
    ])
  }),
  conclusion: Object.freeze({
    keyFindings: Object.freeze([
      "High Illustration Dependency (illustrated 33y vs guaranteed 17y)",
      "Increasing Death Benefit design confirmed",
      "Indexed crediting strategy in force"
    ]),
    characteristics: Object.freeze([
      "Indexed Universal Life with Increasing Death Benefit",
      "Issue age 48, Preferred Non-Smoker, $400,000 face amount",
      "Planned premium $310 monthly with flexible funding structure"
    ]),
    suggestedNextStep:
      "Present a lower illustrated-rate stress view alongside current assumptions, then confirm whether planned funding supports the stated protection and accumulation goals."
  }),
  /**
   * RC3 FI preview inputs — representative-entered sample only.
   * Not an official Primerica quote. Not a suitability determination.
   */
  financialIntelligencePreviewInputs: Object.freeze({
    termQuote: Object.freeze({
      deathBenefit: 400000,
      termDurationYears: 20,
      monthlyPremium: 78.5,
      productLabel: "Preview sample — representative-entered term",
      premiumSource: "PRELIMINARY_ESTIMATE",
      longestAvailableTermConfirmed: false,
      representativeConfirmed: false,
      notes: "Preview fixture only. Confirm official premium and longest available term."
    }),
    investmentHorizonYears: 20,
    riskProfile: "NOT_COMPLETED"
  })
});
