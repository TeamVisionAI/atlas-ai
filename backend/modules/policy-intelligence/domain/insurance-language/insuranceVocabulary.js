/**
 * Canonical Insurance Language Layer vocabulary (Sprint 2).
 * Carrier terminology → Atlas terminology.
 * Not AI. Not OCR. Deterministic synonym map only.
 */

const ATLAS_TERMS = Object.freeze({
  PREFERRED_NON_SMOKER: "Preferred Non-Smoker",
  PREFERRED_PLUS: "Preferred Plus",
  STANDARD_NON_SMOKER: "Standard Non-Smoker",
  STANDARD_SMOKER: "Standard Smoker",
  INCREASING_DEATH_BENEFIT: "Increasing Death Benefit",
  LEVEL_DEATH_BENEFIT: "Level Death Benefit",
  ACCELERATED_DEATH_BENEFIT: "Accelerated Death Benefit",
  COST_OF_INSURANCE: "Cost of Insurance",
  GUIDELINE_PREMIUM_TEST: "Guideline Premium Test",
  CASH_VALUE_ACCUMULATION_TEST: "Cash Value Accumulation Test",
  TERM_LIFE: "Term Life",
  WHOLE_LIFE: "Whole Life",
  UNIVERSAL_LIFE: "Universal Life",
  INDEXED_UNIVERSAL_LIFE: "Indexed Universal Life",
  VARIABLE_UNIVERSAL_LIFE: "Variable Universal Life"
});

/** category → alias (normalized lowercase) → Atlas term */
const VOCABULARY_MAP = Object.freeze({
  riskClassification: Object.freeze({
    "preferred nt": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "preferred non-tobacco": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "preferred non tobacco": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "preferred nonttobacco": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "preferred nonsmoker": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "preferred non-smoker": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "preferred non smoker": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "pref nt": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "pref non-smoker": ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "preferred plus": ATLAS_TERMS.PREFERRED_PLUS,
    "pref plus": ATLAS_TERMS.PREFERRED_PLUS,
    "standard nt": ATLAS_TERMS.STANDARD_NON_SMOKER,
    "standard non-smoker": ATLAS_TERMS.STANDARD_NON_SMOKER,
    "standard nonsmoker": ATLAS_TERMS.STANDARD_NON_SMOKER,
    "standard smoker": ATLAS_TERMS.STANDARD_SMOKER,
    "std smoker": ATLAS_TERMS.STANDARD_SMOKER
  }),
  tobaccoStatus: Object.freeze({
    "non-tobacco": "Non-Smoker",
    "non tobacco": "Non-Smoker",
    nonttobacco: "Non-Smoker",
    nonsmoker: "Non-Smoker",
    "non-smoker": "Non-Smoker",
    "non smoker": "Non-Smoker",
    "never smoker": "Non-Smoker",
    smoker: "Smoker",
    tobacco: "Smoker",
    "tobacco user": "Smoker"
  }),
  deathBenefitOption: Object.freeze({
    "option b": ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "option-b": ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "db option b": ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    increasing: ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "increasing db": ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "increasing death benefit": ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "option a": ATLAS_TERMS.LEVEL_DEATH_BENEFIT,
    "option-a": ATLAS_TERMS.LEVEL_DEATH_BENEFIT,
    level: ATLAS_TERMS.LEVEL_DEATH_BENEFIT,
    "level db": ATLAS_TERMS.LEVEL_DEATH_BENEFIT,
    "level death benefit": ATLAS_TERMS.LEVEL_DEATH_BENEFIT
  }),
  rider: Object.freeze({
    adb: ATLAS_TERMS.ACCELERATED_DEATH_BENEFIT,
    "a.d.b.": ATLAS_TERMS.ACCELERATED_DEATH_BENEFIT,
    "accelerated db": ATLAS_TERMS.ACCELERATED_DEATH_BENEFIT,
    "accelerated death benefit": ATLAS_TERMS.ACCELERATED_DEATH_BENEFIT,
    "accel death benefit": ATLAS_TERMS.ACCELERATED_DEATH_BENEFIT
  }),
  charge: Object.freeze({
    coi: ATLAS_TERMS.COST_OF_INSURANCE,
    "c.o.i.": ATLAS_TERMS.COST_OF_INSURANCE,
    "cost of insurance": ATLAS_TERMS.COST_OF_INSURANCE,
    "cost-of-insurance": ATLAS_TERMS.COST_OF_INSURANCE
  }),
  complianceTest: Object.freeze({
    gpt: ATLAS_TERMS.GUIDELINE_PREMIUM_TEST,
    "g.p.t.": ATLAS_TERMS.GUIDELINE_PREMIUM_TEST,
    "guideline premium test": ATLAS_TERMS.GUIDELINE_PREMIUM_TEST,
    cvat: ATLAS_TERMS.CASH_VALUE_ACCUMULATION_TEST,
    "cash value accumulation test": ATLAS_TERMS.CASH_VALUE_ACCUMULATION_TEST
  }),
  productType: Object.freeze({
    term: ATLAS_TERMS.TERM_LIFE,
    "term life": ATLAS_TERMS.TERM_LIFE,
    whole: ATLAS_TERMS.WHOLE_LIFE,
    "whole life": ATLAS_TERMS.WHOLE_LIFE,
    ul: ATLAS_TERMS.UNIVERSAL_LIFE,
    "universal life": ATLAS_TERMS.UNIVERSAL_LIFE,
    iul: ATLAS_TERMS.INDEXED_UNIVERSAL_LIFE,
    "indexed ul": ATLAS_TERMS.INDEXED_UNIVERSAL_LIFE,
    "indexed universal life": ATLAS_TERMS.INDEXED_UNIVERSAL_LIFE,
    vul: ATLAS_TERMS.VARIABLE_UNIVERSAL_LIFE,
    "variable ul": ATLAS_TERMS.VARIABLE_UNIVERSAL_LIFE,
    "variable universal life": ATLAS_TERMS.VARIABLE_UNIVERSAL_LIFE
  })
});

function normalizeAliasKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Map carrier/synonym terminology into Atlas canonical terms.
 * Unknown values pass through trimmed (not invented).
 */
function mapToAtlasTerm(value, category) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const original = String(value).trim();
  const table = VOCABULARY_MAP[category];

  if (!table) {
    return original;
  }

  const mapped = table[normalizeAliasKey(original)];
  return mapped || original;
}

function listVocabularyCategories() {
  return Object.keys(VOCABULARY_MAP);
}

function getVocabularySnapshot() {
  return {
    atlasTerms: { ...ATLAS_TERMS },
    categories: listVocabularyCategories(),
    maps: Object.fromEntries(
      Object.entries(VOCABULARY_MAP).map(([category, table]) => [category, { ...table }])
    )
  };
}

module.exports = {
  ATLAS_TERMS,
  VOCABULARY_MAP,
  mapToAtlasTerm,
  normalizeAliasKey,
  listVocabularyCategories,
  getVocabularySnapshot
};
