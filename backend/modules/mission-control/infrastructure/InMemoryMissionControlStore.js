/**
 * Sprint 15.0 — In-memory Mission Control store (dev / missing-table fallback).
 */

const { MissionControlReadModel } = require("../domain/MissionControlReadModel");
const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");

class InMemoryMissionControlStore {
  constructor() {
    this.states = new Map();
    this.processedEvents = new Set();
  }

  loadReadModel(organizationId = DEFAULT_ORGANIZATION_ID) {
    const existing = this.states.get(organizationId);

    if (!existing) {
      const empty = MissionControlReadModel.empty(organizationId);
      this.states.set(organizationId, empty);
      return empty;
    }

    return MissionControlReadModel.fromSnapshot(existing.toJSON());
  }

  saveReadModel(readModel) {
    this.states.set(readModel.organizationId, MissionControlReadModel.fromSnapshot(readModel.toJSON()));
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
  InMemoryMissionControlStore
};
