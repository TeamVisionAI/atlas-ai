/**
 * Financial Intelligence — Strategy Evaluation application service (RC3).
 * Consumes PI via adapter; never mutates PI Facts / Rules / Annual Values / Findings.
 * Implements BR-062 / BR-066 and Invest-the-Difference evaluation rules.
 */

const {
  analyzeInsuranceLanguage
} = require("../../policy-intelligence/domain/insurance-language/languageLayer");
const { buildCurrentIulSnapshot } = require("../domain/adapters/currentIulSnapshotAdapter");
const {
  buildInvestTheDifferenceEvaluation
} = require("../domain/engines/investTheDifferenceEngine");
const {
  MODULE_ID,
  MODULE_VERSION,
  EVALUATION_STATUSES,
  SECTION_TITLE,
  RISK_PROFILES
} = require("../domain/constants");
const { PROJECTION_SCENARIOS, PROJECTION_DISCLAIMER } = require("../domain/projections/projectionAssumptions");
const { getFundCatalog } = require("../domain/config/fundFamilyConfig");

function defaultFiRepository() {
  const {
    StrategyEvaluationRepository
  } = require("../infrastructure/StrategyEvaluationRepository");
  return new StrategyEvaluationRepository();
}

function defaultPolicyRepository() {
  const {
    PolicyIntelligenceRepository
  } = require("../../policy-intelligence/infrastructure/PolicyIntelligenceRepository");
  return new PolicyIntelligenceRepository();
}

async function writeAuditSafe(entry) {
  try {
    const { writeAuditLog } = require("../../../security/auditLogService");
    return await writeAuditLog(entry);
  } catch {
    return null;
  }
}

