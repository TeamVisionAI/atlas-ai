/**
 * Deterministic Annual Values summary calculations (Sprint 4A / BR-060).
 * No AI. Null inputs contribute 0 only for explicit totals (sum of present numbers);
 * milestone cash values remain null when the age row is absent.
 */

function sumField(timeline, field) {
  let total = 0;
  let counted = 0;

  for (const row of timeline) {
    const value = row[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      counted += 1;
    }
  }

  return { total, counted };
}

function cashValueAtAge(timeline, age) {
  const row = timeline.find((item) => item.insuredAge === age);
  if (!row) {
    return null;
  }
  return typeof row.cashValue === "number" ? row.cashValue : null;
}

function findBreakEvenYear(timeline) {
  let cumulativePremiums = 0;

  for (const row of timeline) {
    if (typeof row.annualPremium === "number") {
      cumulativePremiums += row.annualPremium;
    }

    const surrender =
      typeof row.cashSurrenderValue === "number" ? row.cashSurrenderValue : null;

    if (surrender != null && cumulativePremiums > 0 && surrender >= cumulativePremiums) {
      return row.policyYear;
    }
  }

  return null;
}

/**
 * @param {ReadonlyArray<object>} timeline
 * @returns {{ summaryMetrics: object, calculationMetadata: object }}
 */
function calculateAnnualValueMetrics(timeline = []) {
  const started = process.hrtime.bigint();
  const rows = Array.isArray(timeline) ? timeline : [];

  const premiums = sumField(rows, "annualPremium");
  const coi = sumField(rows, "costOfInsurance");
  const admin = sumField(rows, "administrativeCharge");
  const riders = sumField(rows, "riderCharges");
  const premiumLoads = sumField(rows, "premiumLoad");

  const chargeSeriesPresent =
    coi.counted > 0 && admin.counted > 0 && riders.counted > 0 && premiumLoads.counted > 0;
  const totalInternalCharges = chargeSeriesPresent
    ? coi.total + admin.total + riders.total + premiumLoads.total
    : null;

  const policyYears = rows.map((row) => row.policyYear).filter((year) => year != null);
  const policyDuration = policyYears.length
    ? Math.max(...policyYears) - Math.min(...policyYears) + 1
    : 0;

  const summaryMetrics = Object.freeze({
    totalPremiumsPaid: premiums.counted > 0 ? premiums.total : null,
    totalCostOfInsurance: coi.counted > 0 ? coi.total : null,
    totalAdministrativeCharges: admin.counted > 0 ? admin.total : null,
    totalRiderCharges: riders.counted > 0 ? riders.total : null,
    totalPremiumLoads: premiumLoads.counted > 0 ? premiumLoads.total : null,
    totalInternalCharges,
    cashValueAtAge65: cashValueAtAge(rows, 65),
    cashValueAtAge70: cashValueAtAge(rows, 70),
    cashValueAtAge80: cashValueAtAge(rows, 80),
    cashValueAtAge90: cashValueAtAge(rows, 90),
    breakEvenYear: findBreakEvenYear(rows),
    policyDuration,
    rowCount: rows.length
  });

  const ended = process.hrtime.bigint();

  const calculationMetadata = Object.freeze({
    engine: "annual_values_engine",
    version: "1.0",
    deterministic: true,
    ai: false,
    ocr: false,
    executionTimeMs: Number((Number(ended - started) / 1e6).toFixed(3)),
    formulas: Object.freeze({
      totalPremiumsPaid: "sum(annualPremium)",
      totalCostOfInsurance: "sum(costOfInsurance)",
      totalAdministrativeCharges: "sum(administrativeCharge)",
      totalRiderCharges: "sum(riderCharges)",
      totalInternalCharges:
        "totalCostOfInsurance + totalAdministrativeCharges + totalRiderCharges + totalPremiumLoads",
      cashValueAtAge: "cashValue where insuredAge = target",
      breakEvenYear:
        "first policyYear where cashSurrenderValue >= cumulative annualPremium",
      policyDuration: "max(policyYear) - min(policyYear) + 1"
    }),
    fieldPresence: Object.freeze({
      annualPremiumRows: premiums.counted,
      costOfInsuranceRows: coi.counted,
      administrativeChargeRows: admin.counted,
      riderChargesRows: riders.counted,
      premiumLoadRows: premiumLoads.counted
    })
  });

  return { summaryMetrics, calculationMetadata };
}

module.exports = {
  calculateAnnualValueMetrics,
  cashValueAtAge,
  findBreakEvenYear
};
