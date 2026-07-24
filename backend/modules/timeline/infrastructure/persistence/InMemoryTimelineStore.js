/**
 * Sprint 14.3 — In-memory timeline store (dev / verification fallback).
 */

const { fromRow, toInsertRow } = require("./TimelineMapper");

class InMemoryTimelineStore {
  constructor() {
    this.rows = [];
  }

  append(entry) {
    const row = toInsertRow(entry);
    const existing = this.rows.find((item) => item.id === row.id);

    if (existing) {
      return fromRow(existing);
    }

    this.rows.push({ ...row });
    return fromRow(row);
  }

  findById(id) {
    const row = this.rows.find((item) => item.id === id);
    return row ? fromRow(row) : null;
  }

  filterAndPaginate(filters = {}) {
    let results = [...this.rows];

    if (filters.prospectId) {
      results = results.filter((row) => row.prospect_id === filters.prospectId);
    }

    if (filters.entryType) {
      results = results.filter((row) => row.entry_type === filters.entryType);
    }

    if (filters.eventType) {
      results = results.filter((row) => row.event_type === filters.eventType);
    }

    if (filters.organizationId) {
      results = results.filter((row) => row.organization_id === filters.organizationId);
    }

    if (filters.q) {
      const needle = String(filters.q).trim().toLowerCase();
      results = results.filter(
        (row) =>
          (row.summary && row.summary.toLowerCase().includes(needle)) ||
          (row.event_type && row.event_type.toLowerCase().includes(needle))
      );
    }

    results.sort((a, b) => {
      const timeDiff = new Date(b.timestamp) - new Date(a.timestamp);

      if (timeDiff !== 0) {
        return timeDiff;
      }

      return String(b.id).localeCompare(String(a.id));
    });

    const total = results.length;
    const limit = Math.min(Number(filters.limit) || 50, 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const items = results.slice(offset, offset + limit).map(fromRow);

    return { items, total, limit, offset };
  }
}

module.exports = {
  InMemoryTimelineStore
};
