/**
 * Sprint 14.3 — Timeline repository (Supabase + in-memory fallback).
 */

const { supabase } = require("../../../../services/supabaseService");
const { TABLE_NAME, fromRow, toInsertRow } = require("./TimelineMapper");
const { InMemoryTimelineStore } = require("./InMemoryTimelineStore");

function isMissingTimelineTable(error) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    String(error.message || "").includes(TABLE_NAME) ||
    String(error.message || "").includes("does not exist")
  );
}

class TimelineRepository {
  constructor() {
    this.memory = new InMemoryTimelineStore();
    this.useMemory = false;
  }

  async append(entry) {
    const row = toInsertRow(entry);

    if (this.useMemory) {
      return this.memory.append(entry);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return this.findById(entry.toJSON().entryId);
      }

      if (isMissingTimelineTable(error)) {
        this.useMemory = true;
        return this.memory.append(entry);
      }

      throw error;
    }

    return fromRow(data);
  }

  async findById(id) {
    if (this.useMemory) {
      return this.memory.findById(id);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      if (isMissingTimelineTable(error)) {
        this.useMemory = true;
        return this.findById(id);
      }

      throw error;
    }

    return fromRow(data);
  }

  async findByProspect(prospectId, filters = {}) {
    return this.search({ ...filters, prospectId });
  }

  async findLatest(prospectId) {
    const result = await this.search({ prospectId, limit: 1, offset: 0 });
    return result.items[0] || null;
  }

  async search(filters = {}) {
    return this.paginate(filters);
  }

  async paginate(filters = {}) {
    const limit = Math.min(Number(filters.limit) || 50, 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    if (this.useMemory) {
      return this.memory.filterAndPaginate({ ...filters, limit, offset });
    }

    let query = supabase
      .from(TABLE_NAME)
      .select("*", { count: "exact" })
      .order("timestamp", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.prospectId) {
      query = query.eq("prospect_id", filters.prospectId);
    }

    if (filters.entryType) {
      query = query.eq("entry_type", filters.entryType);
    }

    if (filters.eventType) {
      query = query.eq("event_type", filters.eventType);
    }

    if (filters.organizationId) {
      query = query.eq("organization_id", filters.organizationId);
    }

    if (filters.q) {
      const needle = `%${String(filters.q).trim()}%`;
      query = query.or(`summary.ilike.${needle},event_type.ilike.${needle}`);
    }

    const { data, error, count } = await query;

    if (error) {
      if (isMissingTimelineTable(error)) {
        this.useMemory = true;
        return this.paginate(filters);
      }

      throw error;
    }

    return {
      items: (data || []).map(fromRow),
      total: count ?? (data || []).length,
      limit,
      offset
    };
  }
}

module.exports = {
  TimelineRepository,
  InMemoryTimelineStore
};
