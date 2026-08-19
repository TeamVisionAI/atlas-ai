/**
 * Sprint 14.1 — In-memory persistence (dev / verification fallback).
 */

const { fromRow, toInsertRow, toUpdateRow } = require("./ProspectMapper");

function sameOrganization(storedOrgId, organizationId) {
  return String(storedOrgId) === String(organizationId);
}

class InMemoryProspectStore {
  constructor() {
    this.rows = new Map();
  }

  insert(prospect, organizationId) {
    const row = toInsertRow(prospect);

    if (!sameOrganization(row.organization_id, organizationId)) {
      throw new Error("Prospect organizationId must match create organizationId.");
    }

    this.rows.set(row.id, { ...row });
    return fromRow(this.rows.get(row.id));
  }

  save(prospect, organizationId) {
    const row = toUpdateRow(prospect);
    const existing = this.rows.get(prospect.prospectId);

    if (!existing || existing.deleted_at) {
      return null;
    }

    if (!sameOrganization(existing.organization_id, organizationId)) {
      return null;
    }

    const next = { ...existing, ...row, id: prospect.prospectId, organization_id: existing.organization_id };
    this.rows.set(prospect.prospectId, next);
    return fromRow(next);
  }

  getById(id) {
    return this.rows.get(id) || null;
  }

  findActiveById(id, organizationId) {
    const row = this.getById(id);

    if (!row || row.deleted_at) {
      return null;
    }

    if (!organizationId || !sameOrganization(row.organization_id, organizationId)) {
      return null;
    }

    return row;
  }

  findByEmail(email) {
    if (!email) {
      return null;
    }

    const target = String(email).trim().toLowerCase();

    for (const row of this.rows.values()) {
      if (row.deleted_at) {
        continue;
      }

      if (row.email && row.email.toLowerCase() === target) {
        return row;
      }
    }

    return null;
  }

  findByPhone(normalizedPhone) {
    if (!normalizedPhone) {
      return null;
    }

    for (const row of this.rows.values()) {
      if (row.deleted_at) {
        continue;
      }

      if (row.normalized_primary_phone === normalizedPhone) {
        return row;
      }
    }

    return null;
  }

  findAllByPhone(normalizedPhone) {
    if (!normalizedPhone) {
      return [];
    }

    const matches = [];
    for (const row of this.rows.values()) {
      if (row.deleted_at) {
        continue;
      }
      if (row.normalized_primary_phone === normalizedPhone) {
        matches.push(row);
      }
    }
    return matches;
  }

  findAllByPhoneInOrganization(normalizedPhone, organizationId) {
    if (!normalizedPhone || !organizationId) {
      return [];
    }

    return this.findAllByPhone(normalizedPhone).filter(
      (row) => row.organization_id === organizationId
    );
  }

  search({ q, lifecycleState, limit = 50, offset = 0, organizationId }) {
    if (!organizationId) {
      throw new Error("organizationId is required for prospect search.");
    }

    let results = [...this.rows.values()].filter(
      (row) => !row.deleted_at && sameOrganization(row.organization_id, organizationId)
    );

    if (lifecycleState) {
      results = results.filter((row) => row.lifecycle_state === lifecycleState);
    }

    if (q) {
      const needle = String(q).trim().toLowerCase();

      results = results.filter((row) => {
        return (
          (row.display_name && row.display_name.toLowerCase().includes(needle)) ||
          (row.email && row.email.toLowerCase().includes(needle)) ||
          (row.primary_phone && row.primary_phone.includes(needle))
        );
      });
    }

    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = results.length;
    const slice = results.slice(offset, offset + limit).map(fromRow);

    return { items: slice, total };
  }
}

module.exports = {
  InMemoryProspectStore
};