function httpError(message, statusCode = 400, publicCode = "FI_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

function toPersistableJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

class StrategyEvaluationService {
  constructor(deps = {}) {
    this.repository = deps.repository || defaultFiRepository();
    this.policyRepository = deps.policyRepository || defaultPolicyRepository();
  }

  getModuleSummary() {
    return {
      moduleId: MODULE_ID,
      version: MODULE_VERSION,
      sectionTitle: SECTION_TITLE,
      strategy: "invest_the_difference",
      capabilities: {
        strategyEvaluation: true,
        officialQuoteIntegration: false,
        verifiedFundCatalog: false,
        pdfExport: false,
        automatedEligibility: false,
        suitabilityWorkflow: false
      },
      projectionAssumptions: PROJECTION_SCENARIOS,
      projectionDisclaimer: PROJECTION_DISCLAIMER,
      fundCatalog: getFundCatalog(),
      statuses: EVALUATION_STATUSES,
      br066: true
    };
  }

  /**
   * Load PI Facts for a review (read-only). Does not write to PI.
   */
  async loadPiFactsForReview(organizationId, reviewId) {
    const review = await this.policyRepository.getReview(organizationId, reviewId);
    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const extractions = await this.policyRepository.listExtractionsForReview(
      organizationId,
      reviewId
    );
    const extraction = extractions?.[0] || null;
    const extractedData = extraction?.extracted_data || null;

    if (!extractedData) {
      return {
        review,
        extraction: null,
        insuranceFacts: null,
        snapshotResult: buildCurrentIulSnapshot(null, { sourceReviewId: reviewId })
      };
    }

    const language = analyzeInsuranceLanguage(extractedData, {
      extractionId: extraction.id
    });

    const insuranceFacts = language.insuranceFacts;
    const snapshotResult = buildCurrentIulSnapshot(insuranceFacts, {
      sourceReviewId: reviewId,
      sourceFactVersion: extraction.id
    });

    return {
      review,
      extraction,
      insuranceFacts,
      snapshotResult
    };
  }

  async createFromReview({
    organizationId,
    userId,
    reviewId,
    prospectId = null,
    termQuote = null,
    investmentHorizon = null,
    riskProfile = RISK_PROFILES.NOT_COMPLETED,
    replacementAcknowledged = false,
    override = null,
    forceClientDiscussion = false
  }) {
    const { review, snapshotResult } = await this.loadPiFactsForReview(
      organizationId,
      reviewId
    );

    const evaluation = buildInvestTheDifferenceEvaluation({
      snapshotResult,
      termQuoteInput: termQuote,
      investmentHorizon,
      riskProfile,
      replacementAcknowledged,
      override,
      forceClientDiscussion
    });

    const familyId = this.repository.newFamilyId();
    const row = this.buildInsertRow({
      organizationId,
      reviewId,
      prospectId: prospectId || review.prospect_id || null,
      evaluationFamilyId: familyId,
      version: 1,
      evaluation,
      replacementAcknowledged,
      userId
    });

    const saved = await this.repository.insert(row);

    await writeAuditSafe({
      organizationId,
      userId,
      action: "fi.strategy_evaluation.created",
      targetType: "fi_strategy_evaluation",
      targetId: saved.id,
      metadata: {
        reviewId,
        version: 1,
        status: saved.status,
        strategyKey: "invest_the_difference"
      }
    });

    return this.toDto(saved);
  }

  async getEvaluation(organizationId, evaluationId) {
    const row = await this.repository.getById(organizationId, evaluationId);
    if (!row) {
      throw httpError("Strategy evaluation not found.", 404, "FI_EVALUATION_NOT_FOUND");
    }
    return this.toDto(row);
  }

  async getLatestForReview(organizationId, reviewId) {
    const review = await this.policyRepository.getReview(organizationId, reviewId);
    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const row = await this.repository.getLatestForReview(organizationId, reviewId);
    if (!row) {
      return null;
    }
    return this.toDto(row);
  }

  async getHistoryForReview(organizationId, reviewId) {
    const review = await this.policyRepository.getReview(organizationId, reviewId);
    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const rows = await this.repository.listHistoryForReview(organizationId, reviewId);
    return rows.map((row) => this.toDto(row));
  }

  async updateTermQuote({ organizationId, userId, evaluationId, termQuote }) {
    return this.reviseEvaluation({
      organizationId,
      userId,
      evaluationId,
      patch: { termQuote },
      auditAction: "fi.strategy_evaluation.term_quote_updated"
    });
  }

  async updateInvestmentHorizon({ organizationId, userId, evaluationId, investmentHorizon }) {
    return this.reviseEvaluation({
      organizationId,
      userId,
      evaluationId,
      patch: { investmentHorizon },
      auditAction: "fi.strategy_evaluation.horizon_updated"
    });
  }

  async updateRiskProfile({ organizationId, userId, evaluationId, riskProfile }) {
    return this.reviseEvaluation({
      organizationId,
      userId,
      evaluationId,
      patch: { riskProfile },
      auditAction: "fi.strategy_evaluation.risk_profile_updated"
    });
  }

  async acknowledgeReplacement({ organizationId, userId, evaluationId, acknowledged = true }) {
    return this.reviseEvaluation({
      organizationId,
      userId,
      evaluationId,
      patch: { replacementAcknowledged: Boolean(acknowledged) },
      auditAction: "fi.strategy_evaluation.replacement_acknowledged"
    });
  }

  async applyOverride({ organizationId, userId, evaluationId, override }) {
    return this.reviseEvaluation({
      organizationId,
      userId,
      evaluationId,
      patch: { override },
      auditAction: "fi.strategy_evaluation.override_applied"
    });
  }

  async createRevision({
    organizationId,
    userId,
    evaluationId,
    forceClientDiscussion = false
  }) {
    return this.reviseEvaluation({
      organizationId,
      userId,
      evaluationId,
      patch: { forceClientDiscussion },
      auditAction: "fi.strategy_evaluation.revision_created"
    });
  }

  /**
   * Material input changes create a new immutable version and mark the prior as SUPERSEDED.
   */
  async reviseEvaluation({ organizationId, userId, evaluationId, patch = {}, auditAction }) {
    const current = await this.repository.getById(organizationId, evaluationId);
    if (!current) {
      throw httpError("Strategy evaluation not found.", 404, "FI_EVALUATION_NOT_FOUND");
    }
    if (current.status === EVALUATION_STATUSES.SUPERSEDED) {
      throw httpError(
        "Cannot revise a superseded evaluation. Load the latest version.",
        409,
        "FI_EVALUATION_SUPERSEDED"
      );
    }

    const { snapshotResult } = await this.loadPiFactsForReview(
      organizationId,
      current.reviewId
    );

    const termQuote = patch.termQuote !== undefined ? patch.termQuote : current.termQuote;
    const investmentHorizon =
      patch.investmentHorizon !== undefined
        ? patch.investmentHorizon
        : current.investmentHorizon?.years
          ? current.investmentHorizon
          : null;
    const riskProfile =
      patch.riskProfile !== undefined ? patch.riskProfile : current.riskProfile;
    const replacementAcknowledged =
      patch.replacementAcknowledged !== undefined
        ? patch.replacementAcknowledged
        : current.replacementAcknowledged;
    const override =
      patch.override !== undefined
        ? patch.override
        : current.representativeOverride
          ? {
              totalProposedMonthlyOutlay:
                current.representativeOverride.totalProposedMonthlyOutlay,
              reason: current.overrideReason || current.representativeOverride.reason
            }
          : null;

    const evaluation = buildInvestTheDifferenceEvaluation({
      snapshotResult,
      termQuoteInput: termQuote && Object.keys(termQuote).length ? termQuote : null,
      investmentHorizon,
      riskProfile,
      replacementAcknowledged,
      override,
      forceClientDiscussion: Boolean(patch.forceClientDiscussion)
    });

    const nextVersion = Number(current.version) + 1;
    const row = this.buildInsertRow({
      organizationId,
      reviewId: current.reviewId,
      prospectId: current.prospectId,
      evaluationFamilyId: current.evaluationFamilyId,
      version: nextVersion,
      evaluation,
      replacementAcknowledged,
      userId
    });

    const saved = await this.repository.insert(row);
    await this.repository.markSuperseded(organizationId, current.id, saved.id, userId);

    await writeAuditSafe({
      organizationId,
      userId,
      action: auditAction || "fi.strategy_evaluation.revised",
      targetType: "fi_strategy_evaluation",
      targetId: saved.id,
      metadata: {
        previousEvaluationId: current.id,
        reviewId: current.reviewId,
        version: nextVersion,
        status: saved.status
      }
    });

    return this.toDto(saved);
  }

  buildInsertRow({
    organizationId,
    reviewId,
    prospectId,
    evaluationFamilyId,
    version,
    evaluation,
    replacementAcknowledged = false,
    userId
  }) {
    const calc = evaluation.calculations || {};
    const termQuote = evaluation.termQuote || {};

    return {
      organization_id: organizationId,
      review_id: reviewId,
      prospect_id: prospectId || null,
      evaluation_family_id: evaluationFamilyId,
      version,
      status: evaluation.status,
      strategy_key: "invest_the_difference",
      section_title: evaluation.sectionTitle || SECTION_TITLE,
      current_iul_snapshot: toPersistableJson(evaluation.snapshot || {}),
      source_fact_version: evaluation.snapshot?.sourceFactVersion || null,
      current_iul_monthly_premium: calc.currentIulMonthlyPremium ?? null,
      current_iul_death_benefit: calc.currentIulDeathBenefit ?? null,
      term_quote: toPersistableJson(termQuote),
      proposed_term_death_benefit: calc.proposedTermDeathBenefit ?? null,
      proposed_term_duration: termQuote.selectedTermDuration ?? null,
      proposed_term_monthly_premium: calc.proposedTermMonthlyPremium ?? null,
      premium_source: termQuote.premiumSource || "MISSING",
      quote_confirmation_status: termQuote.representativeConfirmed
        ? "CONFIRMED"
        : "PENDING",
      eligibility_confirmation_status: termQuote.longestAvailableTermConfirmed
        ? "CONFIRMED"
        : "PENDING",
      investment_horizon: toPersistableJson(evaluation.investmentHorizon || {}),
      risk_profile: evaluation.riskProfile || RISK_PROFILES.NOT_COMPLETED,
      replacement_acknowledged: Boolean(replacementAcknowledged),
      unbounded_premium_difference: calc.unboundedPremiumDifference ?? null,
      monthly_investment_difference: calc.monthlyInvestmentDifference ?? null,
      total_proposed_monthly_outlay: calc.totalProposedMonthlyOutlay ?? null,
      projection_assumptions: toPersistableJson(PROJECTION_SCENARIOS),
      projection_outputs: toPersistableJson(evaluation.projections || {}),
      evaluation_payload: toPersistableJson(evaluation),
      missing_data_warnings: toPersistableJson(evaluation.missingDataWarnings || []),
      replacement_warnings: toPersistableJson(evaluation.replacementWarnings || []),
      representative_override: toPersistableJson(evaluation.override || null),
      override_reason: evaluation.override?.reason || null,
      created_by: userId || null,
      updated_by: userId || null
    };
  }

  toDto(row) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      reviewId: row.reviewId,
      prospectId: row.prospectId,
      evaluationFamilyId: row.evaluationFamilyId,
      version: row.version,
      status: row.status,
      strategyKey: row.strategyKey,
      sectionTitle: row.sectionTitle,
      currentIulSnapshot: row.currentIulSnapshot,
      sourceFactVersion: row.sourceFactVersion,
      currentIulMonthlyPremium: row.currentIulMonthlyPremium,
      currentIulDeathBenefit: row.currentIulDeathBenefit,
      termQuote: row.termQuote,
      proposedTermDeathBenefit: row.proposedTermDeathBenefit,
      proposedTermDuration: row.proposedTermDuration,
      proposedTermMonthlyPremium: row.proposedTermMonthlyPremium,
      premiumSource: row.premiumSource,
      quoteConfirmationStatus: row.quoteConfirmationStatus,
      eligibilityConfirmationStatus: row.eligibilityConfirmationStatus,
      investmentHorizon: row.investmentHorizon,
      riskProfile: row.riskProfile,
      replacementAcknowledged: row.replacementAcknowledged,
      unboundedPremiumDifference: row.unboundedPremiumDifference,
      monthlyInvestmentDifference: row.monthlyInvestmentDifference,
      totalProposedMonthlyOutlay: row.totalProposedMonthlyOutlay,
      projectionAssumptions: row.projectionAssumptions,
      projectionOutputs: row.projectionOutputs,
      evaluation: row.evaluationPayload,
      missingDataWarnings: row.missingDataWarnings,
      replacementWarnings: row.replacementWarnings,
      representativeOverride: row.representativeOverride,
      overrideReason: row.overrideReason,
      supersededBy: row.supersededBy,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: {
        moduleId: MODULE_ID,
        br066: true,
        recommendsPurchase: false,
        recommendsSurrender: false,
        piImmutable: true
      }
    };
  }
}

module.exports = {
  StrategyEvaluationService
};
