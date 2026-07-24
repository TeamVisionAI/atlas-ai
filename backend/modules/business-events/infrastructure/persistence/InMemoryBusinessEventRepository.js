/**
 * Sprint 14.2 — In-memory Business Event store (dev / verification fallback).
 */

const { fromRow, toInsertRow } = require("./BusinessEventMapper");

class InMemoryBusinessEventStore {
  constructor() {
    this.rows = [];
  }

  append(event) {
    const row = toInsertRow(event);
    this.rows.push({ ...row });
    return fromRow(row);
  }

  findById(id) {
    const row = this.rows.find((entry) => entry.id === id);
    return row ? fromRow(row) : null;
  }

  filterRows(predicate) {
    return this.rows.filter(predicate).map(fromRow);
  }

  search(filters = {}) {
    let results = [...this.rows];

    if (filters.prospectId) {
      results = results.filter((row) => row.prospect_id === filters.prospectId);
    }

    if (filters.eventType) {
      results = results.filter((row) => row.event_type === filters.eventType);
    }

    if (filters.correlationId) {
      results = results.filter((row) => row.correlation_id === filters.correlationId);
    }

    if (filters.from) {
      results = results.filter((row) => new Date(row.timestamp) >= new Date(filters.from));
    }

    if (filters.to) {
      results = results.filter((row) => new Date(row.timestamp) <= new Date(filters.to));
    }

    if (filters.organizationId) {
      results = results.filter((row) => row.organization_id === filters.organizationId);
    }

    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = results.length;
    const limit = Math.min(Number(filters.limit) || 50, 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const slice = results.slice(offset, offset + limit).map(fromRow);

    return { items: slice, total };
  }
}

module.exports = {
  InMemoryBusinessEventStore
};
