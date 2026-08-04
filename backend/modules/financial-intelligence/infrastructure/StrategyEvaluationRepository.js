/**
 * FI-owned persistence for strategy evaluations (RC3).
 * Never writes to Policy Intelligence tables.
 */

const { supabase } = require("../../../services/supabaseService");
const { randomUUID } = require("crypto");

const TABLE = "atlas_fi_strategy_evaluations";

function mapError(error, fallbackMessage) {
  const err = new Error(error?.message || fallbackMessage);
  err.statusCode = error?.code === "PGRST116" ? 404 : 500;
  err.publicCode = error?.code || "FI_PERSISTENCE_ERROR";
  err.cause = error;
  return err;
}

function activeFilter(query) {
  return query.is("deleted_at", null);
}

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    reviewId: row.review_id,
    prospectId: row.prospect_id || null,
    evaluationFamilyId: row.evaluation_family_id,
    version: row.version,
    status: row.status,
    strategyKey: row.strategy_key,
    sectionTitle: row.section_title,
    currentIulSnapshot: row.current_iul_snapshot || {},
    sourceFactVersion: row.source_fact_version,
    currentIulMonthlyPremium: row.current_iul_monthly_premium,
    currentIulDeathBenefit: row.current_iul_death_benefit,
    termQuote: row.term_quote || {},
    proposedTermDeathBenefit: row.proposed_term_death_benefit,
    proposedTermDuration: row.proposed_term_duration,
    proposedTermMonthlyPremium: row.proposed_term_monthly_premium,
    premiumSource: row.premium_source,
    quoteConfirmationStatus: row.quote_confirmation_status,
    eligibilityConfirmationStatus: row.eligibility_confirmation_status,
    investmentHorizon: row.investment_horizon || {},
    riskProfile: row.risk_profile,
    replacementAcknowledged: Boolean(row.replacement_acknowledged),
    unboundedPremiumDifference: row.unbounded_premium_difference,
    monthlyInvestmentDifference: row.monthly_investment_difference,
    totalProposedMonthlyOutlay: row.total_proposed_monthly_outlay,
    projectionAssumptions: row.projection_assumptions || {},
    projectionOutputs: row.projection_outputs || {},
    evaluationPayload: row.evaluation_payload || {},
    missingDataWarnings: row.missing_data_warnings || [],
    replacementWarnings: row.replacement_warnings || [],
    representativeOverride: row.representative_override || null,
    overrideReason: row.override_reason || null,
    supersededBy: row.superseded_by || null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class StrategyEvaluationRepository {
  newFamilyId() {
    return randomUUID();
  }

  async getById(organizationId, evaluationId) {
    const { data, error } = await activeFilter(
      supabase
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", evaluationId)
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to load strategy evaluation.");
    }

    return mapRow(data);
  }

  async getLatestForReview(organizationId, reviewId) {
    const { data, error } = await activeFilter(
      supabase
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("review_id", reviewId)
        .neq("status", "SUPERSEDED")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to load latest strategy evaluation.");
    }

    return mapRow(data);
  }

  async listHistoryForReview(organizationId, reviewId, { limit = 50 } = {}) {
    const { data, error } = await activeFilter(
      supabase
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("review_id", reviewId)
        .order("version", { ascending: false })
        .limit(limit)
    );

    if (error) {
      throw mapError(error, "Failed to list strategy evaluation history.");
    }

    return (data || []).map(mapRow);
  }

  async listHistoryForFamily(organizationId, evaluationFamilyId) {
    const { data, error } = await activeFilter(
      supabase
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("evaluation_family_id", evaluationFamilyId)
        .order("version", { ascending: false })
    );

    if (error) {
      throw mapError(error, "Failed to list evaluation family history.");
    }

    return (data || []).map(mapRow);
  }

  async insert(row) {
    const { data, error } = await supabase.from(TABLE).insert(row).select("*").single();

    if (error) {
      throw mapError(error, "Failed to create strategy evaluation.");
    }

    return mapRow(data);
  }

  async markSuperseded(organizationId, evaluationId, supersededBy, updatedBy) {
    const { data, error } = await activeFilter(
      supabase
        .from(TABLE)
        .update({
          status: "SUPERSEDED",
          superseded_by: supersededBy,
          updated_by: updatedBy || null,
          updated_at: new Date().toISOString()
        })
        .eq("organization_id", organizationId)
        .eq("id", evaluationId)
        .select("*")
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to supersede strategy evaluation.");
    }

    return mapRow(data);
  }
}

module.exports = {
  StrategyEvaluationRepository,
  mapRow
};
