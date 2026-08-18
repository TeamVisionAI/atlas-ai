/**
 * Deterministic IUL illustration ledger parser (BR-060).
 * Converts extracted PDF text tables into raw annual rows.
 * Never OCR, never GPT, never interpolates missing years or charges.
 */

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

function pageScenario(text) {
  const lower = String(text || "").toLowerCase();
  const nonguaranteed = lower.includes("non-guaranteed") || lower.includes("nonguaranteed");
  const guaranteed = /\bguaranteed\b/.test(lower) && !nonguaranteed;
  const assumed = lower.includes("assumed interest") || lower.includes("assumed\ninterest");
  if (nonguaranteed && assumed) {
    return "illustrated_nonguaranteed";
  }
  if (nonguaranteed) {
    return "nonguaranteed_current";
  }
  if (guaranteed) {
    return "guaranteed";
  }
  return "unspecified";
}

function looksLikeAnnualLedgerPage(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("table of") && lower.includes("surrender")) {
    return false;
  }
  return (
    (lower.includes("end of") && (lower.includes("value") || lower.includes("benefit"))) ||
    (lower.includes("death") && lower.includes("benefit") && /\b1\s+5\d\s+\d/.test(text))
  );
}

function parseLedgerRow(tokens, { page, scenario, tableLabel }) {
  if (!tokens || tokens.length < 5) {
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
  const lapsePresent = rest.some(isLapseToken);
  const values = rest.map((token) => (isLapseToken(token) ? null : parseMoneyToken(token)));

  let annualPremium = values[0] ?? null;
  let accountValue = null;
  let cashSurrenderValue = null;
  let deathBenefit = null;
  let current = null;

  if (values.length >= 7) {
    // Dual ledger: Year Age Premium AV1 CSV1 DB1 AV2 CSV2 DB2
    current = {
      accountValue: values[1],
      cashSurrenderValue: values[2],
      deathBenefit: values[3]
    };
    accountValue = values[4];
    cashSurrenderValue = values[5];
    deathBenefit = values[6];
  } else if (values.length >= 4) {
    // Single ledger: Year Age Premium AV CSV DB
    accountValue = values[1];
    cashSurrenderValue = values[2];
    deathBenefit = values[3];
  } else {
    return null;
  }

  return {
    policyYear,
    insuredAge,
    annualPremium,
    accountValue,
    cashSurrenderValue,
    deathBenefit,
    cashValue: null,
    sourcePage: page,
    scenario,
    tableLabel,
    lapse: lapsePresent && accountValue == null && cashSurrenderValue == null && deathBenefit == null,
    nonguaranteedCurrent: current
  };
}

function collectLedgerRows(pages = []) {
  const rows = [];

  for (const page of pages) {
    const text = String(page.text || "");
    const scenario = pageScenario(text);
    const tableLabel = looksLikeAnnualLedgerPage(text)
      ? "annual_ledger"
      : "numeric_candidate";
    const lines = text.split(/\n/);

    for (const line of lines) {
      const tokens = tokenize(line);
      if (tokens.length < 5) {
        continue;
      }
      const parsed = parseLedgerRow(tokens, {
        page: page.page,
        scenario,
        tableLabel
      });
      if (parsed) {
        rows.push(parsed);
      }
    }
  }

  return rows;
}

function isSparseCheckpointSequence(years) {
  if (years.length < 4) {
    return true;
  }
  let gaps = 0;
  for (let i = 1; i < years.length; i += 1) {
    if (years[i] !== years[i - 1] + 1) {
      gaps += 1;
    }
  }
  return gaps >= Math.max(2, Math.floor(years.length / 2));
}

function clusterByScenario(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.scenario}|${row.tableLabel}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  return groups;
}

function dedupeByYear(rows) {
  const byYear = new Map();
  for (const row of rows) {
    byYear.set(row.policyYear, row);
  }
  return [...byYear.values()].sort((a, b) => a.policyYear - b.policyYear);
}

function selectPrimaryTimeline(rows) {
  const grouped = clusterByScenario(rows);
  const ranked = [...grouped.entries()]
    .map(([key, groupRows]) => {
      const timeline = dedupeByYear(groupRows);
      const years = timeline.map((row) => row.policyYear);
      return {
        key,
        timeline,
        sparse: isSparseCheckpointSequence(years),
        dualColumn: timeline.some((row) => row.nonguaranteedCurrent),
        illustrated: key.startsWith("illustrated_nonguaranteed"),
        nonguaranteed: key.startsWith("nonguaranteed") || key.startsWith("illustrated"),
        length: timeline.length
      };
    })
    .filter((group) => !group.sparse && group.length >= 5)
    .sort((a, b) => {
      if (a.illustrated !== b.illustrated) {
        return a.illustrated ? -1 : 1;
      }
      if (a.dualColumn !== b.dualColumn) {
        return a.dualColumn ? -1 : 1;
      }
      if (a.nonguaranteed !== b.nonguaranteed) {
        return a.nonguaranteed ? -1 : 1;
      }
      return b.length - a.length;
    });

  return ranked[0]?.timeline || [];
}

function parseSurrenderChargeSchedule(pages = []) {
  const charges = new Map();

  for (const page of pages) {
    const text = String(page.text || "");
    if (!/surrender charge/i.test(text) && !/table of/i.test(text)) {
      continue;
    }
    const matches = text.matchAll(/(?:^|\n)\s*(\d{1,2})\s+\$([0-9,]+(?:\.\d{2})?)/g);
    for (const match of matches) {
      const year = Number(match[1]);
      const amount = parseMoneyToken(match[2]);
      if (year >= 1 && year <= 40 && amount != null) {
        charges.set(year, {
          policyYear: year,
          surrenderCharge: amount,
          sourcePage: page.page,
          tableLabel: "surrender_charge_schedule"
        });
      }
    }
  }

  return [...charges.values()].sort((a, b) => a.policyYear - b.policyYear);
}

function attachSurrenderCharges(timeline, schedule) {
  const byYear = new Map(schedule.map((row) => [row.policyYear, row]));
  return timeline.map((row) => {
    const matched = byYear.get(row.policyYear);
    return {
      ...row,
      surrenderCharge: matched ? matched.surrenderCharge : null,
      surrenderChargeSourcePage: matched ? matched.sourcePage : null
    };
  });
}

/**
 * @param {Array<{ page: number, text: string }>} pages
 */
function parseIulIllustrationTables(pages = []) {
  const ledgerRows = collectLedgerRows(pages);
  const surrenderCharges = parseSurrenderChargeSchedule(pages);
  const selected = attachSurrenderCharges(selectPrimaryTimeline(ledgerRows), surrenderCharges);

  return {
    rows: selected,
    surrenderCharges,
    candidateRowCount: ledgerRows.length,
    scenario: selected[0]?.scenario || null,
    source: "pdf_text_table",
    ocr: false,
    interpolated: false
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
    "Surrender Charge": row.surrenderCharge,
    sourcePage: row.sourcePage,
    scenario: row.scenario,
    tableLabel: row.tableLabel,
    lapse: row.lapse,
    nonguaranteedCurrent: row.nonguaranteedCurrent || null
  }));
}

module.exports = {
  parseIulIllustrationTables,
  toAnnualValuesEngineRows,
  parseSurrenderChargeSchedule,
  parseLedgerRow,
  parseMoneyToken
};
