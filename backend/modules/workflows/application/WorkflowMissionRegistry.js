/**
 * Sprint 12.2 Phase 3 — In-memory mission intent registry (foundation only).
 * Future phases can replace with durable storage without changing the engine contract.
 */

class WorkflowMissionRegistry {
  constructor() {
    this.byProspect = new Map();
    this.byEvent = new Map();
  }

  upsertFromEvent(businessEvent, missionDefinitions = []) {
    const prospectKey = this.resolveProspectKey(businessEvent);

    if (!prospectKey) {
      return [];
    }

    const existing = this.byProspect.get(prospectKey) || new Map();

    missionDefinitions.forEach((mission) => {
      existing.set(mission.missionType, mission);
    });

    this.byProspect.set(prospectKey, existing);

    if (businessEvent?.eventId) {
      this.byEvent.set(businessEvent.eventId, missionDefinitions);
    }

    return missionDefinitions;
  }

  getMissionDefinitionsForProspect(prospectKey) {
    const missions = this.byProspect.get(prospectKey);

    if (!missions) {
      return [];
    }

    return Array.from(missions.values());
  }

  getMissionDefinitionsForEvent(eventId) {
    return this.byEvent.get(eventId) || [];
  }

  clear() {
    this.byProspect.clear();
    this.byEvent.clear();
  }

  resolveProspectKey(businessEvent = {}) {
    return (
      businessEvent.payload?.prospectPhone ||
      businessEvent.payload?.phone ||
      businessEvent.prospectId ||
      null
    );
  }
}

module.exports = {
  WorkflowMissionRegistry
};
