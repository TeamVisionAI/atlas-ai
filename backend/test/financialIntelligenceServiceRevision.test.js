/**
 * RC3 — Strategy evaluation revision / override / status persistence mapping.
 * Uses in-memory repository stubs (no live DB).
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");

const {
  StrategyEvaluationService
} = require("../modules/financial-intelligence/application/StrategyEvaluationService");
const {
  EVALUATION_STATUSES,
  PREMIUM_SOURCES,
  RISK_PROFILES
} = require("../modules/financial-intelligence/domain/constants");

function makeFactsExtraction() {
  return {
    id: "extract-1",
    extracted_data: {
      productType: "Indexed Universal Life",
      product: "Indexed Universal Life",
      carrier: "Sample",
      faceAmount: 400000,
      premium: { amount: 310, frequency: "monthly" },
      insured: { issueAge: 48, gender: "Male" }
    }
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
    if (!row || row.organizationId !== organizationId) {
      return null;
    }
    return { ...row };
  }

  async getLatestForReview(organizationId, reviewId) {
    const list = [...this.rows.values()]
      .filter(
        (row) =>
          row.organizationId === organizationId &&
          row.reviewId === reviewId &&
          row.status !== EVALUATION_STATUSES.SUPERSEDED
      )
      .sort((a, b) => b.version - a.version);
    return list[0] ? { ...list[0] } : null;
  }

  async listHistoryForReview(organizationId, reviewId) {
    return [...this.rows.values()]
      .filter((row) => row.organizationId === organizationId && row.reviewId === reviewId)
      .sort((a, b) => b.version - a.version)
      .map((row) => ({ ...row }));
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
    if (!row || row.organizationId !== organizationId) {
      return null;
    }
    row.status = EVALUATION_STATUSES.SUPERSEDED;
    row.supersededBy = supersededBy;
    row.updatedBy = updatedBy;
    row.updatedAt = new Date().toISOString();
    return { ...row };
  }
}

class MemoryPiRepo {
  constructor({ organizationId, reviewId }) {
    this.organizationId = organizationId;
    this.reviewId = reviewId;
    this.review = {
      id: reviewId,
      organization_id: organizationId,
      prospect_id: null,
      title: "Test review"
    };
    this.extractions = [makeFactsExtraction()];
  }

  async getReview(organizationId, reviewId) {
    if (organizationId !== this.organizationId || reviewId !== this.reviewId) {
      return null;
    }
    return this.review;
  }

  async listExtractionsForReview(organizationId, reviewId) {
    if (organizationId !== this.organizationId || reviewId !== this.reviewId) {
      return [];
    }
    return this.extractions;
  }
}

describe("FI StrategyEvaluationService revision + tenant isolation", () => {
  let service;
  let fiRepo;
  const orgA = "org-a";
  const orgB = "org-b";
  const reviewId = "review-1";

  beforeEach(() => {
    fiRepo = new MemoryFiRepo();
    service = new StrategyEvaluationService({
      repository: fiRepo,
      policyRepository: new MemoryPiRepo({ organizationId: orgA, reviewId })
    });
  });

  it("creates evaluation and revises without overwriting prior version", async () => {
    const created = await service.createFromReview({
      organizationId: orgA,
      userId: "user-1",
      reviewId,
      termQuote: {
        monthlyPremium: 80,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.PRELIMINARY_ESTIMATE,
        longestAvailableTermConfirmed: false
      }
    });

    assert.equal(created.version, 1);
    assert.ok(created.evaluation);
    assert.equal(created.currentIulMonthlyPremium, 310);

    const revised = await service.updateTermQuote({
      organizationId: orgA,
      userId: "user-1",
      evaluationId: created.id,
      termQuote: {
        monthlyPremium: 75,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
        longestAvailableTermConfirmed: true,
        representativeConfirmed: true
      }
    });

    assert.equal(revised.version, 2);
    assert.equal(revised.proposedTermMonthlyPremium, 75);
    assert.notEqual(revised.id, created.id);

    const history = await service.getHistoryForReview(orgA, reviewId);
    assert.equal(history.length, 2);
    assert.equal(
      history.find((row) => row.id === created.id).status,
      EVALUATION_STATUSES.SUPERSEDED
    );
  });

  it("requires override reason via service path", async () => {
    const created = await service.createFromReview({
      organizationId: orgA,
      userId: "user-1",
      reviewId
    });

    await assert.rejects(
      () =>
        service.applyOverride({
          organizationId: orgA,
          userId: "user-1",
          evaluationId: created.id,
          override: { totalProposedMonthlyOutlay: 350 }
        }),
      /override requires a reason/i
    );
  });

  it("enforces tenant isolation on getEvaluation", async () => {
    const created = await service.createFromReview({
      organizationId: orgA,
      userId: "user-1",
      reviewId
    });

    await assert.rejects(
      () => service.getEvaluation(orgB, created.id),
      (error) => error.statusCode === 404
    );
  });

  it("does not write into PI repository (extractions unchanged)", async () => {
    const pi = new MemoryPiRepo({ organizationId: orgA, reviewId });
    const before = JSON.stringify(pi.extractions);
    service = new StrategyEvaluationService({
      repository: fiRepo,
      policyRepository: pi
    });

    await service.createFromReview({
      organizationId: orgA,
      userId: "user-1",
      reviewId,
      termQuote: {
        monthlyPremium: 80,
        termDurationYears: 20,
        premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
        longestAvailableTermConfirmed: true
      },
      investmentHorizon: { years: 20, confirmed: true },
      riskProfile: RISK_PROFILES.MODERATE,
      replacementAcknowledged: true
    });

    assert.equal(JSON.stringify(pi.extractions), before);
    assert.equal(pi.extractions[0].extracted_data.strategyEvaluation, undefined);
  });
});

describe("FI routes auth wiring", () => {
  it("exports router factory that mounts under financial-intelligence", () => {
    const createRoutes = require("../modules/financial-intelligence/api/financialIntelligence.routes");
    const router = createRoutes({
      service: {
        getModuleSummary: () => ({ moduleId: "financial-intelligence" })
      }
    });
    assert.equal(typeof router, "function");
    assert.ok(Array.isArray(router.stack));
    assert.ok(router.stack.length > 5);
  });
});
