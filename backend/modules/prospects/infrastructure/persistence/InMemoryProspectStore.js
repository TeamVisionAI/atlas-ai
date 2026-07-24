/**
 * Sprint 14.1 — In-memory persistence (dev / verification fallback).
 */

const { fromRow, toInsertRow, toUpdateRow } = require("./ProspectMapper");

class InMemoryProspectStore {
  constructor() {
    this.rows = new Map();
  }

  insert(prospect) {
    const row = toInsertRow(prospect);
    this.rows.set(row.id, { ...row });
    return fromRow(this.rows.get(row.id));
  }

  save(prospect) {
    const row = toUpdateRow(prospect);
    const existing = this.rows.get(prospect.prospectId);

    if (!existing || existing.deleted_at) {
      return null;
    }

    const next = { ...existing, ...row, id: prospect.prospectId };
    this.rows.set(prospect.prospectId, next);
    return fromRow(next);
  }

  getById(id) {
    return this.rows.get(id) || null;
  }

  findActiveById(id) {
    const row = this.getById(id);

    if (!row || row.deleted_at) {
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

  search({ q, lifecycleState, limit = 50, offset = 0, organizationId }) {
    let results = [...this.rows.values()].filter((row) => !row.deleted_at);

    if (organizationId) {
      results = results.filter((row) => row.organization_id === organizationId);
    }

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
