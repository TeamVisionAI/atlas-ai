/**
 * Recruit AI v2 — durable context repository.
 * In-memory adapter for tests; Supabase adapter for production service-role access.
 * Tenant isolation is enforced in the service layer (org + prospect scope).
 */

const { randomUUID } = require("node:crypto");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryContextRepository(seed = []) {
  const rows = seed.map((row) => clone(row));

  function findActive({ organizationId, prospectId, channel }) {
    return (
      rows.find(
        (row) =>
          row.organization_id === organizationId &&
          row.prospect_id === prospectId &&
          row.channel === channel &&
          !row.archived_at
      ) || null
    );
  }

  return {
    kind: "memory",

    async insert(row) {
      const existing = findActive({
        organizationId: row.organization_id,
        prospectId: row.prospect_id,
        channel: row.channel || "whatsapp"
      });
      if (existing) {
        const error = new Error("Active context already exists");
        error.code = "CONTEXT_UNIQUE_VIOLATION";
        error.statusCode = 409;
        throw error;
      }

      const created = {
        id: row.id || randomUUID(),
        organization_id: row.organization_id,
        prospect_id: row.prospect_id,
        channel: row.channel || "whatsapp",
        context_json: clone(row.context_json || {}),
        context_version: row.context_version || 1,
        schema_version: row.schema_version || 1,
        conversation_version: row.conversation_version || 1,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        last_inbound_message_id: row.last_inbound_message_id || null,
        last_processed_message_id: row.last_processed_message_id || null,
        last_decision_code: row.last_decision_code || null,
        last_language: row.last_language || null,
        needs_human_attention: Boolean(row.needs_human_attention),
        archived_at: row.archived_at || null,
        source: row.source || "v2"
      };
      rows.push(created);
      return clone(created);
    },

    async findActiveByScope({ organizationId, prospectId, channel = "whatsapp" }) {
      const found = findActive({ organizationId, prospectId, channel });
      return found ? clone(found) : null;
    },

    async findById({ organizationId, id }) {
      const found = rows.find(
        (row) => row.id === id && row.organization_id === organizationId
      );
      return found ? clone(found) : null;
    },

    async compareAndUpdate({
      organizationId,
      id,
      expectedVersion,
      patch
    }) {
      const idx = rows.findIndex(
        (row) => row.id === id && row.organization_id === organizationId
      );
      if (idx < 0) {
        return { ok: false, code: "CONTEXT_NOT_FOUND", row: null };
      }

      const current = rows[idx];
      if (current.archived_at) {
        return { ok: false, code: "CONTEXT_ARCHIVED", row: clone(current) };
      }

      if (Number(current.context_version) !== Number(expectedVersion)) {
        return { ok: false, code: "CONTEXT_VERSION_CONFLICT", row: clone(current) };
      }

      const next = {
        ...current,
        ...patch,
        context_json: clone(patch.context_json ?? current.context_json),
        context_version: Number(current.context_version) + 1,
        updated_at: new Date().toISOString()
      };
      rows[idx] = next;
      return { ok: true, code: null, row: clone(next) };
    },

    async archive({ organizationId, id, archivedAt = new Date().toISOString() }) {
      const idx = rows.findIndex(
        (row) => row.id === id && row.organization_id === organizationId
      );
      if (idx < 0) {
        return null;
      }
      rows[idx] = {
        ...rows[idx],
        archived_at: archivedAt,
        updated_at: new Date().toISOString()
      };
      return clone(rows[idx]);
    },

    async listRecent({ organizationId, prospectId = null, limit = 20 }) {
      return rows
        .filter((row) => {
          if (row.organization_id !== organizationId) {
            return false;
          }
          if (prospectId && row.prospect_id !== prospectId) {
            return false;
          }
          return true;
        })
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, limit)
        .map(clone);
    },

    /** Test helper */
    _all() {
      return rows.map(clone);
    }
  };
}

function createSupabaseContextRepository(supabaseClient) {
  if (!supabaseClient) {
    throw new Error("supabaseClient is required");
  }

  return {
    kind: "supabase",

    async insert(row) {
      const { data, error } = await supabaseClient
        .from("recruit_ai_conversation_contexts")
        .insert(row)
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          const conflict = new Error("Active context already exists");
          conflict.code = "CONTEXT_UNIQUE_VIOLATION";
          conflict.statusCode = 409;
          throw conflict;
        }
        throw error;
      }

      return data;
    },

    async findActiveByScope({ organizationId, prospectId, channel = "whatsapp" }) {
      const { data, error } = await supabaseClient
        .from("recruit_ai_conversation_contexts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("prospect_id", prospectId)
        .eq("channel", channel)
        .is("archived_at", null)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data || null;
    },

    async findById({ organizationId, id }) {
      const { data, error } = await supabaseClient
        .from("recruit_ai_conversation_contexts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data || null;
    },

    async compareAndUpdate({ organizationId, id, expectedVersion, patch }) {
      const { data, error } = await supabaseClient
        .from("recruit_ai_conversation_contexts")
        .update({
          ...patch,
          context_version: Number(expectedVersion) + 1,
          updated_at: new Date().toISOString()
        })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .eq("context_version", expectedVersion)
        .is("archived_at", null)
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        const current = await this.findById({ organizationId, id });
        if (!current) {
          return { ok: false, code: "CONTEXT_NOT_FOUND", row: null };
        }
        if (current.archived_at) {
          return { ok: false, code: "CONTEXT_ARCHIVED", row: current };
        }
        return { ok: false, code: "CONTEXT_VERSION_CONFLICT", row: current };
      }

      return { ok: true, code: null, row: data };
    },

    async archive({ organizationId, id, archivedAt = new Date().toISOString() }) {
      const { data, error } = await supabaseClient
        .from("recruit_ai_conversation_contexts")
        .update({
          archived_at: archivedAt,
          updated_at: new Date().toISOString()
        })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data || null;
    },

    async listRecent({ organizationId, prospectId = null, limit = 20 }) {
      let query = supabaseClient
        .from("recruit_ai_conversation_contexts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (prospectId) {
        query = query.eq("prospect_id", prospectId);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }
      return data || [];
    }
  };
}

module.exports = {
  createMemoryContextRepository,
  createSupabaseContextRepository
};
