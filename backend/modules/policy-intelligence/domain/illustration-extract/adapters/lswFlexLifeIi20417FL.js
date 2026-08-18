/**
 * Life Insurance Company of the Southwest FlexLife II adapter.
 * Adapter key: lsw-flexlife-ii-20417FL
 *
 * National Life ledgers include income, loans, and a weighted illustrated-rate
 * column. This parser never uses Nationwide dual-column AV/CSV/DB positions.
 * Missing COI / load / fee / rider-charge dollars stay null (BR-060).
 */

const ADAPTER_KEY = "lsw-flexlife-ii-20417FL";
const ISSUER = "Life Insurance Company of the Southwest";
const PRODUCT = "FlexLife II Indexed Universal Life, 2017 Series II";
const BASE_FORM = "20417FL";

const SCENARIOS = Object.freeze({
  GUARANTEED: "guaranteed_2_50",
  ALTERNATIVE_CURRENT: "alternative_current_3_00",
  CURRENT_ILLUSTRATED: "current_illustrated",
  CURRENT_ILLUSTRATED_DISTRIBUTIONS: "current_illustrated_distributions"
});

const COMPARISON_SCENARIO = SCENARIOS.CURRENT_ILLUSTRATED;

function parseMoneyToken(token) {
  if (token == null) {
    return null;
  }
  const raw = String(token).trim();
  if (!raw || /^lapse$/i.test(raw) || raw === "—" || raw === "-") {
    return null;
  }
  const cleaned = raw.replace(/[$,]/g, "");
  if (!cleaned || cleaned === ".") {
    return null;
  }
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function isLapseToken(token) {
  return /^lapse$/i.test(String(token || "").trim());
}

function tokenize(line) {
  return String(line || "")
    .replace(/,/g, "")
    .match(/\bLapse\b|-?\d+(?:\.\d+)?/gi) || [];
}

function isIllustratedRate(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 20;
}

function asRateFraction(percent) {
  if (!isIllustratedRate(percent)) {
    return null;
  }
  return Number((percent / 100).toFixed(4));
}

function classifyLedgerPage(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  if (lower.includes("average illustrated rate")) {
    return null;
  }
  if (lower.includes("distributions ledger")) {
    return "distributions";
  }
  if (!/\bledger\b/i.test(raw)) {
    return null;
  }
  if (lower.includes("alternative current") && lower.includes("current") && lower.includes("illustrated")) {
    return "dual";
  }
  if (lower.includes("guaranteed illustrated rate") && !lower.includes("alternative current")) {
    return "guaranteed";
  }
  return null;
}

function baseRow({
  policyYear,
  insuredAge,
  annualPremium,
  income,
  plannedLoan,
  accumulatedLoan,
  illustratedRate,
  accountValue,
  cashSurrenderValue,
  deathBenefit,
  page,
  scenario,
  tableLabel,
  lapse
}) {
  return {
    policyYear,
    insuredAge,
    annualPremium,
    income: income ?? null,
    plannedLoan: plannedLoan ?? null,
    accumulatedLoan: accumulatedLoan ?? null,
    illustratedRate: illustratedRate ?? null,
    accountValue,
    cashSurrenderValue,
    deathBenefit,
    cashValue: null,
    costOfInsurance: null,
    premiumLoad: null,
    administrativeCharge: null,
    riderCharges: null,
    interestCredited: null,
    surrenderCharge: null,
    sourcePage: page,
    scenario,
    tableLabel,
    adapterKey: ADAPTER_KEY,
    lapse: Boolean(lapse)
  };
}

function parseGuaranteedRow(tokens, page) {
  if (tokens.length < 9) {
    return null;
  }
  const policyYear = parseMoneyToken(tokens[0]);
  const insuredAge = parseMoneyToken(tokens[1]);
  if (!Number.isInteger(policyYear) || policyYear < 1 || policyYear > 121) {
    return null;
  }
  if (!Number.isInteger(insuredAge) || insuredAge < 0 || insuredAge > 120) {
    return null;
  }
  const rest = tokens.slice(2);
  const lapse = rest.slice(4, 7).some(isLapseToken);
  const values = rest.map((token) => (isLapseToken(token) ? null : parseMoneyToken(token)));
  if (values.length < 7) {
    return null;
  }
  const accountValue = values[4];
  if (isIllustratedRate(accountValue)) {
    return null;
  }
  return baseRow({
    policyYear,
    insuredAge,
    annualPremium: values[0],
    income: values[1],
    plannedLoan: values[2],
    accumulatedLoan: values[3],
    illustratedRate: 0.025,
    accountValue,
    cashSurrenderValue: values[5],
    deathBenefit: values[6],
    page,
    scenario: SCENARIOS.GUARANTEED,
    tableLabel: "guaranteed_2_50",
    lapse
  });
}

function parseDualRows(tokens, page) {
  const policyYear = parseMoneyToken(tokens[0]);
  const insuredAge = parseMoneyToken(tokens[1]);
  if (!Number.isInteger(policyYear) || policyYear < 1 || policyYear > 121) {
    return [];
  }
  if (!Number.isInteger(insuredAge) || insuredAge < 0 || insuredAge > 120) {
    return [];
  }
  const rest = tokens.slice(2).map((token) => (isLapseToken(token) ? null : parseMoneyToken(token)));
  const rows = [];

  // Dual: premium, income, altRate, altAV, altCSV, altDB, currRate, currAV, currCSV, currDB.
  // Alternative Current may print Lapse in its four value slots while Current Illustrated continues.
  if (rest.length >= 10 && isIllustratedRate(rest[6])) {
    const altRateOk = rest[2] == null || isIllustratedRate(rest[2]);
    if (!altRateOk || isIllustratedRate(rest[7])) {
      return [];
    }
    rows.push(
      baseRow({
        policyYear,
        insuredAge,
        annualPremium: rest[0],
        income: rest[1],
        plannedLoan: 0,
        accumulatedLoan: 0,
        illustratedRate: asRateFraction(rest[2]),
        accountValue: rest[3],
        cashSurrenderValue: rest[4],
        deathBenefit: rest[5],
        page,
        scenario: SCENARIOS.ALTERNATIVE_CURRENT,
        tableLabel: "alternative_current_3_00",
        lapse: rest[3] == null && rest[4] == null && rest[5] == null
      })
    );
    rows.push(
      baseRow({
        policyYear,
        insuredAge,
        annualPremium: rest[0],
        income: rest[1],
        plannedLoan: 0,
        accumulatedLoan: 0,
        illustratedRate: asRateFraction(rest[6]),
        accountValue: rest[7],
        cashSurrenderValue: rest[8],
        deathBenefit: rest[9],
        page,
        scenario: SCENARIOS.CURRENT_ILLUSTRATED,
        tableLabel: "current_illustrated",
        lapse: rest[7] == null && rest[8] == null && rest[9] == null
      })
    );
    return rows;
  }

  if (rest.length === 6 && isIllustratedRate(rest[2])) {
    if (isIllustratedRate(rest[3])) {
      return [];
    }
    rows.push(
      baseRow({
        policyYear,
        insuredAge,
        annualPremium: rest[0],
        income: rest[1],
        plannedLoan: 0,
        accumulatedLoan: 0,
        illustratedRate: asRateFraction(rest[2]),
        accountValue: rest[3],
        cashSurrenderValue: rest[4],
        deathBenefit: rest[5],
        page,
        scenario: SCENARIOS.CURRENT_ILLUSTRATED,
        tableLabel: "current_illustrated",
        lapse: rest[3] == null && rest[4] == null && rest[5] == null
      })
    );
  }

  return rows;
}

function parseDistributionsRow(tokens, page) {
  if (tokens.length < 10) {
    return null;
  }
  const policyYear = parseMoneyToken(tokens[0]);
  const insuredAge = parseMoneyToken(tokens[1]);
  if (!Number.isInteger(policyYear) || policyYear < 1 || policyYear > 121) {
    return null;
  }
  if (!Number.isInteger(insuredAge) || insuredAge < 0 || insuredAge > 120) {
    return null;
  }
  const rest = tokens.slice(2).map((token) => (isLapseToken(token) ? null : parseMoneyToken(token)));
  if (rest.length < 8 || !isIllustratedRate(rest[4])) {
    return null;
  }
  if (isIllustratedRate(rest[5])) {
    return null;
  }
  return baseRow({
    policyYear,
    insuredAge,
    annualPremium: rest[0],
    income: rest[1],
    plannedLoan: rest[2],
    accumulatedLoan: rest[3],
    illustratedRate: asRateFraction(rest[4]),
    accountValue: rest[5],
    cashSurrenderValue: rest[6],
    deathBenefit: rest[7],
    page,
    scenario: SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS,
    tableLabel: "current_illustrated_distributions",
    lapse: rest[5] == null && rest[6] == null && rest[7] == null
  });
}

function dedupeByYear(rows) {
  const byYear = new Map();
  for (const row of rows) {
    byYear.set(row.policyYear, row);
  }
  return [...byYear.values()].sort((a, b) => a.policyYear - b.policyYear);
}

function parseSurrenderMechanics(pages = []) {
  const text = (pages || []).map((page) => String(page?.text || "")).join("\n");
  const tenYear = /10 year declining surrender charge/i.test(text);
  const formula = /cash surrender value is the accumulated value less the surrender charges\s+less any debt due to policy loans/i.test(
    text
  );
  if (!tenYear && !formula) {
    return {
      years: null,
      declining: false,
      dollarTableAvailable: false,
      formula: null
    };
  }
  return {
    years: tenYear ? 10 : null,
    declining: tenYear,
    dollarTableAvailable: false,
    formula: formula
      ? "accumulated_value_less_surrender_charges_less_policy_loan_debt"
      : null
  };
}

function toAnnualValuesEngineRows(rows = []) {
  return rows.map((row) => ({
    policyYear: row.policyYear,
    insuredAge: row.insuredAge,
    "Premium Outlay": row.annualPremium,
    "Accumulated Value": row.accountValue,
    "Net Surrender Value": row.cashSurrenderValue,
    "Death Benefit": row.deathBenefit,
    withdrawals: row.income,
    loanBalance: row.accumulatedLoan,
    costOfInsurance: null,
    premiumLoad: null,
    administrativeCharge: null,
    riderCharges: null,
    interestCredited: null,
    "Surrender Charge": null,
    illustratedRate: row.illustratedRate,
    income: row.income,
    plannedLoan: row.plannedLoan,
    accumulatedLoan: row.accumulatedLoan,
    sourcePage: row.sourcePage,
    scenario: row.scenario,
    tableLabel: row.tableLabel,
    adapterKey: ADAPTER_KEY,
    lapse: row.lapse
  }));
}

/**
 * @param {Array<{ page: number, text: string }>} pages
 */
function parseLswFlexLifeIi20417FL(pages = []) {
  const guaranteed = [];
  const alternativeCurrent = [];
  const currentIllustrated = [];
  const currentIllustratedDistributions = [];
  let candidateRowCount = 0;

  for (const page of pages || []) {
    const kind = classifyLedgerPage(page.text);
    if (!kind) {
      continue;
    }
    for (const line of String(page.text || "").split(/\n/)) {
      const tokens = tokenize(line);
      if (tokens.length < 8) {
        continue;
      }
      candidateRowCount += 1;
      if (kind === "guaranteed") {
        const row = parseGuaranteedRow(tokens, page.page);
        if (row) {
          guaranteed.push(row);
        }
      } else if (kind === "dual") {
        for (const row of parseDualRows(tokens, page.page)) {
          if (row.scenario === SCENARIOS.ALTERNATIVE_CURRENT) {
            alternativeCurrent.push(row);
          } else {
            currentIllustrated.push(row);
          }
        }
      } else if (kind === "distributions") {
        const row = parseDistributionsRow(tokens, page.page);
        if (row) {
          currentIllustratedDistributions.push(row);
        }
      }
    }
  }

  const scenarios = {
    [SCENARIOS.GUARANTEED]: dedupeByYear(guaranteed),
    [SCENARIOS.ALTERNATIVE_CURRENT]: dedupeByYear(alternativeCurrent),
    [SCENARIOS.CURRENT_ILLUSTRATED]: dedupeByYear(currentIllustrated),
    [SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS]: dedupeByYear(
      currentIllustratedDistributions
    )
  };

  const selected = scenarios[COMPARISON_SCENARIO];
  const surrenderMechanics = parseSurrenderMechanics(pages);

  return {
    adapterKey: ADAPTER_KEY,
    issuer: ISSUER,
    product: PRODUCT,
    baseForm: BASE_FORM,
    comparisonScenario: COMPARISON_SCENARIO,
    scenarios,
    rows: selected,
    surrenderCharges: [],
    surrenderMechanics,
    candidateRowCount,
    scenario: COMPARISON_SCENARIO,
    source: "pdf_text_table",
    ocr: false,
    interpolated: false
  };
}

module.exports = {
  ADAPTER_KEY,
  ISSUER,
  PRODUCT,
  BASE_FORM,
  SCENARIOS,
  COMPARISON_SCENARIO,
  parseLswFlexLifeIi20417FL,
  toAnnualValuesEngineRows,
  classifyLedgerPage,
  parseMoneyToken
};
