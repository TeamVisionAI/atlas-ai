/**
 * Annual Values application service (Sprint 4A / BR-060).
 * Persists canonical AnnualValue entities linked to reviewId.
 * Does not modify Insurance Facts, Rule Engine, Language Layer, or Recommendations.
 */

const {
  analyzeAnnualValues,
  getAnnualValuesCatalog
} = require("../domain/annual-values/annualValuesEngine");
const { extractIllustrationFromPdf } = require("../domain/illustration-extract");
const { buildReportCheckpoints } = require("../domain/illustration-extract/reportCheckpoints");
const { downloadPolicyDocument } = require("../infrastructure/policyDocumentStorage");
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
    netCashValue: row.net_cash_value != null ? Number(row.net_cash_value) : null,
    metadata: row.metadata || {}
  };
}

function extrasByPolicyYear(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const year = Number(row.policyYear ?? row.policy_year ?? row.Year);
    if (!Number.isFinite(year)) {
      continue;
    }
    map.set(year, row);
  }
  return map;
}

function buildRowMetadata(sourceRow = {}, canonical = {}) {
  const missingFields = [
    "annualPremium",
    "costOfInsurance",
    "premiumLoad",
    "administrativeCharge",
    "riderCharges",
    "interestCredited",
    "accountValue",
    "cashValue",
    "cashSurrenderValue",
    "deathBenefit",
    "loanBalance",
    "withdrawals"
  ].filter((field) => canonical[field] == null);

  return {
    sourcePage: sourceRow.sourcePage || null,
    tableLabel: sourceRow.tableLabel || null,
    scenario: sourceRow.scenario || null,
    surrenderCharge: sourceRow.surrenderCharge ?? sourceRow["Surrender Charge"] ?? null,
    lapse: sourceRow.lapse === true,
    nonguaranteedCurrent: sourceRow.nonguaranteedCurrent || null,
    premiumExpenseCharge: sourceRow.premiumExpenseCharge ?? null,
    monthlyExpenseCharge: sourceRow.monthlyExpenseCharge ?? null,
    monthlyPolicyFee: sourceRow.monthlyPolicyFee ?? null,
    accumulatedValueCharge: sourceRow.accumulatedValueCharge ?? null,
    totalAnnualCharges: sourceRow.totalAnnualCharges ?? null,
    illustratedRate: sourceRow.illustratedRate ?? null,
    income: sourceRow.income ?? null,
    plannedLoan: sourceRow.plannedLoan ?? null,
    accumulatedLoan: sourceRow.accumulatedLoan ?? null,
    adapterKey: sourceRow.adapterKey || null,
    missingFields,
    invented: false,
    interpolated: false
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
    source = "structured_table",
    setMetadata = {}
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

    const extras = extrasByPolicyYear(rows);
    const reportCheckpoints = buildReportCheckpoints(analysis.timeline).map((point) => ({
      requestedYear: point.requestedYear,
      usedYear: point.usedYear,
      fallback: point.fallback,
      fallbackStep: point.fallbackStep
    }));

    const setRow = await this.repository.replaceAnnualValueSet({
      organization_id: organizationId,
      policy_review_id: reviewId,
      policy_extraction_id: extractionId,
      source,
      row_count: analysis.timeline.length,
      summary_metrics: analysis.summaryMetrics,
      validation_results: analysis.validationResults,
      calculation_metadata: {
        ...analysis.calculationMetadata,
        reportCheckpoints
      },
      metadata: {
        engine: analysis.meta.engine,
        version: analysis.meta.version,
        factsImmutable: true,
        reportCheckpoints,
        ...setMetadata
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
        metadata: buildRowMetadata(extras.get(row.policyYear) || {}, row)
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

  /**
   * Extract illustration tables from a PDF buffer and persist via BR-060 tables.
   */
  async extractAndPersistFromPdf({
    organizationId,
    userId = null,
    reviewId,
    extractionId = null,
    buffer
  }) {
    const extracted = await extractIllustrationFromPdf(buffer);
    if (!extracted.ok) {
      return {
        persisted: false,
        reason: extracted.reason,
        pageCount: extracted.pageCount,
        riders: extracted.riders,
        annualValues: null
      };
    }

    const persisted = await this.upsertForReview({
      organizationId,
      userId,
      reviewId,
      extractionId,
      rows: extracted.engineRows,
      source: "pdf_text_table",
      setMetadata: {
        illustrationScenario: extracted.scenario,
        adapterKey: extracted.adapterKey || null,
        comparisonScenario: extracted.comparisonScenario || extracted.scenario || null,
        riders: extracted.riders,
        policyCostTerms: extracted.policyCostTerms || null,
        surrenderChargeSchedule: extracted.surrenderCharges,
        surrenderMechanics: extracted.surrenderMechanics || null,
        reportCheckpoints: extracted.reportCheckpoints,
        ocr: false,
        interpolated: false
      }
    });

    return {
      persisted: true,
      reason: null,
      pageCount: extracted.pageCount,
      riders: extracted.riders,
      policyCostTerms: extracted.policyCostTerms || null,
      scenario: extracted.scenario,
      rowCount: extracted.rows.length,
      reportCheckpoints: extracted.reportCheckpoints,
      annualValues: persisted
    };
  }

  async extractAndPersistFromStoredDocument({
    organizationId,
    userId = null,
    reviewId,
    documentId = null
  }) {
    const review = await this.repository.getReview(organizationId, reviewId);
    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const documents = documentId
      ? [await this.repository.getDocument(organizationId, documentId)].filter(Boolean)
      : await this.repository.listDocumentsForReview(organizationId, reviewId);
    const pdf = documents.find(
      (doc) =>
        doc?.mime_type === "application/pdf" &&
        doc.upload_status === "stored" &&
        doc.storage_path
    );

    if (!pdf) {
      throw httpError("No stored PDF was found for this review.", 404, "POLICY_DOCUMENT_NOT_STORED");
    }

    const extraction = await this.repository.getExtractionByDocument(organizationId, pdf.id);
    const { buffer } = await downloadPolicyDocument(pdf.storage_path);
    const result = await this.extractAndPersistFromPdf({
      organizationId,
      userId,
      reviewId,
      extractionId: extraction?.id || null,
      buffer
    });

    if (result.persisted && extraction?.id) {
      const extractedData = {
        ...(extraction.extracted_data || {}),
        annualValues: result.annualValues?.analysis?.timeline || [],
        riders: [
          ...((extraction.extracted_data && extraction.extracted_data.riders) || []),
          ...result.riders
        ],
        policyCostTerms: result.policyCostTerms || extraction.extracted_data?.policyCostTerms || null
      };
      await this.repository.updateExtraction(organizationId, extraction.id, {
        extracted_data: extractedData,
        metadata: {
          ...(extraction.metadata || {}),
          illustrationExtract: true,
          ocr: false
        }
      });
    }

    return {
      ...result,
      documentId: pdf.id,
      extractionId: extraction?.id || null
    };
  }
}

module.exports = {
  AnnualValuesService,
  mapAnnualValueSet,
  mapAnnualValueRow
};
