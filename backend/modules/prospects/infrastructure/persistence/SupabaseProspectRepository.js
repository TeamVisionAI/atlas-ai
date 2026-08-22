/**
 * Sprint 14.1 — Prospect repository (infrastructure).
 * Implements domain repository port — persistence only, no business logic.
 */

const { supabase } = require("../../../../services/supabaseService");
const { TABLE_NAME } = require("../../domain/constants");
const { PhoneNumber } = require("../../domain/value-objects/PhoneNumber");
const { fromRow, toInsertRow, toUpdateRow } = require("./ProspectMapper");
const { InMemoryProspectStore } = require("./InMemoryProspectStore");
const { forbidProductionInMemoryFallback } = require("../../../../core/productionReadinessValidator");
const { ProspectDomainError } = require("../../domain/errors/ProspectDomainError");

function assertOrganizationId(organizationId) {
  if (!organizationId) {
    throw new ProspectDomainError("Organization context is required.", {
      statusCode: 400,
      publicCode: "ORGANIZATION_REQUIRED"
    });
  }
}

function assertProspectOrganization(prospect, organizationId) {
  const prospectOrg = prospect.toJSON?.().organizationId ?? prospect.organizationId;

  if (!prospectOrg || String(prospectOrg) !== String(organizationId)) {
    throw new ProspectDomainError("Prospect organizationId must match tenant organizationId.", {
      statusCode: 400,
      publicCode: "ORGANIZATION_MISMATCH"
    });
  }
}

