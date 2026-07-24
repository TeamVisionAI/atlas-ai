/**
 * Sprint 14.2 — Centralized Business Event creation.
 * All new events must be created through this factory — not BusinessEvent.create() directly.
 */

const { BusinessEvent } = require("../domain/BusinessEvent");
const { LEAD_EVENTS } = require("../domain/EventTypes");
const { normalizeForCreate } = require("../domain/EventVersion");

function buildMetadata(input = {}) {
  return {
    organizationId: input.organizationId,
    lifecycleStateAtEvent: input.lifecycleStateAtEvent ?? null,
    summary: input.summary ?? null,
    parentEventId: input.parentEventId ?? null,
    permissionContext: input.permissionContext ?? null
  };
}

function buildBase(input) {
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    timestamp: input.timestamp,
    prospectId: input.prospectId,
    actor: input.actor,
    channel: input.channel ?? null,
    payload: input.payload || {},
    version: normalizeForCreate(input.version),
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    metadata: buildMetadata(input.metadata || input),
    createdAt: input.createdAt
  };
}

class EventFactory {
  /**
   * Generic factory for non-prospect-specific events (connectors, system, etc.).
   * @param {Object} input
   * @returns {BusinessEvent}
   */
  static create(input) {
    return BusinessEvent.create(buildBase(input));
  }

  /**
   * @param {Object} input
   * @returns {BusinessEvent}
   */
  static fromEnvelope(input) {
    return EventFactory.create({
      eventType: input.eventType,
      prospectId: input.prospectId,
      actor: input.actor,
      channel: input.channel,
      payload: input.payload,
      version: input.version,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: {
        organizationId: input.organizationId,
        lifecycleStateAtEvent: input.lifecycleStateAtEvent,
        summary: input.summary,
        parentEventId: input.parentEventId,
        permissionContext: input.permissionContext
      }
    });
  }

  static prospectCreated(input) {
    return EventFactory.create({
      eventType: LEAD_EVENTS.PROSPECT_CREATED,
      prospectId: input.prospectId,
      actor: input.actor,
      channel: input.channel || "api",
      payload: {
        leadSource: input.leadSource,
        createdBy: input.createdBy || input.actor,
        ...(input.payload || {})
      },
      version: input.version,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: {
        ...buildMetadata(input),
        summary: input.summary || "Lead created"
      }
    });
  }

  static prospectUpdated(input) {
    return EventFactory.create({
      eventType: LEAD_EVENTS.PROSPECT_UPDATED,
      prospectId: input.prospectId,
      actor: input.actor,
      channel: input.channel || "api",
      payload: {
        changedFields: input.changedFields || [],
        ...(input.payload || {})
      },
      version: input.version,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: {
        ...buildMetadata(input),
        summary: input.summary || "Prospect updated"
      }
    });
  }

  static prospectAssigned(input) {
    return EventFactory.create({
      eventType: LEAD_EVENTS.PROSPECT_ASSIGNED,
      prospectId: input.prospectId,
      actor: input.actor,
      channel: input.channel || "api",
      payload: {
        assignedAgentId: input.assignedAgentId,
        assignmentReason: input.assignmentReason ?? null,
        ...(input.payload || {})
      },
      version: input.version,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: {
        ...buildMetadata(input),
        summary: input.summary || "Prospect assigned"
      }
    });
  }

  static prospectArchived(input) {
    return EventFactory.create({
      eventType: LEAD_EVENTS.PROSPECT_ARCHIVED,
      prospectId: input.prospectId,
      actor: input.actor,
      channel: input.channel || "api",
      payload: {
        archivedBy: input.archivedBy || input.actor,
        archiveReason: input.archiveReason ?? null,
        ...(input.payload || {})
      },
      version: input.version,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: {
        ...buildMetadata(input),
        summary: input.summary || "Prospect archived"
      }
    });
  }

  static prospectRestored(input) {
    return EventFactory.create({
      eventType: LEAD_EVENTS.PROSPECT_RESTORED,
      prospectId: input.prospectId,
      actor: input.actor,
      channel: input.channel || "api",
      payload: {
        restoredBy: input.restoredBy || input.actor,
        ...(input.payload || {})
      },
      version: input.version,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: {
        ...buildMetadata(input),
        summary: input.summary || "Prospect restored"
      }
    });
  }

  static prospectMerged(input) {
    return EventFactory.create({
      eventType: LEAD_EVENTS.PROSPECT_MERGED,
      prospectId: input.prospectId,
      actor: input.actor,
      channel: input.channel || "api",
      payload: {
        survivorId: input.survivorId,
        mergedId: input.mergedId,
        ...(input.payload || {})
      },
      version: input.version,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: {
        ...buildMetadata(input),
        summary: input.summary || "Prospect merged"
      }
    });
  }

  /**
   * Map a legacy emit envelope to the correct factory method.
   * @param {Object} event
   * @returns {BusinessEvent}
   */
  static fromProspectEmit(event) {
    const base = {
      prospectId: event.prospectId,
      actor: event.actor,
      channel: event.channel || "api",
      version: event.version,
      correlationId: event.correlationId,
      causationId: event.causationId,
      organizationId: event.organizationId,
      lifecycleStateAtEvent: event.lifecycleStateAtEvent,
      summary: event.summary,
      parentEventId: event.parentEventId,
      permissionContext: event.permissionContext
    };

    switch (event.eventType) {
      case LEAD_EVENTS.PROSPECT_CREATED:
        return EventFactory.prospectCreated({
          ...base,
          leadSource: event.payload?.leadSource,
          createdBy: event.payload?.createdBy,
          payload: event.payload
        });

      case LEAD_EVENTS.PROSPECT_UPDATED:
        return EventFactory.prospectUpdated({
          ...base,
          changedFields: event.payload?.changedFields,
          payload: event.payload
        });

      case LEAD_EVENTS.PROSPECT_ASSIGNED:
        return EventFactory.prospectAssigned({
          ...base,
          assignedAgentId: event.payload?.assignedAgentId,
          assignmentReason: event.payload?.assignmentReason,
          payload: event.payload
        });

      case LEAD_EVENTS.PROSPECT_ARCHIVED:
        return EventFactory.prospectArchived({
          ...base,
          archivedBy: event.payload?.archivedBy,
          archiveReason: event.payload?.archiveReason,
          payload: event.payload
        });

      case LEAD_EVENTS.PROSPECT_RESTORED:
        return EventFactory.prospectRestored({
          ...base,
          restoredBy: event.payload?.restoredBy,
          payload: event.payload
        });

      case LEAD_EVENTS.PROSPECT_MERGED:
        return EventFactory.prospectMerged({
          ...base,
          survivorId: event.payload?.survivorId,
          mergedId: event.payload?.mergedId,
          payload: event.payload
        });

      default:
        return EventFactory.fromEnvelope(event);
    }
  }
}

module.exports = {
  EventFactory
};
