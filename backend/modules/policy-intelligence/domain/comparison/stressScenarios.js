/**
 * Deterministic stress scenario builders (Sprint 5 / BR-061).
 * Produce scenario variants — never mutate source Insurance Facts.
 */

const { analyzeAnnualValues } = require("../annual-values/annualValuesEngine");
const { createPolicyScenario, SCENARIO_TYPES, cloneJson } = require("./scenarioModel");

const STRESS_KINDS = Object.freeze({
  ILLUSTRATED_RATE: "illustrated_rate",
  MINIMUM_FUNDING: "minimum_funding"
});

function requireNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return number;
}

function roundPercent(rate) {
  return Number((rate * 100).toFixed(2));
}

/**
 * Rebuild timeline cash path after adjusting premium and/or interest credited.
 */
function reprojectTimeline(baseTimeline, mapYear) {
  let accountValue = 0;
  const rows = [];

  for (const base of baseTimeline) {
    const mapped = mapYear(base, accountValue);
    const annualPremium = mapped.annualPremium;
    const premiumLoad = mapped.premiumLoad;
    const administrativeCharge = mapped.administrativeCharge;
    const costOfInsurance = mapped.costOfInsurance;
    const riderCharges = mapped.riderCharges;
    const interestCredited = mapped.interestCredited;
    const withdrawals = mapped.withdrawals ?? 0;

    accountValue = Math.max(
      0,
      accountValue +
        (annualPremium ?? 0) -
        (premiumLoad ?? 0) -
        (administrativeCharge ?? 0) -
        (costOfInsurance ?? 0) -
        (riderCharges ?? 0) +
        (interestCredited ?? 0) -
        (withdrawals ?? 0)
    );

    const baseAv = typeof base.accountValue === "number" ? base.accountValue : null;
    const baseCsv =
      typeof base.cashSurrenderValue === "number" ? base.cashSurrenderValue : null;
    const surrenderRatio =
      baseAv != null && baseAv > 0 && baseCsv != null ? baseCsv / baseAv : 1;

    const cashValue = Math.round(accountValue);
    const cashSurrenderValue = Math.round(accountValue * surrenderRatio);

    rows.push({
      policyYear: base.policyYear,
      insuredAge: base.insuredAge,
      annualPremium,
      scheduledPremium: mapped.scheduledPremium ?? base.scheduledPremium,
      premiumLoad,
      administrativeCharge,
      costOfInsurance,
      riderCharges,
      interestCredited,
      accountValue: cashValue,
      cashValue,
      cashSurrenderValue,
      deathBenefit: base.deathBenefit,
      loanBalance: base.loanBalance,
      withdrawals,
      netCashValue: cashValue - (base.loanBalance ?? 0)
    });
  }

  return rows;
}

function buildStressedAnnualValues(rows) {
  return analyzeAnnualValues(rows, { source: "stress_scenario" });
}

/**
 * Illustrated rate stress: scale interest credits by toRate/fromRate and reproject.
 */
