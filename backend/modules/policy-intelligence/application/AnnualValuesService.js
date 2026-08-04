/**
 * Annual Values application service (Sprint 4A / BR-060).
 * Persists canonical AnnualValue entities linked to reviewId.
 * Does not modify Insurance Facts, Rule Engine, Language Layer, or Recommendations.
 */

const {
  analyzeAnnualValues,
  getAnnualValuesCatalog
} = require("../domain/annual-values/annualValuesEngine");
const { mapReview } = require("./policyMappers");

function httpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

function mapAnnualValueRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    setId: row.annual_value_set_id,
    reviewId: row.policy_review_id,
    policyYear: row.policy_year,
    insuredAge: row.insured_age,
    annualPremium: row.annual_premium != null ? Number(row.annual_premium) : null,
    scheduledPremium: row.scheduled_premium != null ? Number(row.scheduled_premium) : null,
    premiumLoad: row.premium_load != null ? Number(row.premium_load) : null,
    administrativeCharge:
      row.administrative_charge != null ? Number(row.administrative_charge) : null,
    costOfInsurance: row.cost_of_insurance != null ? Number(row.cost_of_insurance) : null,
    riderCharges: row.rider_charges != null ? Number(row.rider_charges) : null,
    interestCredited: row.interest_credited != null ? Number(row.interest_credited) : null,
    accountValue: row.account_value != null ? Number(row.account_value) : null,
    cashValue: row.cash_value != null ? Number(row.cash_value) : null,
    cashSurrenderValue:
      row.cash_surrender_value != null ? Number(row.cash_surrender_value) : null,
    deathBenefit: row.death_benefit != null ? Number(row.death_benefit) : null,
    loanBalance: row.loan_balance != null ? Number(row.loan_balance) : null,
    withdrawals: row.withdrawals != null ? Number(row.withdrawals) : null,
    netCashValue: row.net_cash_value != null ? Number(row.net_cash_value) : null
  };
}

function mapAnnualValueSet(setRow, valueRows = []) {
  if (!setRow) {
    return null;
  }

  return {
    id: setRow.id,
    reviewId: setRow.policy_review_id,
    extractionId: setRow.policy_extraction_id || null,
    source: setRow.source,
    rowCount: setRow.row_count,
    timeline: valueRows.map(mapAnnualValueRow).filter(Boolean),
    summaryMetrics: setRow.summary_metrics || {},
    validationResults: setRow.validation_results || {},
    calculationMetadata: setRow.calculation_metadata || {},
    createdAt: setRow.created_at,
    updatedAt: setRow.updated_at
  };
}

class AnnualValuesService {
  constructor({ repository }) {
    this.repository = repository;
  }

  getCatalog() {
    return getAnnualValuesCatalog();
  }

  /**
   * Analyze without persisting (pure engine).
   */
  analyze(rows, options = {}) {
    return analyzeAnnualValues(rows, options);
  }

  /**
   * Normalize, validate, calculate, and persist Annual Values for a review.
   */
  async upsertForReview({
    organizationId,
    userId = null,
    reviewId,
    rows,
    extractionId = null,
    source = "structured_table"
  }) {
    if (!organizationId || !reviewId) {
      throw httpError("organizationId and reviewId are required.", 400, "ANNUAL_VALUES_CONTEXT_REQUIRED");
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      throw httpError("Annual Values rows are required.", 400, "ANNUAL_VALUES_ROWS_REQUIRED");
    }

    const review = await this.repository.getReview(organizationId, reviewId);
    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const analysis = analyzeAnnualValues(rows, {
      reviewId,
      extractionId,
      source
    });

    if (!analysis.validationResults.valid) {
      // Persist invalid timelines only when caller wants audit? Spec wants validation results
      // in output — still allow persist so UI can show issues; mark metadata.
    }

    const setRow = await this.repository.replaceAnnualValueSet({
      organization_id: organizationId,
      policy_review_id: reviewId,
      policy_extraction_id: extractionId,
      source,
      row_count: analysis.timeline.length,
      summary_metrics: analysis.summaryMetrics,
      validation_results: analysis.validationResults,
      calculation_metadata: analysis.calculationMetadata,
      metadata: {
        engine: analysis.meta.engine,
        version: analysis.meta.version,
        factsImmutable: true
      },
      created_by: userId
    });

    const valueRows = await this.repository.insertAnnualValues(
      analysis.timeline.map((row) => ({
        annual_value_set_id: setRow.id,
        organization_id: organizationId,
        policy_review_id: reviewId,
        policy_year: row.policyYear,
        insured_age: row.insuredAge,
        annual_premium: row.annualPremium,
        scheduled_premium: row.scheduledPremium,
        premium_load: row.premiumLoad,
        administrative_charge: row.administrativeCharge,
        cost_of_insurance: row.costOfInsurance,
        rider_charges: row.riderCharges,
        interest_credited: row.interestCredited,
        account_value: row.accountValue,
        cash_value: row.cashValue,
        cash_surrender_value: row.cashSurrenderValue,
        death_benefit: row.deathBenefit,
        loan_balance: row.loanBalance,
        withdrawals: row.withdrawals,
        net_cash_value: row.netCashValue,
        metadata: {}
      }))
    );

    return {
      review: mapReview(review),
      analysis: {
        timeline: analysis.timeline,
        summaryMetrics: analysis.summaryMetrics,
        validationResults: analysis.validationResults,
        calculationMetadata: analysis.calculationMetadata,
        meta: analysis.meta
      },
      persisted: mapAnnualValueSet(setRow, valueRows)
    };
  }

  async getForReview(organizationId, reviewId) {
    const review = await this.repository.getReview(organizationId, reviewId);
    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const setRow = await this.repository.getLatestAnnualValueSet(organizationId, reviewId);
    if (!setRow) {
      return {
        review: mapReview(review),
        annualValues: null
      };
    }

    const valueRows = await this.repository.listAnnualValuesForSet(setRow.id);
    return {
      review: mapReview(review),
      annualValues: mapAnnualValueSet(setRow, valueRows)
    };
  }

  /**
   * Build analysis from extraction payload annualValues (if present) without redesigning Facts.
   */
  analyzeFromExtraction(extractedData = {}, options = {}) {
    const rows = Array.isArray(extractedData?.annualValues)
      ? extractedData.annualValues
      : Array.isArray(extractedData?.annual_values)
        ? extractedData.annual_values
        : [];

    return analyzeAnnualValues(rows, options);
  }
}

module.exports = {
  AnnualValuesService,
  mapAnnualValueSet,
  mapAnnualValueRow
};
