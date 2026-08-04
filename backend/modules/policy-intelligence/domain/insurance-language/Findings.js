/**
 * Findings domain (BR-057).
 * Findings are derived from Insurance Facts by Business Rules — never facts themselves.
 */

const FINDING_CODES = Object.freeze({
  HIGH_COI_GROWTH: "HIGH_COI_GROWTH",
  HIGH_ILLUSTRATION_DEPENDENCY: "HIGH_ILLUSTRATION_DEPENDENCY",
  POLICY_LAPSE_RISK: "POLICY_LAPSE_RISK",
  HIGH_RIDER_COST: "HIGH_RIDER_COST",
  OPTION_B_DETECTED: "OPTION_B_DETECTED",
  LOW_LIQUIDITY: "LOW_LIQUIDITY",
  HIGH_COMPLEXITY: "HIGH_COMPLEXITY"
});

const FINDING_CATALOG = Object.freeze({
  [FINDING_CODES.HIGH_COI_GROWTH]: Object.freeze({
    code: FINDING_CODES.HIGH_COI_GROWTH,
    label: "High COI Growth",
    severity: "high"
  }),
  [FINDING_CODES.HIGH_ILLUSTRATION_DEPENDENCY]: Object.freeze({
    code: FINDING_CODES.HIGH_ILLUSTRATION_DEPENDENCY,
    label: "High Illustration Dependency",
    severity: "medium"
  }),
  [FINDING_CODES.POLICY_LAPSE_RISK]: Object.freeze({
    code: FINDING_CODES.POLICY_LAPSE_RISK,
    label: "Policy Lapse Risk",
    severity: "high"
  }),
  [FINDING_CODES.HIGH_RIDER_COST]: Object.freeze({
    code: FINDING_CODES.HIGH_RIDER_COST,
    label: "High Rider Cost",
    severity: "medium"
  }),
  [FINDING_CODES.OPTION_B_DETECTED]: Object.freeze({
    code: FINDING_CODES.OPTION_B_DETECTED,
    label: "Option B Detected",
    severity: "info"
  }),
  [FINDING_CODES.LOW_LIQUIDITY]: Object.freeze({
    code: FINDING_CODES.LOW_LIQUIDITY,
    label: "Low Liquidity",
    severity: "medium"
  }),
  [FINDING_CODES.HIGH_COMPLEXITY]: Object.freeze({
    code: FINDING_CODES.HIGH_COMPLEXITY,
    label: "High Complexity",
    severity: "info"
  })
});

function createFinding(code, { evidence = null } = {}) {
  const catalog = FINDING_CATALOG[code];

  if (!catalog) {
    return null;
  }

  return Object.freeze({
    layer: "findings",
    code: catalog.code,
    label: catalog.label,
    severity: catalog.severity,
    evidence: evidence || null,
    derived: true,
    source: "business_rules"
  });
}

function listFindingCatalog() {
  return Object.values(FINDING_CATALOG);
}

module.exports = {
  FINDING_CODES,
  FINDING_CATALOG,
  createFinding,
  listFindingCatalog
};
