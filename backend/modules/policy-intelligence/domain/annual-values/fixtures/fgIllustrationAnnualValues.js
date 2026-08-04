/**
 * F&G-style illustration Annual Values validation dataset (Sprint 4A).
 *
 * Deterministic, anonymized, zero-knowledge sample inspired by F&G IUL
 * annual illustration table columns. Not OCR'd from a PDF — structured fixture.
 *
 * Issue age 40 → ages 65 / 70 / 80 / 90 appear on the timeline.
 */

function buildFgIllustrationAnnualValues({ issueAge = 40, years = 55 } = {}) {
  const rows = [];
  let accountValue = 0;

  for (let year = 1; year <= years; year += 1) {
    const insuredAge = issueAge + year;
    const annualPremium = year <= 20 ? 12000 : 0;
    const scheduledPremium = 12000;
    const premiumLoad = annualPremium > 0 ? Number((annualPremium * 0.06).toFixed(2)) : 0;
    const administrativeCharge = 120 + year * 2;
    const costOfInsurance = 180 + year * 35 + Math.max(0, insuredAge - 60) * 40;
    const riderCharges = year <= 30 ? 240 : 180;
    const interestBase = accountValue + annualPremium - premiumLoad;
    const interestCredited = year === 1 ? 450 : Math.round(Math.max(0, interestBase) * 0.055);
    const withdrawals = year === 45 ? 10000 : 0;
    const loanBalance = year >= 35 && year <= 40 ? 25000 : 0;

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

    const surrenderChargeRate = year <= 15 ? Math.max(0, 0.12 - (year - 1) * 0.008) : 0;
    const cashSurrenderValue = Math.round(accountValue * (1 - surrenderChargeRate));
    const cashValue = Math.round(accountValue);
    const deathBenefit = Math.max(500000, Math.round(accountValue * 1.1 + 500000));

    rows.push({
      // F&G-style column labels (aliases exercised by normalizer)
      Year: year,
      Age: insuredAge,
      "Premium Outlay": annualPremium,
      "Scheduled Premium": scheduledPremium,
      "Premium Load": premiumLoad,
      "Admin Charge": administrativeCharge,
      COI: costOfInsurance,
      "Rider Charges": riderCharges,
      "Interest Credited": interestCredited,
      "Account Value": cashValue,
      "Cash Value": cashValue,
      CSV: cashSurrenderValue,
      "Death Benefit": deathBenefit,
      "Loan Balance": loanBalance,
      Withdrawals: withdrawals
    });
  }

  return Object.freeze({
    carrier: "F&G",
    product: "F&G IUL Illustration (validation fixture)",
    issueAge,
    illustratedRate: 0.055,
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row })))
  });
}

const FG_ILLUSTRATION_ANNUAL_VALUES = buildFgIllustrationAnnualValues();

module.exports = {
  buildFgIllustrationAnnualValues,
  FG_ILLUSTRATION_ANNUAL_VALUES
};
