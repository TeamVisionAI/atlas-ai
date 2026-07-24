/**
 * Sprint 15.1 — In-memory Executive Dashboard store.
 */

const { ExecutiveDashboardReadModel } = require("../domain/ExecutiveDashboardReadModel");
const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");

class InMemoryExecutiveDashboardStore {
  constructor() {
    this.states = new Map();
    this.processedEvents = new Set();
  }

  loadReadModel(organizationId = DEFAULT_ORGANIZATION_ID) {
    const existing = this.states.get(organizationId);

    if (!existing) {
      const empty = ExecutiveDashboardReadModel.empty(organizationId);
      this.states.set(organizationId, empty);
      return empty;
    }

    return ExecutiveDashboardReadModel.fromSnapshot(existing.toJSON());
  }

  saveReadModel(readModel) {
    this.states.set(
      readModel.organizationId,
      ExecutiveDashboardReadModel.fromSnapshot(readModel.toJSON())
    );
    return readModel;
  }

  isEventProcessed(eventId) {
    return this.processedEvents.has(eventId);
  }

  markEventProcessed(eventId) {
    this.processedEvents.add(eventId);
  }

  clear() {
    this.states.clear();
    this.processedEvents.clear();
  }
}

module.exports = {
  InMemoryExecutiveDashboardStore
};
