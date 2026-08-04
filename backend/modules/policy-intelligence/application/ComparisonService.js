/**
 * Comparison application service (Sprint 5 / BR-061).
 * Assembles scenarios from existing pipeline outputs and runs Comparison Engine.
 */

const {
  compareScenarios,
  compareWithStress,
  getComparisonCatalog,
  createPolicyScenario,
  buildStressScenario,
  SCENARIO_TYPES
} = require("../domain/comparison/comparisonEngine");
const { analyzeInsuranceLanguage } = require("../domain/insurance-language/languageLayer");
const { analyzeAnnualValues } = require("../domain/annual-values/annualValuesEngine");
const { mapReview } = require("./policyMappers");

function httpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

class ComparisonService {
  constructor({ repository, annualValuesService } = {}) {
    this.repository = repository;
    this.annualValuesService = annualValuesService;
  }

  getCatalog() {
    return getComparisonCatalog();
  }

  /**
   * Build Current Policy scenario from review extraction + annual values.
   */
  async buildCurrentScenario(organizationId, reviewId) {
    const review = await this.repository.getReview(organizationId, reviewId);
    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const extractions = await this.repository.listExtractionsForReview(organizationId, reviewId);
    const extraction = extractions?.[0] || null;
    const extractedData = extraction?.extracted_data || extraction?.extractedData || {};

    const language = analyzeInsuranceLanguage(extractedData, {
      extractionId: extraction?.id || null
    });

    let annualValuesPayload = null;
    if (this.annualValuesService) {
      const stored = await this.annualValuesService.getForReview(organizationId, reviewId);
      if (stored?.annualValues) {
        annualValuesPayload = {
          timeline: stored.annualValues.timeline,
          summaryMetrics: stored.annualValues.summaryMetrics
        };
      }
    }

    if (!annualValuesPayload && Array.isArray(extractedData.annualValues)) {
      const analysis = analyzeAnnualValues(extractedData.annualValues, {
        reviewId,
        extractionId: extraction?.id || null
      });
      annualValuesPayload = {
        timeline: analysis.timeline,
        summaryMetrics: analysis.summaryMetrics
      };
    }

    return {
      review: mapReview(review),
      scenario: createPolicyScenario({
        id: `${reviewId}__current`,
        key: "scenario_a",
        label: "Current Policy",
        type: SCENARIO_TYPES.CURRENT_POLICY,
        insuranceFacts: language.insuranceFacts,
        annualValues: annualValuesPayload || { timeline: [], summaryMetrics: {} },
        findings: language.findings,
        recommendations: language.recommendations,
        metadata: {
          reviewId,
          extractionId: extraction?.id || null
        }
      })
    };
  }

  /**
   * Compare explicitly supplied scenarios (already assembled).
   */
  compare(scenarios, options = {}) {
    const normalized = (scenarios || []).map((item, index) => {
      if (item?.annualValues && item?.id) {
        return item.key
          ? item
          : createPolicyScenario({
              ...item,
              key: item.key || (index === 0 ? "scenario_a" : `scenario_${String.fromCharCode(97 + index)}`)
            });
      }
      return createPolicyScenario({
        id: item.id || `scenario_${index}`,
        key: item.key || (index === 0 ? "scenario_a" : `scenario_${String.fromCharCode(97 + index)}`),
        label: item.label,
        type: item.type,
        insuranceFacts: item.insuranceFacts,
        annualValues: item.annualValues,
        findings: item.findings,
        recommendations: item.recommendations,
        stress: item.stress,
        metadata: item.metadata
      });
    });

    return compareScenarios(normalized, options);
  }

  /**
   * Build current scenario for a review, apply stress, compare.
   */
  async compareReviewWithStress({
    organizationId,
    reviewId,
    stress = { kind: "illustrated_rate", fromRate: 0.07, toRate: 0.05 },
    comparisonType = "current_vs_stress"
  }) {
    const { review, scenario } = await this.buildCurrentScenario(organizationId, reviewId);

    if (!scenario.annualValues?.timeline?.length) {
      throw httpError(
        "Annual Values timeline is required before stress comparison.",
        400,
        "ANNUAL_VALUES_REQUIRED_FOR_COMPARISON"
      );
    }

    const { stressScenario, comparison } = compareWithStress(scenario, stress, {
      comparisonType
    });

    return {
      review,
      scenarios: [scenario, stressScenario],
      comparison
    };
  }

  /**
   * Compare two stored reviews (or current + explicit scenario B payload).
   */
  async compareReviews({
    organizationId,
    reviewIdA,
    reviewIdB = null,
    scenarioB = null,
    stress = null,
    comparisonType = "side_by_side"
  }) {
    const { review, scenario: scenarioA } = await this.buildCurrentScenario(
      organizationId,
      reviewIdA
    );

    let second = null;

    if (stress) {
      second = buildStressScenario(scenarioA, stress);
    } else if (scenarioB) {
      second = createPolicyScenario({
        id: scenarioB.id || `${reviewIdA}__scenario_b`,
        key: "scenario_b",
        label: scenarioB.label || "Scenario B",
        type: scenarioB.type || SCENARIO_TYPES.ALTERNATIVE_STRATEGY,
        insuranceFacts: scenarioB.insuranceFacts,
        annualValues: scenarioB.annualValues,
        findings: scenarioB.findings,
        recommendations: scenarioB.recommendations,
        metadata: scenarioB.metadata
      });
    } else if (reviewIdB) {
      const built = await this.buildCurrentScenario(organizationId, reviewIdB);
      second = createPolicyScenario({
        id: built.scenario.id,
        key: "scenario_b",
        label: built.review?.title || built.scenario.label || "Scenario B",
        type: built.scenario.type,
        insuranceFacts: built.scenario.insuranceFacts,
        annualValues: built.scenario.annualValues,
        findings: built.scenario.findings,
        recommendations: built.scenario.recommendations,
        metadata: { ...(built.scenario.metadata || {}), reviewId: reviewIdB }
      });
    } else {
      throw httpError(
        "Provide reviewIdB, scenarioB, or stress for comparison.",
        400,
        "COMPARISON_SECOND_SCENARIO_REQUIRED"
      );
    }

    const comparison = compareScenarios([scenarioA, second], { comparisonType });

    return {
      review,
      scenarios: [scenarioA, second],
      comparison
    };
  }
}

module.exports = { ComparisonService };
