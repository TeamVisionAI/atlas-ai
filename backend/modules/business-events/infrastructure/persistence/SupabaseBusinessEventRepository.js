/**
 * Sprint 14.2 — Business Event repository (Supabase + in-memory fallback).
 */

const { supabase } = require("../../../../services/supabaseService");
const { TABLE_NAME, fromRow, toInsertRow } = require("./BusinessEventMapper");
const { InMemoryBusinessEventStore } = require("./InMemoryBusinessEventRepository");

function isMissingEventTable(error) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    String(error.message || "").includes(TABLE_NAME) ||
    String(error.message || "").includes("does not exist")
  );
}

class SupabaseBusinessEventRepository {
  constructor() {
    this.memory = new InMemoryBusinessEventStore();
    this.useMemory = false;
  }

  async append(event) {
    const row = toInsertRow(event);

    if (this.useMemory) {
      return this.memory.append(event);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (isMissingEventTable(error)) {
        this.useMemory = true;
        return this.memory.append(event);
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
      if (isMissingEventTable(error)) {
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

  async findByType(eventType, filters = {}) {
    return this.search({ ...filters, eventType });
  }

  async findByCorrelationId(correlationId, filters = {}) {
    return this.search({ ...filters, correlationId });
  }

  async findBetweenDates(from, to, filters = {}) {
    return this.search({ ...filters, from, to });
  }

  async search(filters = {}) {
    const limit = Math.min(Number(filters.limit) || 50, 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    if (this.useMemory) {
      return this.memory.search({ ...filters, limit, offset });
    }

    let query = supabase
      .from(TABLE_NAME)
      .select("*", { count: "exact" })
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.prospectId) {
      query = query.eq("prospect_id", filters.prospectId);
    }

    if (filters.eventType) {
      query = query.eq("event_type", filters.eventType);
    }

    if (filters.correlationId) {
      query = query.eq("correlation_id", filters.correlationId);
    }

    if (filters.organizationId) {
      query = query.eq("organization_id", filters.organizationId);
    }

    if (filters.from) {
      query = query.gte("timestamp", filters.from);
    }

    if (filters.to) {
      query = query.lte("timestamp", filters.to);
    }

    const { data, error, count } = await query;

    if (error) {
      if (isMissingEventTable(error)) {
        this.useMemory = true;
        return this.search(filters);
      }

      throw error;
    }

    return {
      items: (data || []).map(fromRow),
      total: count ?? (data || []).length
    };
  }
}

module.exports = {
  SupabaseBusinessEventRepository,
  InMemoryBusinessEventStore
};
