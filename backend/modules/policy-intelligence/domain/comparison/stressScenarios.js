/**
 * Deterministic stress scenario builders (Sprint 5 / BR-061).
 * Produce scenario variants — never mutate source Insurance Facts.
 */

const { analyzeAnnualValues } = require("../annual-values/annualValuesEngine");
const { createPolicyScenario, SCENARIO_TYPES, cloneJson } = require("./scenarioModel");
const {
  assertIllustratedRateStressComputable,
  requireExplicitNumber,
  createIllustratedRateStressNotComputableError
} = require("./stressComputability");

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
 * Rebuild AV cash path only when every formula term is an explicit number.
 * Does not invent CSV via CSV/AV, does not copy death benefit, does not
 * coerce null charges/interest to 0. Implements BR-061 fail-closed stress.
 */
function reprojectTimeline(baseTimeline, mapYear) {
  let accountValue = 0;
  const rows = [];

  for (const base of baseTimeline) {
    const mapped = mapYear(base, accountValue);
    const annualPremium = requireExplicitNumber(
      mapped.annualPremium,
      "ANNUAL_PREMIUM_UNAVAILABLE"
    );
    const premiumLoad = requireExplicitNumber(mapped.premiumLoad, "PREMIUM_LOAD_UNAVAILABLE");
    const administrativeCharge = requireExplicitNumber(
      mapped.administrativeCharge,
      "ADMINISTRATIVE_CHARGE_UNAVAILABLE"
    );
    const costOfInsurance = requireExplicitNumber(
      mapped.costOfInsurance,
      "COST_OF_INSURANCE_UNAVAILABLE"
    );
    const riderCharges = requireExplicitNumber(mapped.riderCharges, "RIDER_CHARGES_UNAVAILABLE");
    const interestCredited = requireExplicitNumber(
      mapped.interestCredited,
      "INTEREST_CREDITED_UNAVAILABLE"
    );
    const withdrawals = mapped.withdrawals == null ? 0 : mapped.withdrawals;
    if (mapped.withdrawals != null && typeof mapped.withdrawals !== "number") {
      throw createIllustratedRateStressNotComputableError(["WITHDRAWALS_UNAVAILABLE"]);
    }

    accountValue = Math.max(
      0,
      accountValue +
        annualPremium -
        premiumLoad -
        administrativeCharge -
        costOfInsurance -
        riderCharges +
        interestCredited -
        withdrawals
    );

    const cashValue = Math.round(accountValue);

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
      // CSV/AV ratio scaling is not a surrender model — omit stressed CSV.
      cashSurrenderValue: null,
      // DB option / corridor / lapse are not modeled — omit stressed DB.
      deathBenefit: null,
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
  assertIllustratedRateStressComputable(baseTimeline);
  const rows = reprojectTimeline(baseTimeline, (base) => ({
    annualPremium: base.annualPremium,
    scheduledPremium: base.scheduledPremium,
    premiumLoad: base.premiumLoad,
    administrativeCharge: base.administrativeCharge,
    costOfInsurance: base.costOfInsurance,
    riderCharges: base.riderCharges,
    interestCredited: Number((base.interestCredited * factor).toFixed(2)),
    withdrawals: base.withdrawals
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
      deterministic: true,
      failClosed: true,
      valueComputability: {
        cashSurrenderValue: "NOT_COMPUTABLE",
        deathBenefit: "NOT_COMPUTABLE",
        breakEvenYear: "NOT_COMPUTABLE"
      }
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
    const annualPremium = Number(
      (
        requireExplicitNumber(base.annualPremium, "ANNUAL_PREMIUM_UNAVAILABLE") * ratio
      ).toFixed(2)
    );
    const premiumLoad = Number(
      (requireExplicitNumber(base.premiumLoad, "PREMIUM_LOAD_UNAVAILABLE") * ratio).toFixed(2)
    );

    return {
      annualPremium,
      scheduledPremium: base.scheduledPremium,
      premiumLoad,
      administrativeCharge: base.administrativeCharge,
      costOfInsurance: base.costOfInsurance,
      riderCharges: base.riderCharges,
      interestCredited: base.interestCredited,
      withdrawals: base.withdrawals
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
  applyMinimumFundingStress,
  reprojectTimeline
};