function applyIllustratedRateStress(baseScenario, { fromRate, toRate }) {
  const from = requireNumber(fromRate, "fromRate");
  const to = requireNumber(toRate, "toRate");
  if (from === 0) {
    throw new Error("fromRate cannot be zero.");
  }

  const factor = to / from;
  const baseTimeline = baseScenario.annualValues?.timeline || [];
  const rows = reprojectTimeline(baseTimeline, (base) => ({
    annualPremium: base.annualPremium ?? 0,
    scheduledPremium: base.scheduledPremium,
    premiumLoad: base.premiumLoad ?? 0,
    administrativeCharge: base.administrativeCharge ?? 0,
    costOfInsurance: base.costOfInsurance ?? 0,
    riderCharges: base.riderCharges ?? 0,
    interestCredited:
      typeof base.interestCredited === "number"
        ? Number((base.interestCredited * factor).toFixed(2))
        : 0,
    withdrawals: base.withdrawals ?? 0
  }));

  const annualValues = buildStressedAnnualValues(rows);
  const facts = cloneJson(baseScenario.insuranceFacts) || {};
  if (facts && typeof facts === "object") {
    // Scenario snapshot copy only — does not write back to immutable Facts store.
    facts.illustratedRate = to;
  }

  const fromLabel = from <= 1 ? `${roundPercent(from)}%` : `${from}%`;
  const toLabel = to <= 1 ? `${roundPercent(to)}%` : `${to}%`;

  return createPolicyScenario({
    id: `${baseScenario.id}__stress_rate_${String(to).replace(".", "_")}`,
    key: "scenario_stress_rate",
    label: `Stress Test (${fromLabel} → ${toLabel})`,
    type: SCENARIO_TYPES.STRESS_TEST,
    insuranceFacts: {
      ...facts,
      illustratedRate: to,
      illustratedDuration: baseScenario.insuranceFacts?.illustratedDuration ?? null,
      guaranteedDuration: baseScenario.insuranceFacts?.guaranteedDuration ?? null
    },
    annualValues,
    findings: baseScenario.findings,
    recommendations: baseScenario.recommendations,
    stress: {
      kind: STRESS_KINDS.ILLUSTRATED_RATE,
      fromRate: from,
      toRate: to,
      factor
    },
    metadata: {
      derivedFrom: baseScenario.id,
      deterministic: true
    }
  });
}

/**
 * Minimum funding stress: scale premiums by ratio (default 0.5) and reproject.
 */
function applyMinimumFundingStress(baseScenario, { fundingRatio = 0.5 } = {}) {
  const ratio = requireNumber(fundingRatio, "fundingRatio");
  if (ratio < 0) {
    throw new Error("fundingRatio must be >= 0.");
  }

  const baseTimeline = baseScenario.annualValues?.timeline || [];
  const rows = reprojectTimeline(baseTimeline, (base) => {
    const annualPremium =
      typeof base.annualPremium === "number"
        ? Number((base.annualPremium * ratio).toFixed(2))
        : 0;
    const premiumLoad =
      typeof base.premiumLoad === "number"
        ? Number((base.premiumLoad * ratio).toFixed(2))
        : 0;

    return {
      annualPremium,
      scheduledPremium: base.scheduledPremium,
      premiumLoad,
      administrativeCharge: base.administrativeCharge ?? 0,
      costOfInsurance: base.costOfInsurance ?? 0,
      riderCharges: base.riderCharges ?? 0,
      interestCredited: base.interestCredited ?? 0,
      withdrawals: base.withdrawals ?? 0
    };
  });

  const annualValues = buildStressedAnnualValues(rows);

  return createPolicyScenario({
    id: `${baseScenario.id}__stress_min_funding_${String(ratio).replace(".", "_")}`,
    key: "scenario_stress_funding",
    label: "Minimum Funding",
    type: SCENARIO_TYPES.ALTERNATIVE_FUNDING,
    insuranceFacts: baseScenario.insuranceFacts,
    annualValues,
    findings: baseScenario.findings,
    recommendations: baseScenario.recommendations,
    stress: {
      kind: STRESS_KINDS.MINIMUM_FUNDING,
      fundingRatio: ratio
    },
    metadata: {
      derivedFrom: baseScenario.id,
      deterministic: true
    }
  });
}

/**
 * Build a stress scenario from a base scenario + stress spec.
 */
function buildStressScenario(baseScenario, stressSpec = {}) {
  const kind = stressSpec.kind || STRESS_KINDS.ILLUSTRATED_RATE;

  if (kind === STRESS_KINDS.ILLUSTRATED_RATE) {
    return applyIllustratedRateStress(baseScenario, stressSpec);
  }

  if (kind === STRESS_KINDS.MINIMUM_FUNDING) {
    return applyMinimumFundingStress(baseScenario, stressSpec);
  }

  throw new Error(`Unsupported stress kind: ${kind}`);
}

module.exports = {
  STRESS_KINDS,
  buildStressScenario,
  applyIllustratedRateStress,
  applyMinimumFundingStress
};
