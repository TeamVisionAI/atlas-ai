/**
 * Sprint 14.2 — Persistence mapper for BusinessEvent aggregate.
 */

const { BusinessEvent } = require("../../domain/BusinessEvent");
const { DEFAULT_ORGANIZATION_ID } = require("../../domain/EventMetadata");

const TABLE_NAME = "atlas_business_events";

function fromRow(row) {
  if (!row) {
    return null;
  }

  return BusinessEvent.reconstitute({
    eventId: row.id,
    eventType: row.event_type,
    timestamp: row.timestamp,
    prospectId: row.prospect_id,
    actor: row.actor,
    channel: row.channel,
    payload: row.payload || {},
    version: row.version,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    metadata: {
      organizationId: row.organization_id || row.metadata?.organizationId,
      lifecycleStateAtEvent: row.metadata?.lifecycleStateAtEvent ?? null,
      summary: row.metadata?.summary ?? null,
      parentEventId: row.metadata?.parentEventId ?? null,
      permissionContext: row.metadata?.permissionContext ?? null
    },
    createdAt: row.created_at
  });
}

function toInsertRow(event) {
  const json = event.toJSON();

  return {
    id: json.eventId,
    organization_id: json.metadata.organizationId || DEFAULT_ORGANIZATION_ID,
    event_type: json.eventType,
    timestamp: json.timestamp,
    prospect_id: json.prospectId,
    actor: json.actor,
    channel: json.channel,
    payload: json.payload,
    version: json.version,
    correlation_id: json.correlationId,
    causation_id: json.causationId,
    metadata: json.metadata,
    created_at: json.createdAt
  };
}

function toReadModel(event) {
  return event.toJSON();
}

module.exports = {
  TABLE_NAME,
  fromRow,
  toInsertRow,
  toReadModel
};