function activateMemoryFallback(repository) {
  forbidProductionInMemoryFallback("ProspectRepository");
  repository.useMemory = true;
}

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

  async create(prospect, organizationId) {
    assertOrganizationId(organizationId);
    assertProspectOrganization(prospect, organizationId);

    const row = toInsertRow(prospect);

    if (this.useMemory) {
      return this.memory.insert(prospect, organizationId);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (isMissingProspectTable(error)) {
        forbidProductionInMemoryFallback("ProspectRepository");
        activateMemoryFallback(this);
        return this.memory.insert(prospect, organizationId);
      }

      throw error;
    }

    return fromRow(data);
  }

  async save(prospect, organizationId) {
    assertOrganizationId(organizationId);

    const prospectOrg = prospect.toJSON?.().organizationId ?? prospect.organizationId;

    if (!prospectOrg || String(prospectOrg) !== String(organizationId)) {
      return null;
    }

    const row = toUpdateRow(prospect);
    const prospectId = prospect.prospectId;

    console.log("[ProspectRepository.save] prospectId:", prospectId);
    console.log("[ProspectRepository.save] assigned_agent_id:", row.assigned_agent_id ?? null);
    console.log("[ProspectRepository.save] update payload:", JSON.stringify(row, null, 2));

    if (this.useMemory) {
      return this.memory.save(prospect, organizationId);
    }

    const response = await supabase
      .from(TABLE_NAME)
      .update(row)
      .eq("id", prospectId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();

    console.log(
      "[ProspectRepository.save] Supabase response:",
      JSON.stringify(
        {
          data: response.data,
          error: response.error,
          status: response.status,
          statusText: response.statusText,
          count: response.count
        },
        null,
        2
      )
    );

    if (response.error) {
      if (isMissingProspectTable(response.error)) {
        activateMemoryFallback(this);
        return this.memory.save(prospect, organizationId);
      }

      console.error(
        "[ProspectRepository.save] Supabase error:",
        response.error.code,
        response.error.message,
        response.error.details,
        response.error.hint
      );
      throw response.error;
    }

    if (!response.data) {
      const noRowError = new Error(
        `Prospect save returned no row for id=${prospectId}. The UPDATE matched 0 rows or the post-update SELECT returned nothing. assigned_agent_id=${row.assigned_agent_id ?? "null"}. This is not a suppressed repository error — inspect payload and Supabase response above.`
      );
      noRowError.code = "PROSPECT_SAVE_NO_ROW";
      noRowError.details = {
        prospectId,
        assignedAgentId: row.assigned_agent_id ?? null,
        payload: row,
        supabaseStatus: response.status
      };
      throw noRowError;
    }

    return fromRow(response.data);
  }

  async findById(id, organizationId, { includeDeleted = false } = {}) {
    if (!id || !organizationId) {
      return null;
    }

    if (this.useMemory) {
      const row = includeDeleted
        ? this.memory.getById(id)
        : this.memory.findActiveById(id, organizationId);

      if (!row || String(row.organization_id) !== String(organizationId)) {
        return null;
      }

      return fromRow(row);
    }

    let query = supabase
      .from(TABLE_NAME)
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (isMissingProspectTable(error)) {
        activateMemoryFallback(this);
        return this.findById(id, organizationId, { includeDeleted });
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
        activateMemoryFallback(this);
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
        activateMemoryFallback(this);
        return this.findByPhone(phone);
      }

      throw error;
    }

    return fromRow(data);
  }

  /**
   * BR-120 — list core prospects for a phone within one organization (fail-closed ambiguity).
   */
  async findAllByPhoneInOrganization(phone, organizationId) {
    const normalized = PhoneNumber.normalize(phone);

    if (!normalized || !organizationId) {
      return [];
    }

    if (this.useMemory) {
      return this.memory
        .findAllByPhoneInOrganization(normalized, organizationId)
        .map((row) => fromRow(row));
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .eq("normalized_primary_phone", normalized)
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    if (error) {
      if (isMissingProspectTable(error)) {
        activateMemoryFallback(this);
        return this.findAllByPhoneInOrganization(phone, organizationId);
      }

      throw error;
    }

    return (data || []).map((row) => fromRow(row));
  }

  /**
   * BR-120 — list core prospects for a phone across all orgs (mismatch detection only).
   */
  async findAllByPhone(phone) {
    const normalized = PhoneNumber.normalize(phone);

    if (!normalized) {
      return [];
    }

    if (this.useMemory) {
      return this.memory.findAllByPhone(normalized).map((row) => fromRow(row));
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .eq("normalized_primary_phone", normalized)
      .is("deleted_at", null);

    if (error) {
      if (isMissingProspectTable(error)) {
        activateMemoryFallback(this);
        return this.findAllByPhone(phone);
      }

      throw error;
    }

    return (data || []).map((row) => fromRow(row));
  }

  async search(filters = {}) {
    if (!filters.organizationId) {
      throw new ProspectDomainError("organizationId is required for prospect search.", {
        statusCode: 400,
        publicCode: "ORGANIZATION_REQUIRED"
      });
    }

    const limit = Math.min(Number(filters.limit) || 50, 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    if (this.useMemory) {
      return this.memory.search({ ...filters, limit, offset });
    }

    let query = supabase
      .from(TABLE_NAME)
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .eq("organization_id", filters.organizationId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.divisionId) {
      query = query.eq("assigned_division_id", filters.divisionId);
    }

    if (filters.ownerUserId) {
      query = query.or(
        `owner_user_id.eq.${filters.ownerUserId},assigned_agent_id.eq.${filters.ownerUserId}`
      );
    }

    if (Array.isArray(filters.ownerUserIds) && filters.ownerUserIds.length) {
      const clauses = filters.ownerUserIds.flatMap((id) => [
        `owner_user_id.eq.${id}`,
        `assigned_agent_id.eq.${id}`
      ]);
      query = query.or(clauses.join(","));
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
        activateMemoryFallback(this);
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
  async update(_id, _patch, _organizationId) {
    throw new Error("Use ProspectApplicationService.updateProspect — repository.update is deprecated.");
  }

  /** @deprecated */
  async archive(id, organizationId) {
    const prospect = await this.findById(id, organizationId);

    if (!prospect) {
      return null;
    }

    prospect.archive();
    return this.save(prospect, organizationId);
  }

  /** @deprecated */
  async restore(id, organizationId) {
    const prospect = await this.findById(id, organizationId);

    if (!prospect) {
      return null;
    }

    prospect.restore();
    return this.save(prospect, organizationId);
  }

  /** @deprecated */
  async assign(id, organizationId, assignment) {
    const prospect = await this.findById(id, organizationId);

    if (!prospect) {
      return null;
    }

    prospect.assign(assignment, assignment.assignedBy);
    return this.save(prospect, organizationId);
  }

  /** @deprecated */
  async merge(survivorId, mergedId, organizationId) {
    const merged = await this.findById(mergedId, organizationId);

    if (!merged) {
      return null;
    }

    merged.markMergedInto(survivorId);
    return this.save(merged, organizationId);
  }
}

module.exports = {
  ProspectRepository,
  InMemoryProspectStore
};
