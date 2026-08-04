/**
 * Extensible comparison type registry (Sprint 5 / BR-061).
 * Future types (e.g. Current IUL vs Alternative) register here.
 */

const COMPARISON_TYPES = Object.freeze({
  SIDE_BY_SIDE: Object.freeze({
    id: "side_by_side",
    label: "Side-by-Side",
    description: "Compare two or more scenarios using the canonical metric set.",
    minScenarios: 2,
    maxScenarios: 8
  }),
  CURRENT_VS_STRESS: Object.freeze({
    id: "current_vs_stress",
    label: "Current vs Stress Test",
    description: "Compare current policy against a deterministic stress scenario.",
    minScenarios: 2,
    maxScenarios: 2
  }),
  CURRENT_VS_ALTERNATIVE_FUNDING: Object.freeze({
    id: "current_vs_alternative_funding",
    label: "Current vs Alternative Funding",
    description: "Compare current funding against an alternative funding scenario.",
    minScenarios: 2,
    maxScenarios: 2
  }),
  CURRENT_IUL_VS_ALTERNATIVE: Object.freeze({
    id: "current_iul_vs_alternative",
    label: "Current IUL vs Alternative Strategy",
    description: "Future-compatible type for IUL vs alternative strategy comparisons.",
    minScenarios: 2,
    maxScenarios: 4
  })
});

function resolveComparisonType(typeId) {
  const id = String(typeId || COMPARISON_TYPES.SIDE_BY_SIDE.id);
  return (
    Object.values(COMPARISON_TYPES).find((item) => item.id === id) ||
    COMPARISON_TYPES.SIDE_BY_SIDE
  );
}

function listComparisonTypes() {
  return Object.values(COMPARISON_TYPES);
}

module.exports = {
  COMPARISON_TYPES,
  resolveComparisonType,
  listComparisonTypes
};
