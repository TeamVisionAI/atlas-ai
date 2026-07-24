/**
 * Sprint 14.1 — Prospect repository (infrastructure).
 * Implements domain repository port — persistence only, no business logic.
 */

const { supabase } = require("../../../../services/supabaseService");
const { TABLE_NAME } = require("../../domain/constants");
const { PhoneNumber } = require("../../domain/value-objects/PhoneNumber");
const { fromRow, toInsertRow, toUpdateRow } = require("./ProspectMapper");
const { InMemoryProspectStore } = require("./InMemoryProspectStore");

function isMissingProspectTable(error) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    String(error.message || "").includes(TABLE_NAME) ||
    String(error.message || "").includes("does not exist")
  );
}

class ProspectRepository {
  constructor() {
    this.memory = new InMemoryProspectStore();
    this.useMemory = false;
  }

  async create(prospect) {
    const row = toInsertRow(prospect);

    if (this.useMemory) {
      return this.memory.insert(prospect);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (isMissingProspectTable(error)) {
        this.useMemory = true;
        return this.memory.insert(prospect);
      }

      throw error;
    }

    return fromRow(data);
  }

  async save(prospect) {
    const row = toUpdateRow(prospect);

    if (this.useMemory) {
      return this.memory.save(prospect);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(row)
      .eq("id", prospect.prospectId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isMissingProspectTable(error)) {
        this.useMemory = true;
        return this.memory.save(prospect);
      }

      throw error;
    }

    return fromRow(data);
  }

  async findById(id, { includeDeleted = false } = {}) {
    if (this.useMemory) {
      const row = includeDeleted ? this.memory.getById(id) : this.memory.findActiveById(id);
      return row ? fromRow(row) : null;
    }

    let query = supabase.from(TABLE_NAME).select("*").eq("id", id);

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (isMissingProspectTable(error)) {
        this.useMemory = true;
        return this.findById(id, { includeDeleted });
      }

      throw error;
    }

    return fromRow(data);
  }

  async findByEmail(email) {
    if (!email) {
      return null;
    }

    const normalized = String(email).trim().toLowerCase();

    if (this.useMemory) {
      const row = this.memory.findByEmail(normalized);
      return row ? fromRow(row) : null;
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .eq("email", normalized)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      if (isMissingProspectTable(error)) {
        this.useMemory = true;
        return this.findByEmail(email);
      }

      throw error;
    }

    return fromRow(data);
  }

  async findByPhone(phone) {
    const normalized = PhoneNumber.normalize(phone);

    if (!normalized) {
      return null;
    }

    if (this.useMemory) {
      const row = this.memory.findByPhone(normalized);
      return row ? fromRow(row) : null;
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .eq("normalized_primary_phone", normalized)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      if (isMissingProspectTable(error)) {
        this.useMemory = true;
        return this.findByPhone(phone);
      }

      throw error;
    }

    return fromRow(data);
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
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.organizationId) {
      query = query.eq("organization_id", filters.organizationId);
    }

    if (filters.lifecycleState) {
      query = query.eq("lifecycle_state", filters.lifecycleState);
    }

    if (filters.q) {
      const needle = `%${String(filters.q).trim()}%`;
      query = query.or(
        `display_name.ilike.${needle},email.ilike.${needle},primary_phone.ilike.${needle}`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      if (isMissingProspectTable(error)) {
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

  /** @deprecated Use application service + aggregate.save — kept for compatibility. */
  async update(_id, _patch) {
    throw new Error("Use ProspectApplicationService.updateProspect — repository.update is deprecated.");
  }

  /** @deprecated */
  async archive(id) {
    const prospect = await this.findById(id);

    if (!prospect) {
      return null;
    }

    prospect.archive();
    return this.save(prospect);
  }

  /** @deprecated */
  async restore(id) {
    const prospect = await this.findById(id);

    if (!prospect) {
      return null;
    }

    prospect.restore();
    return this.save(prospect);
  }

  /** @deprecated */
  async assign(id, assignment) {
    const prospect = await this.findById(id);

    if (!prospect) {
      return null;
    }

    prospect.assign(assignment, assignment.assignedBy);
    return this.save(prospect);
  }

  /** @deprecated */
  async merge(survivorId, mergedId) {
    const merged = await this.findById(mergedId);

    if (!merged) {
      return null;
    }

    merged.markMergedInto(survivorId);
    return this.save(merged);
  }
}

module.exports = {
  ProspectRepository,
  InMemoryProspectStore
};
