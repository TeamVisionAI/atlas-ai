/**
 * RC3 Phase B — frontend contract + revision sequence + death-benefit adjustment.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildInvestTheDifferenceEvaluation,
  PREMIUM_SOURCES,
  RISK_PROFILES
} = require("../modules/financial-intelligence");
const { buildCurrentIulSnapshot } = require("../modules/financial-intelligence");
const {
  buildFrontendContract
} = require("../modules/financial-intelligence/application/evaluationFrontendContract");
const {
  StrategyEvaluationService
} = require("../modules/financial-intelligence/application/StrategyEvaluationService");
const { randomUUID } = require("crypto");
const { EVALUATION_STATUSES } = require("../modules/financial-intelligence/domain/constants");

function iulFacts() {
  return {
    layer: "insurance_facts",
    immutable: true,
    productType: "Indexed Universal Life",
    faceAmount: 400000,
    premium: { amount: 310, frequency: "monthly" },
    carrier: "Sample"
  };
}

class MemoryFiRepo {
  constructor() {
    this.rows = new Map();
  }
  newFamilyId() {
    return randomUUID();
  }
  async getById(organizationId, evaluationId) {
    const row = this.rows.get(evaluationId);
    return row && row.organizationId === organizationId ? { ...row } : null;
  }
  async getLatestForReview(organizationId, reviewId) {
    return (
      [...this.rows.values()]
        .filter(
          (row) =>
            row.organizationId === organizationId &&
            row.reviewId === reviewId &&
            row.status !== EVALUATION_STATUSES.SUPERSEDED
        )
        .sort((a, b) => b.version - a.version)[0] || null
    );
  }
  async listHistoryForReview(organizationId, reviewId) {
    return [...this.rows.values()]
      .filter((row) => row.organizationId === organizationId && row.reviewId === reviewId)
      .sort((a, b) => b.version - a.version);
  }
  async insert(row) {
    const mapped = {
      id: randomUUID(),
      organizationId: row.organization_id,
      reviewId: row.review_id,
      prospectId: row.prospect_id,
      evaluationFamilyId: row.evaluation_family_id,
      version: row.version,
      status: row.status,
      strategyKey: row.strategy_key,
      sectionTitle: row.section_title,
      currentIulSnapshot: row.current_iul_snapshot,
      sourceFactVersion: row.source_fact_version,
      currentIulMonthlyPremium: row.current_iul_monthly_premium,
      currentIulDeathBenefit: row.current_iul_death_benefit,
      termQuote: row.term_quote,
      proposedTermDeathBenefit: row.proposed_term_death_benefit,
      proposedTermDuration: row.proposed_term_duration,
      proposedTermMonthlyPremium: row.proposed_term_monthly_premium,
      premiumSource: row.premium_source,
      quoteConfirmationStatus: row.quote_confirmation_status,
      eligibilityConfirmationStatus: row.eligibility_confirmation_status,
      investmentHorizon: row.investment_horizon,
      riskProfile: row.risk_profile,
      replacementAcknowledged: row.replacement_acknowledged,
      unboundedPremiumDifference: row.unbounded_premium_difference,
      monthlyInvestmentDifference: row.monthly_investment_difference,
      totalProposedMonthlyOutlay: row.total_proposed_monthly_outlay,
      projectionAssumptions: row.projection_assumptions,
      projectionOutputs: row.projection_outputs,
      evaluationPayload: row.evaluation_payload,
      missingDataWarnings: row.missing_data_warnings,
      replacementWarnings: row.replacement_warnings,
      representativeOverride: row.representative_override,
      overrideReason: row.override_reason,
      supersededBy: null,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.rows.set(mapped.id, mapped);
    return { ...mapped };
  }
  async markSuperseded(organizationId, evaluationId, supersededBy, updatedBy) {
    const row = this.rows.get(evaluationId);
    row.status = EVALUATION_STATUSES.SUPERSEDED;
    row.supersededBy = supersededBy;
    row.updatedBy = updatedBy;
    return { ...row };
  }
}

class MemoryPiRepo {
  constructor({ organizationId, reviewId, facts = iulFacts() }) {
    this.organizationId = organizationId;
    this.reviewId = reviewId;
    this.review = { id: reviewId, organization_id: organizationId, prospect_id: null };
    this.extractions = [{ id: "extract-1", extracted_data: facts }];
    this.factsMutated = false;
  }
  async getReview(organizationId, reviewId) {
    if (organizationId !== this.organizationId || reviewId !== this.reviewId) return null;
    return this.review;
  }
  async listExtractionsForReview(organizationId, reviewId) {
    if (organizationId !== this.organizationId || reviewId !== this.reviewId) return [];
    return this.extractions;
  }
}

describe("FI frontend contract", () => {
  it("exposes backend calculation authority fields", () => {
    const snapshotResult = buildCurrentIulSnapshot(iulFacts(), { sourceReviewId: "r1" });
    const engine = buildInvestTheDifferenceEvaluation({
      snapshotResult,
      termQuoteInput: {
        monthlyPremium: 80,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
        longestAvailableTermConfirmed: true
      },
      investmentHorizon: { years: 20, confirmed: true },
      riskProfile: RISK_PROFILES.MODERATE,
      replacementAcknowledged: true
    });

    const contract = buildFrontendContract({
      id: "eval-1",
      version: 2,
      status: engine.status,
      reviewId: "r1",
      currentIulMonthlyPremium: 310,
      currentIulDeathBenefit: 400000,
      proposedTermDeathBenefit: 400000,
      monthlyInvestmentDifference: 230,
      totalProposedMonthlyOutlay: 310,
      premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
      evaluation: engine,
      missingDataWarnings: engine.missingDataWarnings,
      replacementWarnings: engine.replacementWarnings,
      metadata: { moduleId: "financial-intelligence" }
    });

    assert.equal(contract.metadata.calculationAuthority, "backend");
    assert.equal(contract.metadata.frontendMayRecalculate, false);
    assert.equal(contract.isCurrentVersion, true);
    assert.equal(contract.sameDeathBenefit, true);
    assert.equal(contract.proposedMutualFundContribution, 230);
    assert.ok(contract.comparisonTable);
    assert.ok(contract.scenarioEmphasis);
  });

  it("flags explicit death-benefit adjustment", () => {
    const snapshotResult = buildCurrentIulSnapshot(iulFacts(), { sourceReviewId: "r1" });
    const engine = buildInvestTheDifferenceEvaluation({
      snapshotResult,
      termQuoteInput: {
        deathBenefit: 350000,
        monthlyPremium: 70,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
        longestAvailableTermConfirmed: true
      }
    });
    assert.equal(engine.calculations.sameDeathBenefit, false);
    assert.equal(engine.calculations.proposedTermDeathBenefit, 350000);
    assert.ok(
      engine.missingDataWarnings.some((w) => /explicit representative adjustment/i.test(w))
    );
  });
});

describe("FI end-to-end revision sequence", () => {
  it("creates draft without quote then revises through quote, horizon, risk, replacement", async () => {
    const org = "11111111-1111-1111-1111-111111111111";
    const reviewId = "22222222-2222-2222-2222-222222222222";
    const pi = new MemoryPiRepo({ organizationId: org, reviewId });
    const beforeFacts = JSON.stringify(pi.extractions);
    const service = new StrategyEvaluationService({
      repository: new MemoryFiRepo(),
      policyRepository: pi
    });

    const v1 = await service.createFromReview({
      organizationId: org,
      userId: "33333333-3333-3333-3333-333333333333",
      reviewId
    });
    assert.equal(v1.version, 1);
    assert.equal(v1.status, EVALUATION_STATUSES.DRAFT_TERM_QUOTE_REQUIRED);
    assert.equal(v1.monthlyInvestmentDifference, null);

    const v2 = await service.updateTermQuote({
      organizationId: org,
      userId: "33333333-3333-3333-3333-333333333333",
      evaluationId: v1.id,
      termQuote: {
        monthlyPremium: 80,
        termDurationYears: 20,
        deathBenefit: 400000,
        premiumSource: PREMIUM_SOURCES.PRELIMINARY_ESTIMATE,
        longestAvailableTermConfirmed: false
      }
    });
    assert.equal(v2.version, 2);
    assert.equal(v2.premiumSource, PREMIUM_SOURCES.PRELIMINARY_ESTIMATE);
    assert.equal(v2.monthlyInvestmentDifference, 230);
    assert.equal(v2.isCurrentVersion, true);

    const v3 = await service.updateTermQuote({
      organizationId: org,
      userId: "33333333-3333-3333-3333-333333333333",
      evaluationId: v2.id,
      termQuote: {
        monthlyPremium: 75,
        termDurationYears: 20,
        deathBenefit: 400000,
        premiumSource: PREMIUM_SOURCES.OFFICIAL_QUOTE,
        longestAvailableTermConfirmed: true,
        representativeConfirmed: true
      }
    });
    assert.equal(v3.version, 3);
    assert.equal(v3.proposedTermMonthlyPremium, 75);

    const v4 = await service.updateInvestmentHorizon({
      organizationId: org,
      userId: "33333333-3333-3333-3333-333333333333",
      evaluationId: v3.id,
      investmentHorizon: { years: 15, confirmed: true, goalLabel: "College" }
    });
    assert.equal(v4.version, 4);
    assert.ok(v4.projectionOutputs?.scenarios?.length === 3);
    assert.equal(v4.investmentHorizon.years, 15);

    const v5 = await service.updateRiskProfile({
      organizationId: org,
      userId: "33333333-3333-3333-3333-333333333333",
      evaluationId: v4.id,
      riskProfile: RISK_PROFILES.MODERATE
    });
    assert.equal(v5.version, 5);

    const v6 = await service.acknowledgeReplacement({
      organizationId: org,
      userId: "33333333-3333-3333-3333-333333333333",
      evaluationId: v5.id,
      acknowledged: true
    });
    assert.equal(v6.version, 6);
    assert.equal(v6.status, EVALUATION_STATUSES.READY_FOR_REPRESENTATIVE_REVIEW);
    assert.equal(v6.scenarioEmphasis.canEmphasizeInvestmentScenario, true);

    const history = await service.getHistoryForReview(org, reviewId);
    assert.equal(history.length, 6);
    assert.equal(history.filter((row) => row.isCurrentVersion).length, 1);
    assert.equal(JSON.stringify(pi.extractions), beforeFacts);
    assert.equal(pi.factsMutated, false);
  });
});
