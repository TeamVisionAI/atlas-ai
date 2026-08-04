/**
 * Supabase persistence for Policy Intelligence aggregates.
 * Implements BR-051 / BR-052.
 */

const { supabase } = require("../../../services/supabaseService");

const REVIEWS = "atlas_policy_reviews";
const DOCUMENTS = "atlas_policy_documents";
const EXTRACTIONS = "atlas_policy_extractions";
const ANNUAL_VALUE_SETS = "atlas_policy_annual_value_sets";
const ANNUAL_VALUES = "atlas_policy_annual_values";

function mapError(error, fallbackMessage) {
  const err = new Error(error?.message || fallbackMessage);
  err.statusCode = error?.code === "PGRST116" ? 404 : 500;
  err.publicCode = error?.code || "POLICY_PERSISTENCE_ERROR";
  err.cause = error;
  return err;
}

function activeFilter(query) {
  return query.is("deleted_at", null);
}

class PolicyIntelligenceRepository {
  async countReviews(organizationId) {
    const { count, error } = await activeFilter(
      supabase.from(REVIEWS).select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
    );

    if (error) {
      throw mapError(error, "Failed to count policy reviews.");
    }

    return count || 0;
  }

  async countDocuments(organizationId) {
    const { count, error } = await activeFilter(
      supabase
        .from(DOCUMENTS)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
    );

    if (error) {
      throw mapError(error, "Failed to count policy documents.");
    }

    return count || 0;
  }

  async countExtractions(organizationId) {
    const { count, error } = await activeFilter(
      supabase
        .from(EXTRACTIONS)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
    );

    if (error) {
      throw mapError(error, "Failed to count policy extractions.");
    }

    return count || 0;
  }

  async listReviews(organizationId, { limit = 50 } = {}) {
    const { data, error } = await activeFilter(
      supabase
        .from(REVIEWS)
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit)
    );

    if (error) {
      throw mapError(error, "Failed to list policy reviews.");
    }

    return data || [];
  }

  async getReview(organizationId, reviewId) {
    const { data, error } = await activeFilter(
      supabase
        .from(REVIEWS)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", reviewId)
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to load policy review.");
    }

    return data || null;
  }

  async createReview(row) {
    const { data, error } = await supabase.from(REVIEWS).insert(row).select("*").single();

    if (error) {
      throw mapError(error, "Failed to create policy review.");
    }

    return data;
  }

  async updateReview(organizationId, reviewId, patch) {
    const { data, error } = await activeFilter(
      supabase
        .from(REVIEWS)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("id", reviewId)
        .select("*")
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to update policy review.");
    }

    return data || null;
  }

  async listDocumentsForReview(organizationId, reviewId) {
    const { data, error } = await activeFilter(
      supabase
        .from(DOCUMENTS)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("policy_review_id", reviewId)
        .order("created_at", { ascending: false })
    );

    if (error) {
      throw mapError(error, "Failed to list policy documents.");
    }

    return data || [];
  }

  async getDocument(organizationId, documentId) {
    const { data, error } = await activeFilter(
      supabase
        .from(DOCUMENTS)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", documentId)
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to load policy document.");
    }

    return data || null;
  }

  async createDocument(row) {
    const { data, error } = await supabase.from(DOCUMENTS).insert(row).select("*").single();

    if (error) {
      throw mapError(error, "Failed to create policy document.");
    }

    return data;
  }

  async updateDocument(organizationId, documentId, patch) {
    const { data, error } = await activeFilter(
      supabase
        .from(DOCUMENTS)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("id", documentId)
        .select("*")
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to update policy document.");
    }

    return data || null;
  }

  async getExtractionByDocument(organizationId, documentId) {
    const { data, error } = await activeFilter(
      supabase
        .from(EXTRACTIONS)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("policy_document_id", documentId)
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to load policy extraction.");
    }

    return data || null;
  }

  async listExtractionsForReview(organizationId, reviewId) {
    const { data, error } = await activeFilter(
      supabase
        .from(EXTRACTIONS)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("policy_review_id", reviewId)
        .order("created_at", { ascending: false })
    );

    if (error) {
      throw mapError(error, "Failed to list policy extractions.");
    }

    return data || [];
  }

  async createExtraction(row) {
    const { data, error } = await supabase.from(EXTRACTIONS).insert(row).select("*").single();

    if (error) {
      throw mapError(error, "Failed to create policy extraction.");
    }

    return data;
  }

  async updateExtraction(organizationId, extractionId, patch) {
    const { data, error } = await activeFilter(
      supabase
        .from(EXTRACTIONS)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("id", extractionId)
        .select("*")
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to update policy extraction.");
    }

    return data || null;
  }

  // -------------------------------------------------------------------------
  // Annual Values (Sprint 4A / BR-060)
  // -------------------------------------------------------------------------

  async getLatestAnnualValueSet(organizationId, reviewId) {
    const { data, error } = await activeFilter(
      supabase
        .from(ANNUAL_VALUE_SETS)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("policy_review_id", reviewId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (error) {
      throw mapError(error, "Failed to load annual value set.");
    }

    return data || null;
  }

  async softDeleteAnnualValueSetsForReview(organizationId, reviewId) {
    const { error } = await activeFilter(
      supabase
        .from(ANNUAL_VALUE_SETS)
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("organization_id", organizationId)
        .eq("policy_review_id", reviewId)
    );

    if (error) {
      throw mapError(error, "Failed to archive prior annual value sets.");
    }
  }

  async replaceAnnualValueSet(row) {
    await this.softDeleteAnnualValueSetsForReview(row.organization_id, row.policy_review_id);

    const { data, error } = await supabase
      .from(ANNUAL_VALUE_SETS)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      throw mapError(error, "Failed to create annual value set.");
    }

    return data;
  }

  async insertAnnualValues(rows = []) {
    if (!rows.length) {
      return [];
    }

    const { data, error } = await supabase.from(ANNUAL_VALUES).insert(rows).select("*");

    if (error) {
      throw mapError(error, "Failed to insert annual values.");
    }

    return data || [];
  }

  async listAnnualValuesForSet(setId) {
    const { data, error } = await supabase
      .from(ANNUAL_VALUES)
      .select("*")
      .eq("annual_value_set_id", setId)
      .order("policy_year", { ascending: true });

    if (error) {
      throw mapError(error, "Failed to list annual values.");
    }

    return data || [];
  }
}

module.exports = { PolicyIntelligenceRepository };
