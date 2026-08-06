/**
 * Recruit AI v2 — shadow evaluation ledger repository.
 * Writes sanitized comparison rows only. Implements BR-081 Phase 3.
 */

const { randomUUID } = require("node:crypto");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryShadowEvaluationRepository(seed = []) {
  const rows = seed.map((row) => clone(row));

  return {
    kind: "memory",

    async insert(row) {
      const created = {
        id: row.id || randomUUID(),
        organization_id: row.organization_id,
        prospect_id: row.prospect_id,
        channel: row.channel || "whatsapp",
        context_id: row.context_id || null,
        inbound_message_id: row.inbound_message_id || null,
        live_ce_response_intent: row.live_ce_response_intent || null,
        v2_interpreted_intent: row.v2_interpreted_intent || null,
        v2_decision_code: row.v2_decision_code || null,
        v2_confidence:
          row.v2_confidence == null || Number.isNaN(Number(row.v2_confidence))
            ? null
            : Number(row.v2_confidence),
        v2_proposed_side_effect: row.v2_proposed_side_effect || null,
        divergence_classification: row.divergence_classification || null,
        language_agreement:
          row.language_agreement == null ? null : Boolean(row.language_agreement),
        diagnostic_leak_check:
          row.diagnostic_leak_check == null
            ? null
            : Boolean(row.diagnostic_leak_check),
        metadata: clone(row.metadata || {}),
        created_at: row.created_at || new Date().toISOString()
      };
      rows.push(created);
      return clone(created);
    },

    async listRecent({ organizationId, limit = 20 } = {}) {
      return rows
        .filter((row) => row.organization_id === organizationId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit)
        .map(clone);
    },

    _all() {
      return rows.map(clone);
    }
  };
}

function createSupabaseShadowEvaluationRepository(supabaseClient) {
  if (!supabaseClient) {
    throw new Error("supabaseClient is required");
  }

  return {
    kind: "supabase",

    async insert(row) {
      const { data, error } = await supabaseClient
        .from("recruit_ai_v2_shadow_evaluations")
        .insert(row)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async listRecent({ organizationId, limit = 20 } = {}) {
      const { data, error } = await supabaseClient
        .from("recruit_ai_v2_shadow_evaluations")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    }
  };
}

module.exports = {
  createMemoryShadowEvaluationRepository,
  createSupabaseShadowEvaluationRepository
};
