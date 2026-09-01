/**
 * BR-175 — service-role access to AI quality tables.
 */

const { supabase } = require("../services/supabaseService");
const { CASE_STATUSES } = require("../core/aiQuality/constants");

function isTableMissing(error) {
  const message = String(error?.message || error?.details || error || "");
  const code = String(error?.code || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  );
}

function mapCaseRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    prospectId: row.prospect_id,
    ownerUserId: row.owner_user_id,
    inboundMessageId: row.inbound_message_id,
    sourceEngine: row.source_engine,
    signalType: row.signal_type,
    episodeKey: row.episode_key,
    legacyInterpretation: row.legacy_interpretation,
    semanticInterpretation: row.semantic_interpretation,
    knownFactsBefore: row.known_facts_before,
    knownFactsAfter: row.known_facts_after,
    atlasAction: row.atlas_action,
    confidence: row.confidence,
    disagreementFields: row.disagreement_fields,
    latencyMs: row.latency_ms,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    estimatedCostUsd: row.estimated_cost_usd,
    detectedAt: row.detected_at,
    status: row.status,
    severity: row.severity,
    reviewerUserId: row.reviewer_user_id,
    reviewNotes: row.review_notes,
    expectedBehavior: row.expected_behavior,
    regressionCandidateId: row.regression_candidate_id,
    learningProposalId: row.learning_proposal_id || null,
    implementationId: row.implementation_id || null,
    inboundTextStored: false
  };
}

function toInsertPayload(row) {
  return {
    id: row.id,
    organization_id: row.organizationId,
    prospect_id: row.prospectId,
    owner_user_id: row.ownerUserId,
    inbound_message_id: row.inboundMessageId,
    source_engine: row.sourceEngine,
    signal_type: row.signalType,
    episode_key: row.episodeKey,
    legacy_interpretation: row.legacyInterpretation,
    semantic_interpretation: row.semanticInterpretation,
    known_facts_before: row.knownFactsBefore,
    known_facts_after: row.knownFactsAfter,
    atlas_action: row.atlasAction,
    confidence: row.confidence,
    disagreement_fields: row.disagreementFields,
    latency_ms: row.latencyMs,
    prompt_tokens: row.promptTokens,
    completion_tokens: row.completionTokens,
    estimated_cost_usd: row.estimatedCostUsd,
    detected_at: row.detectedAt,
    status: row.status,
    severity: row.severity,
    reviewer_user_id: row.reviewerUserId,
    review_notes: row.reviewNotes,
    expected_behavior: row.expectedBehavior,
    regression_candidate_id: row.regressionCandidateId
  };
}

function mapRegressionRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    status: row.status,
    spec: row.spec,
    markdown: row.markdown,
    createdByUserId: row.created_by_user_id,
    reviewerUserId: row.reviewer_user_id || null,
    riskLevel: row.risk_level || row.spec?.riskLevel || null,
    approvedAt: row.approved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    mutatesSourceCode: false,
    mutatesTests: false,
    implementationAuthorized: Boolean(row.implementation_authorized)
  };
}

function mapProposalRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    status: row.status,
    proposal: row.proposal,
    riskLevel: row.risk_level,
    confidence: row.confidence == null ? null : Number(row.confidence),
    recommendedAction: row.recommended_action,
    generatedBy: row.generated_by,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapImplementationRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    regressionId: row.regression_id,
    proposalId: row.proposal_id,
    status: row.status,
    spec: row.spec,
    markdown: row.markdown,
    authorizedByUserId: row.authorized_by_user_id,
    authorizedAt: row.authorized_at,
    mutatesSourceCode: false,
    mutatesTests: false,
    linkedBr: row.linked_br,
    linkedPr: row.linked_pr,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createSupabaseStore() {
  return {
    async getTenantSettings(organizationId) {
      const { data, error } = await supabase
        .from("ai_quality_tenant_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      if (!data) {
        return null;
      }
      return {
        organizationId: data.organization_id,
        participationEnabled: Boolean(data.participation_enabled),
        mode: data.mode,
        sampleRate: Number(data.sample_rate)
      };
    },
    async upsertTenantSettings(organizationId, patch) {
      const payload = {
        organization_id: organizationId,
        participation_enabled: Boolean(patch.participationEnabled),
        mode: patch.mode,
        sample_rate: patch.sampleRate,
        updated_at: new Date().toISOString(),
        updated_by_user_id: patch.updatedByUserId || null
      };
      const { data, error } = await supabase
        .from("ai_quality_tenant_settings")
        .upsert(payload, { onConflict: "organization_id" })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return {
        organizationId: data.organization_id,
        participationEnabled: Boolean(data.participation_enabled),
        mode: data.mode,
        sampleRate: Number(data.sample_rate)
      };
    },
    async findOpenByEpisodeKey(organizationId, episodeKey) {
      const { data, error } = await supabase
        .from("ai_quality_cases")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("episode_key", episodeKey)
        .in("status", [CASE_STATUSES.NEW, CASE_STATUSES.REVIEWING])
        .limit(1)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapCaseRow(data);
    },
    async insertCase(row) {
      const { data, error } = await supabase
        .from("ai_quality_cases")
        .insert(toInsertPayload(row))
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapCaseRow(data);
    },
    async getCase(id) {
      const { data, error } = await supabase.from("ai_quality_cases").select("*").eq("id", id).maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapCaseRow(data);
    },
    async listCases({ organizationId = null, signalType = null, tab = null } = {}) {
      let query = supabase.from("ai_quality_cases").select("*").order("detected_at", { ascending: false });
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      if (signalType) {
        query = query.eq("signal_type", signalType);
      }
      if (tab === "regressions") {
        query = query.eq("status", CASE_STATUSES.REGRESSION_CANDIDATE);
      }
      const { data, error } = await query;
      if (error) {
        if (isTableMissing(error)) {
          return [];
        }
        throw error;
      }
      let rows = (data || []).map(mapCaseRow);
      if (tab === "disagreements") {
        rows = rows.filter(
          (row) =>
            String(row.signalType).includes("DISAGREEMENT") ||
            row.signalType === "SEMANTIC_OBJECTION_MISSED"
        );
      }
      if (tab === "attention") {
        rows = rows.filter(
          (row) =>
            !String(row.signalType).startsWith("SEMANTIC_") ||
            row.signalType === "SEMANTIC_OBJECTION_MISSED"
        );
      }
      return rows;
    },
    async updateCase(id, patch) {
      const payload = {};
      if (patch.status != null) payload.status = patch.status;
      if (patch.reviewerUserId != null) payload.reviewer_user_id = patch.reviewerUserId;
      if (patch.reviewNotes != null) payload.review_notes = patch.reviewNotes;
      if (patch.expectedBehavior != null) payload.expected_behavior = patch.expectedBehavior;
      if (patch.regressionCandidateId != null) {
        payload.regression_candidate_id = patch.regressionCandidateId;
      }
      if (patch.learningProposalId != null) {
        payload.learning_proposal_id = patch.learningProposalId;
      }
      if (patch.implementationId != null) {
        payload.implementation_id = patch.implementationId;
      }
      payload.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("ai_quality_cases")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapCaseRow(data);
    },
    async insertRegression(row) {
      const { data, error } = await supabase
        .from("ai_quality_regression_candidates")
        .insert({
          id: row.id,
          organization_id: row.organizationId,
          case_id: row.caseId,
          status: row.status,
          spec: row.spec,
          markdown: row.markdown,
          created_by_user_id: row.createdByUserId,
          reviewer_user_id: row.reviewerUserId || row.createdByUserId || null,
          risk_level: row.riskLevel || null,
          approved_at: row.approvedAt || null,
          implementation_authorized: Boolean(row.implementationAuthorized)
        })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapRegressionRow(data);
    },
    async updateRegression(id, patch) {
      const payload = { updated_at: new Date().toISOString() };
      if (patch.status != null) payload.status = patch.status;
      if (patch.spec != null) payload.spec = patch.spec;
      if (patch.markdown != null) payload.markdown = patch.markdown;
      if (patch.reviewerUserId != null) payload.reviewer_user_id = patch.reviewerUserId;
      if (patch.riskLevel != null) payload.risk_level = patch.riskLevel;
      if (patch.approvedAt != null) payload.approved_at = patch.approvedAt;
      if (patch.implementationAuthorized != null) {
        payload.implementation_authorized = Boolean(patch.implementationAuthorized);
      }
      const { data, error } = await supabase
        .from("ai_quality_regression_candidates")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapRegressionRow(data);
    },
    async listRegressions({ organizationId = null } = {}) {
      let query = supabase
        .from("ai_quality_regression_candidates")
        .select("*")
        .order("created_at", { ascending: false });
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      const { data, error } = await query;
      if (error) {
        if (isTableMissing(error)) {
          return [];
        }
        throw error;
      }
      return (data || []).map(mapRegressionRow);
    },
    async getRegression(id) {
      const { data, error } = await supabase
        .from("ai_quality_regression_candidates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapRegressionRow(data);
    },
    async getRegressionByCase(caseId) {
      const { data, error } = await supabase
        .from("ai_quality_regression_candidates")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapRegressionRow(data);
    },
    async upsertProposal(row) {
      const payload = {
        id: row.id,
        organization_id: row.organizationId,
        case_id: row.caseId,
        status: row.status,
        proposal: row.proposal,
        risk_level: row.riskLevel,
        confidence: row.confidence,
        recommended_action: row.recommendedAction,
        generated_by: row.generatedBy || "atlas_deterministic",
        created_by_user_id: row.createdByUserId || null,
        updated_at: row.updatedAt || new Date().toISOString()
      };
      const { data, error } = await supabase
        .from("ai_quality_learning_proposals")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapProposalRow(data);
    },
    async updateProposal(id, patch) {
      const payload = { updated_at: new Date().toISOString() };
      if (patch.status != null) payload.status = patch.status;
      if (patch.proposal != null) payload.proposal = patch.proposal;
      const { data, error } = await supabase
        .from("ai_quality_learning_proposals")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapProposalRow(data);
    },
    async getProposal(id) {
      const { data, error } = await supabase
        .from("ai_quality_learning_proposals")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapProposalRow(data);
    },
    async getProposalByCase(caseId) {
      const { data, error } = await supabase
        .from("ai_quality_learning_proposals")
        .select("*")
        .eq("case_id", caseId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapProposalRow(data);
    },
    async listProposals({ organizationId = null } = {}) {
      let query = supabase.from("ai_quality_learning_proposals").select("*").order("updated_at", { ascending: false });
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      const { data, error } = await query;
      if (error) {
        if (isTableMissing(error)) {
          return [];
        }
        throw error;
      }
      return (data || []).map(mapProposalRow);
    },
    async upsertImplementation(row) {
      const payload = {
        id: row.id,
        organization_id: row.organizationId,
        case_id: row.caseId,
        regression_id: row.regressionId,
        proposal_id: row.proposalId,
        status: row.status,
        spec: row.spec,
        markdown: row.markdown,
        authorized_by_user_id: row.authorizedByUserId || null,
        authorized_at: row.authorizedAt || null,
        mutates_source_code: false,
        mutates_tests: false,
        linked_br: row.linkedBr || null,
        linked_pr: row.linkedPr || null,
        updated_at: row.updatedAt || new Date().toISOString()
      };
      const { data, error } = await supabase
        .from("ai_quality_implementation_proposals")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapImplementationRow(data);
    },
    async updateImplementation(id, patch) {
      const payload = { updated_at: new Date().toISOString() };
      if (patch.status != null) payload.status = patch.status;
      if (patch.spec != null) payload.spec = patch.spec;
      if (patch.markdown != null) payload.markdown = patch.markdown;
      if (patch.authorizedByUserId != null) payload.authorized_by_user_id = patch.authorizedByUserId;
      if (patch.authorizedAt != null) payload.authorized_at = patch.authorizedAt;
      if (patch.linkedBr != null) payload.linked_br = patch.linkedBr;
      if (patch.linkedPr != null) payload.linked_pr = patch.linkedPr;
      payload.mutates_source_code = false;
      payload.mutates_tests = false;
      const { data, error } = await supabase
        .from("ai_quality_implementation_proposals")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapImplementationRow(data);
    },
    async getImplementationByCase(caseId) {
      const { data, error } = await supabase
        .from("ai_quality_implementation_proposals")
        .select("*")
        .eq("case_id", caseId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapImplementationRow(data);
    },
    async listImplementations({ organizationId = null } = {}) {
      let query = supabase
        .from("ai_quality_implementation_proposals")
        .select("*")
        .order("updated_at", { ascending: false });
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      const { data, error } = await query;
      if (error) {
        if (isTableMissing(error)) {
          return [];
        }
        throw error;
      }
      return (data || []).map(mapImplementationRow);
    },
    async insertLearningAction(row) {
      const payload = {
        id: row.id,
        organization_id: row.organizationId,
        case_id: row.caseId || null,
        proposal_id: row.proposalId || null,
        regression_id: row.regressionId || null,
        implementation_id: row.implementationId || null,
        action: row.action,
        actor_user_id: row.actorUserId || null,
        result: row.result || "success",
        metadata: row.metadata || {},
        created_at: row.createdAt || new Date().toISOString()
      };
      const { data, error } = await supabase.from("ai_quality_learning_actions").insert(payload).select("*").single();
      if (error) {
        if (isTableMissing(error)) {
          return row;
        }
        throw error;
      }
      return {
        id: data.id,
        organizationId: data.organization_id,
        caseId: data.case_id,
        proposalId: data.proposal_id,
        regressionId: data.regression_id,
        implementationId: data.implementation_id,
        action: data.action,
        actorUserId: data.actor_user_id,
        result: data.result,
        metadata: data.metadata,
        createdAt: data.created_at
      };
    },
    async listLearningActions({ organizationId = null, caseId = null } = {}) {
      let query = supabase.from("ai_quality_learning_actions").select("*").order("created_at", { ascending: false });
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      if (caseId) {
        query = query.eq("case_id", caseId);
      }
      const { data, error } = await query;
      if (error) {
        if (isTableMissing(error)) {
          return [];
        }
        throw error;
      }
      return (data || []).map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        caseId: row.case_id,
        proposalId: row.proposal_id,
        regressionId: row.regression_id,
        implementationId: row.implementation_id,
        action: row.action,
        actorUserId: row.actor_user_id,
        result: row.result,
        metadata: row.metadata,
        createdAt: row.created_at
      }));
    }
  };
}

module.exports = {
  createSupabaseStore,
  mapCaseRow,
  isTableMissing
};
