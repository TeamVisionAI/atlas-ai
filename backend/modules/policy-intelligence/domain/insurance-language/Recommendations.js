/**
 * Recommendations domain (BR-057).
 * Recommendations are generated from Findings only — never directly from AI or free text.
 */

const RECOMMENDATION_CODES = Object.freeze({
  REQUEST_INFORCE_ILLUSTRATION: "REQUEST_INFORCE_ILLUSTRATION",
  STRESS_TEST_AT_5_PERCENT: "STRESS_TEST_AT_5_PERCENT",
  REVIEW_RIDER_NECESSITY: "REVIEW_RIDER_NECESSITY",
  COMPARE_ALTERNATIVE_FUNDING: "COMPARE_ALTERNATIVE_FUNDING",
  REVIEW_LONG_TERM_SUSTAINABILITY: "REVIEW_LONG_TERM_SUSTAINABILITY"
});

const RECOMMENDATION_CATALOG = Object.freeze({
  [RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION]: Object.freeze({
    code: RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION,
    label: "Request In-force Illustration"
  }),
  [RECOMMENDATION_CODES.STRESS_TEST_AT_5_PERCENT]: Object.freeze({
    code: RECOMMENDATION_CODES.STRESS_TEST_AT_5_PERCENT,
    label: "Stress Test at 5%"
  }),
  [RECOMMENDATION_CODES.REVIEW_RIDER_NECESSITY]: Object.freeze({
    code: RECOMMENDATION_CODES.REVIEW_RIDER_NECESSITY,
    label: "Review Rider Necessity"
  }),
  [RECOMMENDATION_CODES.COMPARE_ALTERNATIVE_FUNDING]: Object.freeze({
    code: RECOMMENDATION_CODES.COMPARE_ALTERNATIVE_FUNDING,
    label: "Compare Alternative Funding"
  }),
  [RECOMMENDATION_CODES.REVIEW_LONG_TERM_SUSTAINABILITY]: Object.freeze({
    code: RECOMMENDATION_CODES.REVIEW_LONG_TERM_SUSTAINABILITY,
    label: "Review Long-Term Sustainability"
  })
});

/** Finding code → recommendation codes (deterministic). Includes Sprint 3 PI-* codes. */
const FINDING_TO_RECOMMENDATIONS = Object.freeze({
  HIGH_COI_GROWTH: [
    RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION,
    RECOMMENDATION_CODES.REVIEW_LONG_TERM_SUSTAINABILITY
  ],
  HIGH_ILLUSTRATION_DEPENDENCY: [
    RECOMMENDATION_CODES.STRESS_TEST_AT_5_PERCENT,
    RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION,
    RECOMMENDATION_CODES.REVIEW_LONG_TERM_SUSTAINABILITY
  ],
  POLICY_LAPSE_RISK: [
    RECOMMENDATION_CODES.REVIEW_LONG_TERM_SUSTAINABILITY,
    RECOMMENDATION_CODES.COMPARE_ALTERNATIVE_FUNDING
  ],
  HIGH_RIDER_COST: [RECOMMENDATION_CODES.REVIEW_RIDER_NECESSITY],
  OPTION_B_DETECTED: [
    RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION,
    RECOMMENDATION_CODES.COMPARE_ALTERNATIVE_FUNDING
  ],
  INCREASING_DEATH_BENEFIT_DETECTED: [
    RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION,
    RECOMMENDATION_CODES.COMPARE_ALTERNATIVE_FUNDING
  ],
  VOLATILITY_CONTROLLED_INDEX_DETECTED: [RECOMMENDATION_CODES.STRESS_TEST_AT_5_PERCENT],
  MULTIPLE_RIDERS_DETECTED: [RECOMMENDATION_CODES.REVIEW_RIDER_NECESSITY],
  INDEXED_CREDITING_STRATEGY_DETECTED: [RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION],
  FLEXIBLE_PREMIUM_STRUCTURE_DETECTED: [RECOMMENDATION_CODES.COMPARE_ALTERNATIVE_FUNDING],
  REQUIRED_INSURANCE_FACTS_MISSING: [RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION],
  LOW_LIQUIDITY: [
    RECOMMENDATION_CODES.COMPARE_ALTERNATIVE_FUNDING,
    RECOMMENDATION_CODES.REVIEW_LONG_TERM_SUSTAINABILITY
  ],
  HIGH_COMPLEXITY: [
    RECOMMENDATION_CODES.REQUEST_INFORCE_ILLUSTRATION,
    RECOMMENDATION_CODES.REVIEW_RIDER_NECESSITY
  ]
});

function createRecommendation(code, basedOnFindings = []) {
  const catalog = RECOMMENDATION_CATALOG[code];

  if (!catalog) {
    return null;
  }

  return Object.freeze({
    layer: "recommendations",
    code: catalog.code,
    label: catalog.label,
    basedOnFindings: Object.freeze([...basedOnFindings]),
    derived: true,
    source: "findings"
  });
}

/**
 * Generate recommendations from Findings only (BR-057).
 */
function buildRecommendationsFromFindings(findings = []) {
  const byCode = new Map();

  for (const finding of findings) {
    const codes = FINDING_TO_RECOMMENDATIONS[finding.code] || [];

    for (const code of codes) {
      const existing = byCode.get(code) || { code, basedOnFindings: [] };
      if (!existing.basedOnFindings.includes(finding.code)) {
        existing.basedOnFindings.push(finding.code);
      }
      byCode.set(code, existing);
    }
  }

  return Object.freeze(
    [...byCode.values()]
      .map((entry) => createRecommendation(entry.code, entry.basedOnFindings))
      .filter(Boolean)
  );
}

function listRecommendationCatalog() {
  return Object.values(RECOMMENDATION_CATALOG);
}

module.exports = {
  RECOMMENDATION_CODES,
  RECOMMENDATION_CATALOG,
  FINDING_TO_RECOMMENDATIONS,
  createRecommendation,
  buildRecommendationsFromFindings,
  listRecommendationCatalog
};
